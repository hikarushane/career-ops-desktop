package main

import (
	"os"
	"path/filepath"
	"strings"
)

// PipelineSummary counts the pending, processed, and failed markers in
// data/pipeline.md, independent of the section headings' language.
type PipelineSummary struct {
	Pending   int `json:"pending"`
	Processed int `json:"processed"`
	Failed    int `json:"failed"`
}

// summarizePipeline reads data/pipeline.md under root and tallies its
// checkbox markers. A missing file yields a zero-value summary.
func summarizePipeline(root string) PipelineSummary {
	var s PipelineSummary
	b, err := os.ReadFile(filepath.Join(root, "data", "pipeline.md"))
	if err != nil {
		return s
	}
	for _, line := range strings.Split(string(b), "\n") {
		t := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(t, "- [ ]"):
			s.Pending++
		case strings.HasPrefix(t, "- [!]"):
			s.Failed++
		case strings.HasPrefix(t, "- [x]"), strings.HasPrefix(t, "- [X]"):
			s.Processed++
		}
	}
	return s
}
