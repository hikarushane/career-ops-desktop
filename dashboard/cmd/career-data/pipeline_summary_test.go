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
