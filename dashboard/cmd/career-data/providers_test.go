package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// The sidecar must not carry an install command any more. Installation is the
// desktop app's job (desktop/src-tauri/src/provider_install.rs opens a visible
// terminal with the vendor's official installer); a second copy here would be
// a second source of truth for what the user is told to run.
func TestProviderEntryHasNoInstallCommand(t *testing.T) {
	blob, err := json.Marshal(runProviders())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	for _, forbidden := range []string{"installCmd", "npm install"} {
		if strings.Contains(string(blob), forbidden) {
			t.Errorf("providers JSON still mentions %q: %s", forbidden, blob)
		}
	}
}

// The hint is what the user is told to type after installing, so it has to be
// a command that actually exists: `claude login` is not one (`claude auth
// login` is), and `codex` alone opens the TUI rather than the sign-in flow.
func TestAuthHintsAreTheRealLoginCommands(t *testing.T) {
	want := map[string]string{
		"claude": "Open Terminal and run: claude auth login",
		"codex":  "Open Terminal and run: codex login",
		"agy":    "Open Terminal and run: agy",
	}
	seen := map[string]bool{}
	for _, spec := range knownProviders {
		expected, known := want[spec.id]
		if !known {
			t.Fatalf("unexpected provider id %q", spec.id)
		}
		if spec.authHint != expected {
			t.Errorf("%s authHint = %q, want %q", spec.id, spec.authHint, expected)
		}
		if spec.website == "" {
			t.Errorf("%s has no website fallback", spec.id)
		}
		seen[spec.id] = true
	}
	for id := range want {
		if !seen[id] {
			t.Errorf("provider %q is missing from knownProviders", id)
		}
	}
}
