package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/santifer/career-ops/dashboard/internal/data"
)

// parseOne runs the real ParseApplications over a tracker holding exactly one
// candidate row, and reports whether the parser accepted it plus the status it
// extracted. This is the oracle: rows.go must agree with it.
func parseOne(t *testing.T, row string) (accepted bool, status string) {
	t.Helper()
	root := t.TempDir()
	body := "# Applications Tracker\n\n" +
		"| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n" +
		"|---|------|---------|------|-------|--------|-----|--------|-------|\n" +
		row + "\n"
	if err := os.WriteFile(filepath.Join(root, "applications.md"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	apps := data.ParseApplications(root)
	if len(apps) == 0 {
		return false, ""
	}
	return true, apps[0].Status
}

func TestCellSpansAgreesWithParser(t *testing.T) {
	rows := []string{
		"| 1 | 2026-07-01 | Acme | Dev | 4.0/5 | Applied | ✅ | [002](reports/002.md) | n |",
		"| 1\t2026-07-01\tAcme\tDev\t4.0/5\tApplied\t❌\t[002](reports/002.md)\tn",
		"|\t1\t2026-07-01\tAcme\tDev\t4.0/5\tApplied\t❌\t[002](reports/002.md)\tn",
		"|  \t1\t2026-07-01\tAcme\tDev\t4.0/5\tApplied\t❌\t[002](reports/002.md)\tn",
		"| 1 | 2026-07-01 | Acme | Dev | 4.0/5 | Applied | ✅ | [002](reports/002.md) | n",
		"| 1 | 2026-07-01 | Acme | Dev | 4.0/5 | Applied | ✅ | [002](reports/002.md) |",
		"   | 1 | 2026-07-01 | Acme | Dev | 4.0/5 | Applied | ✅ | [002](reports/002.md) | n |",
		" | 1 | 2026-07-01 | Acme | Dev | 4.0/5 | Applied | ✅ | [002](reports/002.md) | n |",
		"| 1 | 2026-07-01 | Acme | Dev | 4.0/5 | Applied | ✅ | [002](reports/002.md) | n |\r",
		"| 1 | 2026-07-01 | Acme | Dev | 4.0/5 | **Applied** | ✅ | [002](reports/002.md) | n |",
		"|| 1 | 2026-07-01 | Acme | Dev | 4.0/5 | Applied | ✅ | [002](reports/002.md) | n ||",
		"| 1 | 2026-07-01 | Offerpad | Offer Eng | 4.6/5 | Offer | ✅ | [001](reports/001.md) | Offer note |",
		"| 7 | 2026-07-01 | Café Naïve 株式会社 | Ingénieur — Données | 4.6/5 | Applied | ✅ | [007](reports/007.md) | ✅❌ — señor |",
	}

	for _, row := range rows {
		accepted, want := parseOne(t, row)
		start, end, ok := statusReplaceSpan(row)
		if !ok {
			if accepted && want != "" {
				t.Errorf("rows.go refused a row the parser accepted with status %q: %q", want, row)
			}
			continue
		}
		if got := row[start:end]; got != want {
			t.Errorf("cell mismatch: rows.go would edit %q, parser reports %q\n  row: %q", got, want, row)
		}
	}
}
