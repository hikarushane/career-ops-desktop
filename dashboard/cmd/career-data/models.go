// models lists candidate AI models per provider and, when asked, probes
// which ones the user's own account can actually use. "agy" (Antigravity
// CLI) already exposes a real model list via `agy models`, so that provider
// is trusted as-is; "claude" and "codex" have no such listing command, so a
// fixed candidate set is probed live instead.
package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ModelEntry is one selectable model for a provider. Available is a
// pointer so "never probed" (nil) is distinguishable from "probed and
// found available/unavailable" (true/false) in the JSON output.
type ModelEntry struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Available *bool  `json:"available"`
	Fast      bool   `json:"fast"`
}

// ModelsResult is the JSON shape returned by `models --provider <id>`.
type ModelsResult struct {
	OK       bool         `json:"ok"`
	Provider string       `json:"provider"`
	Models   []ModelEntry `json:"models"`
	ProbedAt string       `json:"probedAt,omitempty"`
}

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
// candidate even when it isn't in the fixed codex list above. It never
// returns anything beyond that single value.
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
		if strings.HasPrefix(strings.TrimSpace(line), "model") {
			if _, v, ok := strings.Cut(line, "="); ok {
				return strings.Trim(strings.TrimSpace(v), `"`)
			}
		}
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

// probeModel asks whether id is actually usable on the user's account for
// provider, by making one minimal live call through run. claude reports
// success/failure structurally in its JSON result's is_error field; codex
// has no equivalent, so an unsupported/unknown model is inferred from the
// process failing along with a recognizable error shape on stderr.
func probeModel(ctx context.Context, provider, id string, run commandRunner) bool {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	switch provider {
	case "claude":
		out, _, _ := run(ctx, "claude", "-p", "--model", id, "--max-turns", "1", "--output-format", "json", "--setting-sources", "project", "--strict-mcp-config", "reply ok")
		var res struct {
			IsError *bool `json:"is_error"`
		}
		if json.Unmarshal([]byte(lastJSONLine(out)), &res) != nil || res.IsError == nil {
			return false
		}
		return !*res.IsError
	case "codex":
		_, stderr, err := run(ctx, "codex", "exec", "--skip-git-repo-check", "-m", id, "reply ok")
		if err == nil {
			return true
		}
		return !strings.Contains(stderr, "not supported") && !strings.Contains(stderr, `"status":400`) && !strings.Contains(stderr, `"status":404`)
	}
	return false
}

// runModels is the models command's implementation. "agy" is handled
// separately because `agy models` already returns the real, definitive
// list — there is nothing to probe. For "claude"/"codex", the fixed
// candidate set is returned as-is, or probed concurrently (one goroutine
// per candidate) when probe is true.
func runModels(provider string, probe bool, run commandRunner) ModelsResult {
	augmentUserPATH()
	res := ModelsResult{OK: true, Provider: provider}
	if provider == "agy" {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		out, _, _ := run(ctx, "agy", "models")
		res.Models = parseAgyModels(out)
		yes := true
		for i := range res.Models {
			res.Models[i].Available = &yes
		}
		res.ProbedAt = time.Now().UTC().Format(time.RFC3339)
		return res
	}
	res.Models = candidateModels(provider)
	if probe {
		var wg sync.WaitGroup
		for i := range res.Models {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				ok := probeModel(context.Background(), provider, res.Models[i].ID, run)
				res.Models[i].Available = &ok
			}(i)
		}
		wg.Wait()
		res.ProbedAt = time.Now().UTC().Format(time.RFC3339)
	}
	return res
}
