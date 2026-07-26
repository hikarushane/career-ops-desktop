package main

import "testing"

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Offerpad":        "offerpad",
		"Acme Corp.":      "acme-corp",
		"  Globex  Inc ":  "globex-inc",
		"A&B/C":           "a-b-c",
		"---":             "",
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
	if first.PDFPath != "output/offerpad-cv.pdf" {
		t.Errorf("PDFPath = %q, want %q", first.PDFPath, "output/offerpad-cv.pdf")
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
		"Acme":     {"applied", 3},
		"Globex":   {"evaluated", 4},
		"Initech":  {"skip", 5},
		"Umbrella": {"interview", 0},
		"Hooli":    {"rejected", 6},
		"Soylent":  {"discarded", 7},
		"Vehement": {"responded", 2},
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
