package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type ProviderState string

const (
	StateNotInstalled ProviderState = "not_installed"
	StateInstalled    ProviderState = "installed"
	StateReady        ProviderState = "ready"
	StateError        ProviderState = "error"
)

type ProviderEntry struct {
	ID          string        `json:"id"`
	DisplayName string        `json:"displayName"`
	Binary      string        `json:"binary"`
	HeadlessCmd string        `json:"headlessCmd"`
	State       ProviderState `json:"state"`
	Version     string        `json:"version,omitempty"`
	Path        string        `json:"path,omitempty"`
	Error       string        `json:"error,omitempty"`
	Website     string        `json:"website,omitempty"`
	AuthHint    string        `json:"authHint,omitempty"`
}

type ProvidersResult struct {
	OK        bool            `json:"ok"`
	Providers []ProviderEntry `json:"providers"`
}

// providerSpec carries detection data only. Installation is not a sidecar
// concern: the desktop app opens a visible terminal running the vendor's
// official installer (desktop/src-tauri/src/provider_install.rs owns that
// table), so there is deliberately no install command here to drift from it.
type providerSpec struct {
	id          string
	displayName string
	binary      string
	headlessCmd string
	versionArgs []string
	website     string
	authHint    string
}

var knownProviders = []providerSpec{
	{"claude", "Claude Code", "claude", "claude -p", []string{"--version"},
		"https://docs.anthropic.com/en/docs/claude-code/getting-started",
		"Open Terminal and run: claude auth login"},
	{"codex", "Codex", "codex", "codex exec", []string{"--version"},
		"https://github.com/openai/codex",
		"Open Terminal and run: codex login"},
	{"agy", "Antigravity CLI", "agy", "agy -p", []string{"--version"},
		"https://agentskills.io",
		"Open Terminal and run: agy"},
}

func augmentUserPATH() {
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	extraDirs := []string{
		filepath.Join(home, ".local", "bin"),
		"/usr/local/bin",
		"/opt/homebrew/bin",
		filepath.Join(home, ".cargo", "bin"),
		filepath.Join(home, "go", "bin"),
		filepath.Join(home, ".bun", "bin"),
	}
	current := os.Getenv("PATH")
	seen := make(map[string]bool)
	for _, d := range filepath.SplitList(current) {
		seen[d] = true
	}
	var add []string
	for _, d := range extraDirs {
		if seen[d] {
			continue
		}
		if info, err := os.Stat(d); err == nil && info.IsDir() {
			add = append(add, d)
		}
	}
	if len(add) > 0 {
		os.Setenv("PATH", strings.Join(add, string(os.PathListSeparator))+string(os.PathListSeparator)+current)
	}
}

func runProviders() ProvidersResult {
	augmentUserPATH()
	entries := make([]ProviderEntry, len(knownProviders))
	for i, spec := range knownProviders {
		entries[i] = detectProvider(spec)
	}
	return ProvidersResult{OK: true, Providers: entries}
}

func detectProvider(spec providerSpec) ProviderEntry {
	e := ProviderEntry{
		ID:          spec.id,
		DisplayName: spec.displayName,
		Binary:      spec.binary,
		HeadlessCmd: spec.headlessCmd,
		Website:     spec.website,
		AuthHint:    spec.authHint,
	}

	path, err := exec.LookPath(spec.binary)
	if err != nil {
		e.State = StateNotInstalled
		return e
	}
	e.Path = path

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, path, spec.versionArgs...)
	hideWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		e.State = StateError
		e.Error = err.Error()
		return e
	}

	version := strings.TrimSpace(string(out))
	if version != "" {
		e.Version = version
		e.State = StateReady
	} else {
		e.State = StateInstalled
	}
	return e
}
