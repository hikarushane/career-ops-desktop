package main

import (
	"context"
	"os/exec"
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
}

type ProvidersResult struct {
	OK        bool            `json:"ok"`
	Providers []ProviderEntry `json:"providers"`
}

type providerSpec struct {
	id          string
	displayName string
	binary      string
	headlessCmd string
	versionArgs []string
}

var knownProviders = []providerSpec{
	{"claude", "Claude Code", "claude", "claude -p", []string{"--version"}},
	{"codex", "Codex", "codex", "codex exec", []string{"--version"}},
	{"opencode", "OpenCode", "opencode", "opencode run", []string{"--version"}},
	{"copilot", "Copilot CLI", "copilot", "copilot -p", []string{"--version"}},
	{"qwen", "Qwen", "qwen", "qwen -p", []string{"--version"}},
	{"agy", "Antigravity CLI", "agy", "agy -p", []string{"--version"}},
	{"grok", "Grok Build CLI", "grok", "grok -p", []string{"--version"}},
}

func runProviders() ProvidersResult {
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
