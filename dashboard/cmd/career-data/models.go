// models lists candidate AI models per provider and, when asked, probes
// which ones the user's own account can actually use. "agy" (Antigravity
// CLI) already exposes a real model list via `agy models`, so that provider
// is trusted as-is; "claude" and "codex" have no such listing command, so a
// fixed candidate set is probed live instead.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ModelEntry is one selectable model for a provider. Available is a
// pointer so "never probed" (nil) is distinguishable from "probed and
// conclusively found available/unavailable" (true/false); an inconclusive
// probe (rate limit, timeout, unrecognized failure) also stays nil, because
// it is not evidence the model is unusable.
type ModelEntry struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Available *bool  `json:"available"`
	Fast      bool   `json:"fast"`
}

// ModelsResult is the JSON shape returned by `models --provider <id>`.
// Models is always a non-nil (possibly empty) slice so it serializes as
// `[]`, never JSON `null`, matching the desktop API's `ModelEntry[]` type.
type ModelsResult struct {
	OK       bool         `json:"ok"`
	Provider string       `json:"provider"`
	Models   []ModelEntry `json:"models"`
	ProbedAt string       `json:"probedAt,omitempty"`
}

// modelsError carries a machine-readable code alongside the human message,
// mirroring fetchError, so main.go's dispatch can map it straight onto
// fail(code, message).
type modelsError struct{ code, message string }

func (e *modelsError) Error() string { return e.code + ": " + e.message }

// commandRunner abstracts process execution so tests can fake CLI output
// without ever invoking a real provider CLI.
type commandRunner func(ctx context.Context, name string, args ...string) (stdout, stderr string, err error)

// execRunner is the production commandRunner: it actually runs name/args.
func execRunner(ctx context.Context, name string, args ...string) (string, string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var out, errb strings.Builder
	cmd.Stdout, cmd.Stderr = &out, &errb
	err := cmd.Run()
	return out.String(), errb.String(), err
}

// candidateModels returns the fixed set of models career-ops offers for a
// provider that has no listing command of its own. codexConfiguredModel is
// prepended when it names a model not already in the list, so a user's own
// ~/.codex/config.toml choice is always selectable even if it predates this
// list.
func candidateModels(provider string) []ModelEntry {
	switch provider {
	case "claude":
		return []ModelEntry{
			{ID: "fable", Label: "Fable (latest)"},
			{ID: "opus", Label: "Opus (latest)", Fast: true},
			{ID: "sonnet", Label: "Sonnet (latest)"},
			{ID: "haiku", Label: "Haiku (latest)"},
		}
	case "codex":
		list := []ModelEntry{
			{ID: "gpt-5.4-codex", Label: "GPT-5.4 Codex"},
			{ID: "gpt-5.4", Label: "GPT-5.4"},
			{ID: "gpt-5.3-codex", Label: "GPT-5.3 Codex"},
		}
		if m := codexConfiguredModel(); m != "" && !containsID(list, m) {
			list = append([]ModelEntry{{ID: m, Label: m + " (from config)"}}, list...)
		}
		return list
	}
	return nil
}

// containsID reports whether list already has an entry with the given id.
func containsID(list []ModelEntry, id string) bool {
	for _, m := range list {
		if m.ID == id {
			return true
		}
	}
	return false
}

// lastJSONLine returns the last non-empty line of out that looks like a
// JSON object, so trailing log noise around `claude`'s one JSON result line
// doesn't break parsing.
func lastJSONLine(out string) string {
	lines := strings.Split(strings.TrimSpace(out), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if strings.HasPrefix(strings.TrimSpace(lines[i]), "{") {
			return lines[i]
		}
	}
	return ""
}

// codexConfiguredModel reads the `model` key out of ~/.codex/config.toml,
// if present, so the user's own configured default is always offered as a
// candidate even when it isn't in the fixed codex list above. It requires
// an exact "model" key match (after trimming whitespace around the `=`) so
// a similarly-prefixed key such as `model_reasoning_effort` is never
// mistaken for it, and skips comment lines. It never returns anything
// beyond that single value.
func codexConfiguredModel() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	b, err := os.ReadFile(filepath.Join(home, ".codex", "config.toml"))
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(b), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		key, v, ok := strings.Cut(trimmed, "=")
		if !ok || strings.TrimSpace(key) != "model" {
			continue
		}
		return strings.Trim(strings.TrimSpace(v), `"`)
	}
	return ""
}

// parseAgyModels parses `agy models` output: a "Fetching..." banner line
// followed by tab-separated id/label rows.
func parseAgyModels(out string) []ModelEntry {
	var list []ModelEntry
	for _, line := range strings.Split(out, "\n") {
		id, label, ok := strings.Cut(line, "\t")
		if !ok || strings.TrimSpace(id) == "" {
			continue
		}
		list = append(list, ModelEntry{ID: strings.TrimSpace(id), Label: strings.TrimSpace(label)})
	}
	return list
}

// ptrBool returns a pointer to a copy of b, for building the tri-state
// *bool probeModel/Available values from a literal.
func ptrBool(b bool) *bool { return &b }

// probeModel asks whether id is actually usable on the user's account for
// provider, by making one minimal live call through run. The result is
// tri-state: true means the probe conclusively found the model usable,
// false means it conclusively found it rejected, and nil means the probe
// was inconclusive (timeout, unrecognized failure shape, rate limiting) —
// which must never be reported as "unavailable", since that would tell the
// user a perfectly good model doesn't exist.
//
// claude reports success/failure structurally in its JSON result: an
// is_error:false result is conclusive success; is_error:true with
// api_error_status:404 (unknown model) is conclusive rejection; anything
// else (no parseable JSON, a different error status, a timed-out call with
// no output) is inconclusive.
//
// codex has no equivalent structured signal: a clean exit is conclusive
// success; a failure whose stderr names an unsupported/unknown model is
// conclusive rejection; any other failure (missing binary, not logged in,
// network error, timeout) is inconclusive.
func probeModel(ctx context.Context, provider, id string, run commandRunner) *bool {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	switch provider {
	case "claude":
		out, _, _ := run(ctx, "claude", "-p", "--model", id, "--max-turns", "1", "--output-format", "json", "--setting-sources", "project", "--strict-mcp-config", "reply ok")
		var res struct {
			IsError        *bool `json:"is_error"`
			APIErrorStatus int   `json:"api_error_status"`
		}
		line := lastJSONLine(out)
		if line == "" || json.Unmarshal([]byte(line), &res) != nil || res.IsError == nil {
			return nil
		}
		if !*res.IsError {
			return ptrBool(true)
		}
		if res.APIErrorStatus == 404 {
			return ptrBool(false)
		}
		return nil
	case "codex":
		_, stderr, err := run(ctx, "codex", "exec", "--skip-git-repo-check", "-m", id, "reply ok")
		if err == nil {
			return ptrBool(true)
		}
		if strings.Contains(stderr, "not supported") || strings.Contains(stderr, `"status":400`) || strings.Contains(stderr, `"status":404`) {
			return ptrBool(false)
		}
		return nil
	}
	return nil
}

// runModels is the models command's implementation. "agy" is handled
// separately because `agy models` already returns the real, definitive
// list — there is nothing to probe, but a failure there (missing binary,
// not logged in, network error, or an empty parse) means career-ops has no
// list at all and must say so, rather than silently reporting zero models
// as success. For "claude"/"codex", the fixed candidate set is returned
// as-is, or probed concurrently (one goroutine per candidate) when probe is
// true. An unrecognized provider is also an error, never a silent empty
// result.
func runModels(provider string, probe bool, run commandRunner) (ModelsResult, error) {
	augmentUserPATH()
	res := ModelsResult{OK: true, Provider: provider, Models: []ModelEntry{}}

	switch provider {
	case "agy":
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		out, stderr, err := run(ctx, "agy", "models")
		rows := parseAgyModels(out)
		if err != nil {
			msg := "agy models failed: " + err.Error()
			if s := strings.TrimSpace(stderr); s != "" {
				msg += ": " + s
			}
			return ModelsResult{}, &modelsError{"provider", msg}
		}
		if len(rows) == 0 {
			msg := "agy models returned no models"
			if s := strings.TrimSpace(stderr); s != "" {
				msg += ": " + s
			}
			return ModelsResult{}, &modelsError{"provider", msg}
		}
		yes := true
		for i := range rows {
			rows[i].Available = &yes
		}
		res.Models = rows
		res.ProbedAt = time.Now().UTC().Format(time.RFC3339)
		return res, nil

	case "claude", "codex":
		if list := candidateModels(provider); list != nil {
			res.Models = list
		}
		if probe {
			var wg sync.WaitGroup
			for i := range res.Models {
				wg.Add(1)
				go func(i int) {
					defer wg.Done()
					res.Models[i].Available = probeModel(context.Background(), provider, res.Models[i].ID, run)
				}(i)
			}
			wg.Wait()
			res.ProbedAt = time.Now().UTC().Format(time.RFC3339)
		}
		return res, nil

	default:
		return ModelsResult{}, &modelsError{"usage", fmt.Sprintf("unknown provider: %s", provider)}
	}
}
