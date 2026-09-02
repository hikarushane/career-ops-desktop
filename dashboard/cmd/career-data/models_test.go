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

// TestProbeUsesResultIsError covers the two conclusive claude outcomes: a
// clean is_error:false result (available), and an is_error:true result
// carrying api_error_status:404 (unknown model, unavailable).
func TestProbeUsesResultIsError(t *testing.T) {
	fake := func(_ context.Context, _ string, args ...string) (string, string, error) {
		if strings.Contains(strings.Join(args, " "), "haiku") {
			return `{"type":"result","is_error":false}`, "", nil
		}
		return `{"type":"result","is_error":true,"api_error_status":404}`, "", nil
	}
	if got := probeModel(context.Background(), "claude", "haiku", fake); got == nil || !*got {
		t.Fatalf("haiku should be conclusively available, got %v", got)
	}
	if got := probeModel(context.Background(), "claude", "bogus", fake); got == nil || *got {
		t.Fatalf("bogus (404) should be conclusively unavailable, got %v", got)
	}
}

// TestProbeClaudeInconclusiveCases covers claude outcomes that must never
// be reported as a conclusive true/false: a rate-limited response (a
// status other than 404) and an empty/unparseable response (e.g. from a
// timed-out call).
func TestProbeClaudeInconclusiveCases(t *testing.T) {
	rateLimited := func(_ context.Context, _ string, _ ...string) (string, string, error) {
		return `{"type":"result","is_error":true,"api_error_status":429}`, "", nil
	}
	if got := probeModel(context.Background(), "claude", "sonnet", rateLimited); got != nil {
		t.Fatalf("429 (rate limit) should be inconclusive (nil), got %v", *got)
	}

	empty := func(_ context.Context, _ string, _ ...string) (string, string, error) {
		return "", "", nil
	}
	if got := probeModel(context.Background(), "claude", "sonnet", empty); got != nil {
		t.Fatalf("empty stdout should be inconclusive (nil), got %v", *got)
	}
}

// TestProbeCodexSuccessIsAvailable: a clean codex exec exit is conclusive
// success.
func TestProbeCodexSuccessIsAvailable(t *testing.T) {
	fake := func(_ context.Context, _ string, _ ...string) (string, string, error) {
		return "ok", "", nil
	}
	if got := probeModel(context.Background(), "codex", "gpt-5.4", fake); got == nil || !*got {
		t.Fatalf("codex success should be conclusively available, got %v", got)
	}
}

// The three codex "unavailable" markers are asserted in isolation, one per
// test, so a passing test proves each marker alone is sufficient — not
// just that a fixture combining all three happens to work.

func TestProbeCodexNotSupportedMarker(t *testing.T) {
	fake := func(_ context.Context, _ string, _ ...string) (string, string, error) {
		return "", "model is not supported for this account", errors.New("exit 1")
	}
	if got := probeModel(context.Background(), "codex", "gpt-x", fake); got == nil || *got {
		t.Fatalf("'not supported' marker should be conclusively unavailable, got %v", got)
	}
}

func TestProbeCodexStatus400Marker(t *testing.T) {
	fake := func(_ context.Context, _ string, _ ...string) (string, string, error) {
		return "", `{"type":"error","status":400}`, errors.New("exit 1")
	}
	if got := probeModel(context.Background(), "codex", "gpt-x", fake); got == nil || *got {
		t.Fatalf("status 400 marker should be conclusively unavailable, got %v", got)
	}
}

func TestProbeCodexStatus404Marker(t *testing.T) {
	fake := func(_ context.Context, _ string, _ ...string) (string, string, error) {
		return "", `{"type":"error","status":404}`, errors.New("exit 1")
	}
	if got := probeModel(context.Background(), "codex", "gpt-x", fake); got == nil || *got {
		t.Fatalf("status 404 marker should be conclusively unavailable, got %v", got)
	}
}

// TestProbeCodexUnrelatedFailureIsInconclusive: a codex failure that
// matches none of the recognized markers (missing binary, not logged in,
// network error, timeout) must stay inconclusive, never reported as
// "unavailable".
func TestProbeCodexUnrelatedFailureIsInconclusive(t *testing.T) {
	fake := func(_ context.Context, _ string, _ ...string) (string, string, error) {
		return "", "connection reset by peer", errors.New("exit 1")
	}
	if got := probeModel(context.Background(), "codex", "gpt-5.4", fake); got != nil {
		t.Fatalf("unrelated codex failure should be inconclusive (nil), got %v", *got)
	}
}

func TestRunModels(t *testing.T) {
	agyFake := func(_ context.Context, _ string, _ ...string) (string, string, error) {
		return "Fetching available models...\nmodel-a\tModel A\nmodel-b\tModel B\n", "", nil
	}
	res, err := runModels("agy", false, agyFake)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.Models) != 2 {
		t.Fatalf("expected 2 agy models, got %+v", res.Models)
	}
	for _, m := range res.Models {
		if m.Available == nil || !*m.Available {
			t.Fatalf("expected agy model %q available, got %+v", m.ID, m)
		}
	}
	if res.ProbedAt == "" {
		t.Fatal("expected ProbedAt to be set for agy")
	}

	noopRun := func(_ context.Context, _ string, _ ...string) (string, string, error) {
		return "", "", nil
	}
	res, err = runModels("claude", false, noopRun)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Models == nil {
		t.Fatal("Models must never be nil")
	}
	if len(res.Models) != 4 {
		t.Fatalf("expected 4 claude candidates, got %+v", res.Models)
	}
	for _, m := range res.Models {
		if m.Available != nil {
			t.Fatalf("expected unprobed model %q to have nil Available, got %v", m.ID, *m.Available)
		}
	}
	if res.ProbedAt != "" {
		t.Fatalf("expected ProbedAt empty when not probing, got %q", res.ProbedAt)
	}

	agyErrRun := func(_ context.Context, _ string, _ ...string) (string, string, error) {
		return "", "not logged in", errors.New("exit 1")
	}
	if _, err := runModels("agy", false, agyErrRun); err == nil {
		t.Fatal("expected an error when agy models fails")
	}

	if _, err := runModels("nope", false, noopRun); err == nil {
		t.Fatal("expected an error for an unknown provider")
	}
}
