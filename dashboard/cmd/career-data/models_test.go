package main

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestParseAgyModels(t *testing.T) {
	out := "Fetching available models...\ngemini-3.1-pro-high\tGemini 3.1 Pro (High)\nclaude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)\n"
	got := parseAgyModels(out)
	if len(got) != 2 || got[0].ID != "gemini-3.1-pro-high" || got[1].Label != "Claude Opus 4.6 (Thinking)" {
		t.Fatalf("%+v", got)
	}
}

func TestCandidateModelsMarkOpusAsFast(t *testing.T) {
	models := candidateModels("claude")
	var opus *ModelEntry
	for i := range models {
		if models[i].ID == "opus" {
			m := models[i]
			opus = &m
		}
	}
	if opus == nil || !opus.Fast {
		t.Fatal("opus should be fast-capable")
	}
}

func TestProbeUsesResultIsError(t *testing.T) {
	fake := func(_ context.Context, name string, args ...string) (string, string, error) {
		if strings.Contains(strings.Join(args, " "), "haiku") {
			return `{"type":"result","is_error":false}`, "", nil
		}
		return `{"type":"result","is_error":true,"api_error_status":404}`, "", nil
	}
	if !probeModel(context.Background(), "claude", "haiku", fake) {
		t.Fatal("haiku should be available")
	}
	if probeModel(context.Background(), "claude", "bogus", fake) {
		t.Fatal("bogus should be unavailable")
	}
	codex := func(_ context.Context, _ string, _ ...string) (string, string, error) {
		return "", `ERROR: {"status":400,"message":"model is not supported"}`, errors.New("exit 1")
	}
	if probeModel(context.Background(), "codex", "gpt-x", codex) {
		t.Fatal("codex unsupported model should be unavailable")
	}
}
