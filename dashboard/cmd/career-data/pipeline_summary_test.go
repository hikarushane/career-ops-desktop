package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSummarizePipelineCountsMarkersInAnyLanguage(t *testing.T) {
	root := t.TempDir()
	_ = os.MkdirAll(filepath.Join(root, "data"), 0o755)
	body := "## Pendientes\n- [ ] https://a\n- [ ] https://b | Acme | PM | Berlin\n- [!] https://c — login\n## Procesadas\n- [x] #1 | https://d\n"
	_ = os.WriteFile(filepath.Join(root, "data", "pipeline.md"), []byte(body), 0o644)
	got := summarizePipeline(root)
	if got.Pending != 2 || got.Failed != 1 || got.Processed != 1 {
		t.Fatalf("%+v", got)
	}
	if empty := summarizePipeline(t.TempDir()); empty.Pending != 0 {
		t.Fatalf("%+v", empty)
	}
}

func TestParseInboxReturnsUnprocessedEntriesWithMetadata(t *testing.T) {
	root := t.TempDir()
	_ = os.MkdirAll(filepath.Join(root, "data"), 0o755)
	body := "## Pending\n" +
		"- [ ] https://a | n8n | Head of Solutions | Berlin · Remote | posted: 2026-07-28\n" +
		"- [ ] https://b | Acme | PM\n" +
		"- [!] https://c | Broken Co | Eng | Hamburg | note: login wall\n" +
		"- [ ] https://d | OnlyTwo\n" +
		"## Processed\n- [x] #1 | https://e | Done Co | Role\n"
	_ = os.WriteFile(filepath.Join(root, "data", "pipeline.md"), []byte(body), 0o644)

	got := parseInbox(root)
	if len(got) != 3 {
		t.Fatalf("want 3 entries (processed and malformed rows skipped), got %d: %+v", len(got), got)
	}
	first := got[0]
	if first.URL != "https://a" || first.Company != "n8n" || first.Role != "Head of Solutions" ||
		first.Location != "Berlin · Remote" || first.PostedAt != "2026-07-28" || first.State != "pending" {
		t.Fatalf("%+v", first)
	}
	if got[1].Location != "" || got[1].PostedAt != "" {
		t.Fatalf("optional columns must stay empty: %+v", got[1])
	}
	if got[2].State != "failed" || got[2].Location != "Hamburg" {
		t.Fatalf("labeled segment must not become location: %+v", got[2])
	}
	if empty := parseInbox(t.TempDir()); len(empty) != 0 {
		t.Fatalf("%+v", empty)
	}
}
