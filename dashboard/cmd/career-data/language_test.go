package main

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

func careerOpsRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	return root
}

func TestRunProfileLanguageReturnsSettings(t *testing.T) {
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
