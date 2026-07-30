package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeTracker builds a career-ops root with a tracker whose lines are joined
// by term, and returns the root and the tracker path.
func writeTracker(t *testing.T, term string, rows ...string) (string, string) {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, "data")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	lines := append([]string{
		"# Applications Tracker",
		"",
		"| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
		"|---|------|---------|------|-------|--------|-----|--------|-------|",
	}, rows...)
	tracker := filepath.Join(dir, "applications.md")
	if err := os.WriteFile(tracker, []byte(strings.Join(lines, term)+term), 0o644); err != nil {
		t.Fatal(err)
	}
	return root, tracker
}

const offerpadRow = "| 1 | 2026-07-01 | Offerpad | Offer Engineer | 4.6/5 | Offer | ✅ | [001](reports/001.md) | Offer note |"
const acmeRow = "| 2 | 2026-07-02 | Acme | Backend | 4.0/5 | Applied | ❌ | [002](reports/002.md) | Interview soon |"

func TestSetStatusRewritesOnlyTheStatusCell(t *testing.T) {
	root, tracker := writeTracker(t, "\n", offerpadRow, acmeRow)

	res, err := setStatus(root, "002", "Applied", "Interview")
	if err != nil {
		t.Fatalf("setStatus: %v", err)
	}
	if res.OldStatus != "Applied" || res.NewStatus != "Interview" {
		t.Errorf("result = %+v, want Applied -> Interview", res)
	}

	got, err := os.ReadFile(tracker)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(string(got), "\n")
	if lines[4] != offerpadRow {
		t.Errorf("row 1 changed:\n got %q\nwant %q", lines[4], offerpadRow)
	}
	want := "| 2 | 2026-07-02 | Acme | Backend | 4.0/5 | Interview | ❌ | [002](reports/002.md) | Interview soon |"
	if lines[5] != want {
		t.Errorf("row 2:\n got %q\nwant %q", lines[5], want)
	}
}

func TestSetStatusDoesNotTouchCompanyNamedOffer(t *testing.T) {
	root, tracker := writeTracker(t, "\n", offerpadRow)

	if _, err := setStatus(root, "001", "Offer", "Rejected"); err != nil {
		t.Fatalf("setStatus: %v", err)
	}

	got, _ := os.ReadFile(tracker)
	if !strings.Contains(string(got), "| Offerpad | Offer Engineer |") {
		t.Errorf("the company or role cell was rewritten:\n%s", got)
	}
	if !strings.Contains(string(got), "| Rejected |") {
		t.Errorf("the status cell was not rewritten:\n%s", got)
	}
	if strings.Contains(string(got), "| Rejectedpad |") {
		t.Errorf("the replacement landed in the company cell:\n%s", got)
	}
}

func TestSetStatusPreservesCRLF(t *testing.T) {
	root, tracker := writeTracker(t, "\r\n", offerpadRow, acmeRow)

	if _, err := setStatus(root, "002", "Applied", "Offer"); err != nil {
		t.Fatalf("setStatus: %v", err)
	}

	got, _ := os.ReadFile(tracker)
	if strings.Contains(strings.ReplaceAll(string(got), "\r\n", ""), "\n") {
		t.Errorf("a bare LF appeared; line endings were normalized")
	}
	if !strings.Contains(string(got), "| Offer | ❌ |") {
		t.Errorf("status not written:\n%q", got)
	}
}

func TestSetStatusOptimisticLock(t *testing.T) {
	root, tracker := writeTracker(t, "\n", acmeRow)
	before, _ := os.ReadFile(tracker)

	_, err := setStatus(root, "002", "Evaluated", "Interview")

	var stale *staleError
	if !errors.As(err, &stale) {
		t.Fatalf("error = %v, want *staleError", err)
	}
	if stale.Actual != "Applied" {
		t.Errorf("stale.Actual = %q, want %q", stale.Actual, "Applied")
	}

	after, _ := os.ReadFile(tracker)
	if string(after) != string(before) {
		t.Errorf("the file was modified despite the stale check")
	}
}

func TestSetStatusRejectsUnknownStatus(t *testing.T) {
	root, tracker := writeTracker(t, "\n", acmeRow)
	before, _ := os.ReadFile(tracker)

	if _, err := setStatus(root, "002", "Applied", "Ghosted"); !errors.Is(err, errInvalidStatus) {
		t.Fatalf("error = %v, want errInvalidStatus", err)
	}

	after, _ := os.ReadFile(tracker)
	if string(after) != string(before) {
		t.Errorf("the file was modified despite an invalid status")
	}
}

func TestSetStatusRowNotFound(t *testing.T) {
	root, _ := writeTracker(t, "\n", acmeRow)

	if _, err := setStatus(root, "999", "Applied", "Offer"); !errors.Is(err, errRowNotFound) {
		t.Fatalf("error = %v, want errRowNotFound", err)
	}
}

func TestSetStatusMatchesReportNumberInTheReportCellOnly(t *testing.T) {
	// The notes cell mentions [002]. Matching must key on cell 7.
	row := "| 3 | 2026-07-03 | Globex | Data | 3.5/5 | Evaluated | ❌ | [003](reports/003.md) | see [002] for context |"
	root, tracker := writeTracker(t, "\n", row, acmeRow)

	if _, err := setStatus(root, "002", "Applied", "Offer"); err != nil {
		t.Fatalf("setStatus: %v", err)
	}

	got, _ := os.ReadFile(tracker)
	lines := strings.Split(string(got), "\n")
	if lines[4] != row {
		t.Errorf("the Globex row was rewritten:\n got %q\nwant %q", lines[4], row)
	}
}

func TestSetStatusRejectsDuplicateReportNumber(t *testing.T) {
	dup := "| 3 | 2026-07-03 | Clone | SRE | 3.8/5 | Applied | ❌ | [002](reports/002-clone.md) | dup |"
	root, tracker := writeTracker(t, "\n", acmeRow, dup)
	before, _ := os.ReadFile(tracker)

	_, err := setStatus(root, "002", "Applied", "Interview")
	if !errors.Is(err, errAmbiguousRow) {
		t.Fatalf("error = %v, want errAmbiguousRow", err)
	}

	after, _ := os.ReadFile(tracker)
	if string(after) != string(before) {
		t.Errorf("the file was modified despite ambiguous report number")
	}
}

func TestSetStatusWritesBackup(t *testing.T) {
	root, tracker := writeTracker(t, "\n", acmeRow)
	before, _ := os.ReadFile(tracker)

	res, err := setStatus(root, "002", "Applied", "Offer")
	if err != nil {
		t.Fatalf("setStatus: %v", err)
	}

	backup := filepath.Join(root, filepath.FromSlash(res.Backup))
	got, err := os.ReadFile(backup)
	if err != nil {
		t.Fatalf("backup not written at %s: %v", backup, err)
	}
	if string(got) != string(before) {
		t.Errorf("backup does not match the pre-write file")
	}
}
