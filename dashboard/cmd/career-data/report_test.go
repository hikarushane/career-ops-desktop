package main

import (
	"errors"
	"strings"
	"testing"
)

func TestRunReportReadsMarkdownAndSummary(t *testing.T) {
	res, err := runReport("testdata/career-ops", "reports/001-offerpad-2026-07-01.md")
	if err != nil {
		t.Fatalf("runReport: %v", err)
	}
	if !strings.Contains(res.Markdown, "Block A — Role Summary") {
		t.Errorf("Markdown does not contain the report body")
	}
	if res.Archetype != "Platform / Infra" {
		t.Errorf("Archetype = %q, want %q", res.Archetype, "Platform / Infra")
	}
	if res.Remote != "Remote (EU)" {
		t.Errorf("Remote = %q, want %q", res.Remote, "Remote (EU)")
	}
}

func TestRunReportRejectsEscapingPath(t *testing.T) {
	for _, rel := range []string{
		"../../../etc/passwd",
		"reports/../../go.mod",
		"/etc/passwd",
	} {
		if _, err := runReport("testdata/career-ops", rel); !errors.Is(err, errPathEscape) {
			t.Errorf("runReport(%q) error = %v, want errPathEscape", rel, err)
		}
	}
}

func TestRunReportMissingFile(t *testing.T) {
	if _, err := runReport("testdata/career-ops", "reports/999-nope.md"); err == nil {
		t.Error("runReport for a missing file returned nil error")
	} else if errors.Is(err, errPathEscape) {
		t.Error("a missing file was reported as a path escape")
	}
}
