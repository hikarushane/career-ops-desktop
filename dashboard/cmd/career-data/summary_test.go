package main

import "testing"

func TestExtractSummaryHeaderColonForm(t *testing.T) {
	md := "# 001 — Example\n\n" +
		"**Archetype:** Technical PM (Intern-level)\n" +
		"**TL;DR:** Great infra match\n" +
		"**Remote:** Remote (EU)\n" +
		"**Comp:** 90-100k\n"

	archetype, tldr, remote, comp := extractSummary(md)
	if archetype != "Technical PM (Intern-level)" {
		t.Errorf("archetype = %q, want %q", archetype, "Technical PM (Intern-level)")
	}
	if tldr != "Great infra match" {
		t.Errorf("tldr = %q, want %q", tldr, "Great infra match")
	}
	if remote != "Remote (EU)" {
		t.Errorf("remote = %q, want %q", remote, "Remote (EU)")
	}
	if comp != "90-100k" {
		t.Errorf("comp = %q, want %q", comp, "90-100k")
	}
}

func TestExtractSummaryTableRowForm(t *testing.T) {
	md := "| Dimension | Value |\n" +
		"|-----------|-------|\n" +
		"| Archetype | Platform / Infra |\n" +
		"| TL;DR | Strong infra match |\n" +
		"| Remote | Remote (EU) |\n" +
		"| Comp | 90-110k EUR |\n"

	archetype, tldr, remote, comp := extractSummary(md)
	if archetype != "Platform / Infra" {
		t.Errorf("archetype = %q, want %q", archetype, "Platform / Infra")
	}
	if tldr != "Strong infra match" {
		t.Errorf("tldr = %q, want %q", tldr, "Strong infra match")
	}
	if remote != "Remote (EU)" {
		t.Errorf("remote = %q, want %q", remote, "Remote (EU)")
	}
	if comp != "90-110k EUR" {
		t.Errorf("comp = %q, want %q", comp, "90-110k EUR")
	}
}

func TestExtractSummaryHeaderFormWinsOverTableForm(t *testing.T) {
	// Real reports carry both an English header-colon block and a plain
	// "A) Role Summary" table repeating the same fields. The header must win
	// so a stale or reworded table row never overrides the report's own
	// header line.
	md := "**Archetype:** From Header\n\n" +
		"| Dimension | Value |\n" +
		"|-----------|-------|\n" +
		"| Archetype | From Table |\n"

	archetype, _, _, _ := extractSummary(md)
	if archetype != "From Header" {
		t.Errorf("archetype = %q, want %q (header form must win)", archetype, "From Header")
	}
}

func TestExtractSummaryTableCellStripsBold(t *testing.T) {
	md := "| Archetype | **Platform** |\n"

	archetype, _, _, _ := extractSummary(md)
	if archetype != "Platform" {
		t.Errorf("archetype = %q, want %q (bold markers must be stripped)", archetype, "Platform")
	}
}

func TestExtractSummaryAbsentFieldReturnsEmpty(t *testing.T) {
	md := "**Archetype:** Only this field is present\n"

	archetype, tldr, remote, comp := extractSummary(md)
	if archetype != "Only this field is present" {
		t.Errorf("archetype = %q, want the present field", archetype)
	}
	if tldr != "" {
		t.Errorf("tldr = %q, want empty for an absent field", tldr)
	}
	if remote != "" {
		t.Errorf("remote = %q, want empty for an absent field", remote)
	}
	if comp != "" {
		t.Errorf("comp = %q, want empty for an absent field", comp)
	}
}

func TestExtractSummaryCompAliases(t *testing.T) {
	cases := map[string]string{
		"**Compensation:** 100k EUR\n":         "100k EUR",
		"**Comp assessment:** 80-90k EUR\n":    "80-90k EUR",
		"| Compensation | 70k EUR |\n":         "70k EUR",
		"| Comp assessment | 60k EUR |\n":      "60k EUR",
		"**Salary benchmarks:** 90-110k EUR\n": "90-110k EUR",
		"| Salary benchmarks | 50-65k EUR |\n": "50-65k EUR",
	}
	for md, want := range cases {
		_, _, _, comp := extractSummary(md)
		if comp != want {
			t.Errorf("extractSummary(%q) comp = %q, want %q", md, comp, want)
		}
	}
}

// TestExtractSummaryScoringTableGuardRejectsBareNumber covers the shape
// found in reports/001: a scoring-dimension table row
// "| Dimension | Score | Rationale |" where one dimension happens to be
// named "Comp". The old table-row matcher captured the score column
// ("1.0") as if it were a compensation figure. A preview card reading
// "Comp: 1.0" states a wrong number about the user's own job search, which
// is worse than the em dash an unmatched field renders as, so this must
// come back "".
func TestExtractSummaryScoringTableGuardRejectsBareNumber(t *testing.T) {
	md := "| Dimension | Score | Rationale |\n" +
		"|---|---|---|\n" +
		"| Comp | 1.0 | €800–1,500/month vs €52,000+/year minimum — structurally impossible |\n"

	_, _, _, comp := extractSummary(md)
	if comp != "" {
		t.Errorf("comp = %q, want empty (scoring-table score must not be mistaken for a comp figure)", comp)
	}
}

// TestExtractSummaryTableRowProseSurvivesGuard mirrors reports/029's real
// shape: a "Field | Value" table row whose value is prose, not a bare
// number. The guard must reject only pure-number captures, so this must
// keep matching.
func TestExtractSummaryTableRowProseSurvivesGuard(t *testing.T) {
	md := "| Compensation | Entry-level; no salary disclosed — consistent with graduate programs |\n"

	_, _, _, comp := extractSummary(md)
	want := "Entry-level; no salary disclosed — consistent with graduate programs"
	if comp != want {
		t.Errorf("comp = %q, want %q (prose values must survive the bare-number guard)", comp, want)
	}
}
