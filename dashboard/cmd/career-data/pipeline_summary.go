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

// InboxEntry is one unprocessed data/pipeline.md row — a posting the scanner
// found that no evaluation has turned into a tracker row yet.
type InboxEntry struct {
	URL      string `json:"url"`
	Company  string `json:"company"`
	Role     string `json:"role"`
	Location string `json:"location"`
	PostedAt string `json:"postedAt"`
	State    string `json:"state"` // "pending" | "failed"
}

// parseInbox reads the `- [ ]` and `- [!]` rows of data/pipeline.md:
// `URL | Company | Role [| Location [| Compensation]] [| label: value]*`.
// The first three columns are positional; from the fourth on, a `label:`
// segment (posted:, note:, trust:, …) is metadata and must not shift the
// positional columns — mirrors web/src/lib/career-ops.ts readInbox. Rows
// with fewer than three positional columns are skipped. A missing file
// yields nil.
func parseInbox(root string) []InboxEntry {
	b, err := os.ReadFile(filepath.Join(root, "data", "pipeline.md"))
	if err != nil {
		return nil
	}
	out := []InboxEntry{}
	for _, line := range strings.Split(string(b), "\n") {
		t := strings.TrimSpace(line)
		var state string
		switch {
		case strings.HasPrefix(t, "- [ ]"):
			state = "pending"
		case strings.HasPrefix(t, "- [!]"):
			state = "failed"
		default:
			continue
		}
		var positional []string
		labels := map[string]string{}
		for i, seg := range strings.Split(t[len("- [ ]"):], "|") {
			seg = strings.TrimSpace(seg)
			if label, value, ok := labeledSegment(seg); ok && i >= 3 {
				labels[label] = value
				continue
			}
			positional = append(positional, seg)
		}
		if len(positional) < 3 || positional[0] == "" {
			continue
		}
		e := InboxEntry{URL: positional[0], Company: positional[1], Role: positional[2], State: state}
		if len(positional) > 3 {
			e.Location = positional[3]
		}
		if p := labels["posted"]; len(p) == 10 && p[4] == '-' && p[7] == '-' {
			e.PostedAt = p
		}
		out = append(out, e)
	}
	return out
}

// labeledSegment splits `label: value` where label is [a-z][a-z_-]*
// (case-insensitive). Returns ok=false for anything else, including URLs,
// whose "https:" prefix is followed by "//" rather than a space or value —
// though URLs sit at position 0 and are never tested anyway.
func labeledSegment(seg string) (label, value string, ok bool) {
	colon := strings.IndexByte(seg, ':')
	if colon <= 0 {
		return "", "", false
	}
	for i := 0; i < colon; i++ {
		c := seg[i]
		lower := c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'
		if i == 0 && !lower {
			return "", "", false
		}
		if !lower && c != '_' && c != '-' {
			return "", "", false
		}
	}
	return strings.ToLower(seg[:colon]), strings.TrimSpace(seg[colon+1:]), true
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
