package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Offerpad":       "offerpad",
		"Acme Corp.":     "acme-corp",
		"  Globex  Inc ": "globex-inc",
		"A&B/C":          "a-b-c",
		"---":            "",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRunListParsesFixture(t *testing.T) {
	res, err := runList("testdata/career-ops")
	if err != nil {
		t.Fatalf("runList: %v", err)
	}

	// Row 9 has four cells and must be dropped.
	if len(res.Applications) != 8 {
		t.Fatalf("len(Applications) = %d, want 8", len(res.Applications))
	}

	first := res.Applications[0]
	if first.Company != "Offerpad" {
		t.Errorf("Company = %q, want %q", first.Company, "Offerpad")
	}
	if first.Status != "Offer" {
		t.Errorf("Status = %q, want %q", first.Status, "Offer")
	}
	if first.Score != 4.6 {
		t.Errorf("Score = %v, want 4.6", first.Score)
	}
	if first.ReportNumber != "001" {
		t.Errorf("ReportNumber = %q, want %q", first.ReportNumber, "001")
	}
	if first.JobURL != "https://jobs.example.test/offerpad/staff-engineer" {
		t.Errorf("JobURL = %q, want the URL from the report header", first.JobURL)
	}
	if first.Archetype != "Platform / Infra" {
		t.Errorf("Archetype = %q, want %q", first.Archetype, "Platform / Infra")
	}
	if first.PDFPath != "output/cv-offerpad.pdf" {
		t.Errorf("PDFPath = %q, want %q", first.PDFPath, "output/cv-offerpad.pdf")
	}

	// Row 2's notes contain "Interview" while its status is "Applied".
	// This must not leak into the status.
	second := res.Applications[1]
	if second.Status != "Applied" {
		t.Errorf("Applications[1].Status = %q, want %q", second.Status, "Applied")
	}
}

func TestRunListEmitsDerivedStatusFields(t *testing.T) {
	res, err := runList("testdata/career-ops")
	if err != nil {
		t.Fatalf("runList: %v", err)
	}

	// Emitting these means the frontend never reimplements NormalizeStatus or
	// StatusPriority, so the two can never disagree.
	want := map[string]struct {
		norm string
		prio int
	}{
		"Offerpad": {"offer", 1},
		"Acme":     {"applied", 4},
		"Globex":   {"evaluated", 5},
		"Initech":  {"skip", 6},
		"Umbrella": {"interview", 0},
		"Hooli":    {"rejected", 7},
		"Soylent":  {"discarded", 8},
		"Vehement": {"responded", 3},
	}
	for _, a := range res.Applications {
		w, ok := want[a.Company]
		if !ok {
			t.Errorf("unexpected company %q", a.Company)
			continue
		}
		if a.NormStatus != w.norm {
			t.Errorf("%s NormStatus = %q, want %q", a.Company, a.NormStatus, w.norm)
		}
		if a.StatusPrio != w.prio {
			t.Errorf("%s StatusPrio = %d, want %d", a.Company, a.StatusPrio, w.prio)
		}
	}
}

func TestRunListComputesMetrics(t *testing.T) {
	res, err := runList("testdata/career-ops")
	if err != nil {
		t.Fatalf("runList: %v", err)
	}

	if res.Metrics.Total != 8 {
		t.Errorf("Metrics.Total = %d, want 8", res.Metrics.Total)
	}
	if res.Metrics.TopScore != 4.9 {
		t.Errorf("Metrics.TopScore = %v, want 4.9", res.Metrics.TopScore)
	}
	// ByStatus keys come from NormalizeStatus, so they are lowercase.
	if res.Metrics.ByStatus["offer"] != 1 {
		t.Errorf("ByStatus[offer] = %d, want 1", res.Metrics.ByStatus["offer"])
	}
	if _, bad := res.Metrics.ByStatus["Offer"]; bad {
		t.Errorf("ByStatus has a display-cased key; expected NormalizeStatus output only")
	}
	if len(res.Progress.FunnelStages) == 0 {
		t.Errorf("Progress.FunnelStages is empty")
	}
}

func TestResolvePDFNoMatchReturnsEmpty(t *testing.T) {
	if got := resolvePDF("testdata/career-ops", "Umbrella"); got != "" {
		t.Errorf("resolvePDF for a company with no PDF = %q, want empty", got)
	}
}

// TestRunListStripsBoldFromStatus pins the invariant whose absence let a
// legacy "**Applied**" row become permanently uncorrectable through the app:
// list's emitted status must equal what statusSpan (the optimistic lock's
// view) sees on the very same on-disk row. If the two ever disagree again,
// the UI echoes list's value back as expectStatus and every write on such a
// row is rejected as stale.
func TestRunListStripsBoldFromStatus(t *testing.T) {
	row := "| 1 | 2026-07-01 | Offerpad | Staff Engineer | 4.6/5 | **Applied** | ❌ | [001](reports/001.md) | legacy bold status |"
	root, _ := writeTracker(t, "\n", row)

	res, err := runList(root)
	if err != nil {
		t.Fatalf("runList: %v", err)
	}
	if len(res.Applications) != 1 {
		t.Fatalf("len(Applications) = %d, want 1", len(res.Applications))
	}

	// Re-read independently rather than trusting writeTracker's own return
	// value, so this checks what the system under test actually sees on disk.
	raw, err := os.ReadFile(filepath.Join(root, "data", "applications.md"))
	if err != nil {
		t.Fatal(err)
	}
	rowLine := strings.Split(string(raw), "\n")[4] // title, blank, header, separator, row
	start, end, ok := statusSpan(rowLine)
	if !ok {
		t.Fatalf("statusSpan found no status cell in %q", rowLine)
	}
	want := rowLine[start:end]

	got := res.Applications[0].Status
	if got != want {
		t.Errorf("list Status = %q, statusSpan (the lock's view) = %q on the same row — they must agree, or every write on a bold row is rejected as stale", got, want)
	}
	if strings.Contains(got, "*") {
		t.Errorf("Status = %q still carries bold markers", got)
	}
}
