package main

import (
	"encoding/json"
	"errors"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestNodeJSONResultIgnoresSuccessfulJitlessWarning(t *testing.T) {
	got, err := nodeJSONResult("profile-language.mjs", []byte(`{"ok":true}`), []byte("Warning: disabling flag --expose_wasm\n"), nil)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != `{"ok":true}` {
		t.Fatalf("got %s", got)
	}
}

func TestNodeJSONResultIncludesFailureStderr(t *testing.T) {
	_, err := nodeJSONResult("profile-language.mjs", nil, []byte("invalid profile\n"), errors.New("exit status 1"))
	if err == nil || !strings.Contains(err.Error(), "invalid profile") {
		t.Fatalf("got %v, want stderr diagnostic", err)
	}
}

func careerOpsRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	return root
}

func useTestNode(t *testing.T) {
	t.Helper()
	path, err := exec.LookPath("node")
	if err != nil {
		t.Fatal(err)
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		t.Fatal(err)
	}
	original := managedNodeRuntime
	originalScripts := managedWorkspaceScripts
	managedNodeRuntime = func() (string, error) { return abs, nil }
	managedWorkspaceScripts = func() (string, error) { return careerOpsRoot(t), nil }
	t.Cleanup(func() {
		managedNodeRuntime = original
		managedWorkspaceScripts = originalScripts
	})
}

func TestManagedNodePathUsesPackagedSibling(t *testing.T) {
	got := managedNodePath("/Applications/CareerOps.app/Contents/MacOS/career-data", "darwin")
	want := "/Applications/CareerOps.app/Contents/MacOS/careerops-node"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestManagedScriptRootUsesPackagedResourceLayout(t *testing.T) {
	executable := "/Applications/CareerOps.app/Contents/MacOS/career-data"
	want := "/Applications/CareerOps.app/Contents/Resources/workspace-seed"
	if got := managedScriptRoot(executable, "darwin"); got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestRunProfileLanguageReturnsSettings(t *testing.T) {
	useTestNode(t)
	payload, err := runProfileLanguage(careerOpsRoot(t), "--settings")
	if err != nil {
		t.Fatal(err)
	}

	var got map[string]any
	if err := json.Unmarshal(payload, &got); err != nil {
		t.Fatal(err)
	}
	analysisLanguage, _ := got["analysisLanguage"].(string)
	options, _ := got["options"].([]any)
	if analysisLanguage == "" || len(options) == 0 {
		t.Fatalf("settings = %#v, want language and options", got)
	}
}

func TestRunJobLanguageResolvesJobText(t *testing.T) {
	useTestNode(t)
	payload, err := runJobLanguage(careerOpsRoot(t), "Wir suchen eine erfahrene Person mit Erfahrung in unserem Team und unseren Aufgaben.")
	if err != nil {
		t.Fatal(err)
	}

	var got map[string]any
	if err := json.Unmarshal(payload, &got); err != nil {
		t.Fatal(err)
	}
	if got["language"] != "de" || got["source"] != "jd-text" {
		t.Fatalf("resolution = %#v, want German JD text", got)
	}
}
