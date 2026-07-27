package main

import "testing"

func TestStatusSpanPurePipe(t *testing.T) {
	raw := "| 1 | 2026-07-01 | Offerpad | Staff Engineer | 4.6/5 | Offer | ✅ | [001](reports/001.md) | Note |"

	start, end, ok := statusSpan(raw)
	if !ok {
		t.Fatal("ok = false, want true")
	}
	if got := raw[start:end]; got != "Offer" {
		t.Fatalf("raw[start:end] = %q, want %q", got, "Offer")
	}
}

func TestStatusSpanIgnoresEarlierMatches(t *testing.T) {
	// "Offer" appears in the company name before it appears as the status.
	// A naive strings.Replace would rewrite the company. The span must point
	// at cell 5.
	raw := "| 1 | 2026-07-01 | Offerpad | Offer Engineer | 4.6/5 | Offer | ✅ | [001](reports/001.md) | Offer note |"

	start, end, ok := statusSpan(raw)
	if !ok {
		t.Fatal("ok = false, want true")
	}
	if start < len("| 1 | 2026-07-01 | Offerpad | Offer Engineer | 4.6/5 | ") {
		t.Fatalf("span starts at %d, which is inside an earlier cell", start)
	}
	if got := raw[start:end]; got != "Offer" {
		t.Fatalf("raw[start:end] = %q, want %q", got, "Offer")
	}
}

func TestStatusSpanMixedTabFormat(t *testing.T) {
	// Three separators between the leading pipe and the first cell, all of
	// which ParseApplications collapses via TrimSpace (career.go:58-62).
	// Getting this wrong shifts every cell index by one, and the writer
	// splices the status over the Score cell — silent data corruption.
	for _, raw := range []string{
		"| 1\t2026-07-01\tAcme\tBackend\t4.0/5\tApplied\t❌\t[002](reports/002.md)\tInterview soon",
		"|\t1\t2026-07-01\tAcme\tBackend\t4.0/5\tApplied\t❌\t[002](reports/002.md)\tInterview soon",
		"|  \t1\t2026-07-01\tAcme\tBackend\t4.0/5\tApplied\t❌\t[002](reports/002.md)\tInterview soon",
	} {
		start, end, ok := statusSpan(raw)
		if !ok {
			t.Errorf("ok = false for %q", raw)
			continue
		}
		if got := raw[start:end]; got != "Applied" {
			t.Errorf("statusSpan = %q, want %q, for %q", got, "Applied", raw)
		}
	}
}

// cellSpans must agree with ParseApplications about where a row begins.
// TrimSpace is unicode-aware, so a row led by a non-breaking space is a data
// row to the parser; if this function only skipped ASCII blanks it would
// reject the row and the status would be unwritable.
func TestStatusSpanUnicodeLeadingSpace(t *testing.T) {
	raw := " | 1 | 2026-07-01 | Acme | Dev | 4.0/5 | Applied | ✅ | [002](reports/002.md) | n |"

	start, end, ok := statusSpan(raw)
	if !ok {
		t.Fatal("ok = false, want true for an NBSP-led row")
	}
	if got := raw[start:end]; got != "Applied" {
		t.Errorf("statusSpan = %q, want %q", got, "Applied")
	}
}

// A blank status cell is refused rather than written into. The parser accepts
// such a row with an empty status, so the two deliberately differ here: a
// zero-width span gives the optimistic lock nothing to compare, and a blank
// status is malformed per AGENTS.md's canonical-states rule anyway. Refusing
// to write is the safe direction; `node normalize-statuses.mjs` is the fix.
func TestStatusSpanRefusesEmptyStatusCell(t *testing.T) {
	raw := "| 1 | 2026-07-01 | Acme | Dev | 4.0/5 |  | ✅ | [002](reports/002.md) | n |"

	if _, _, ok := statusSpan(raw); ok {
		t.Error("statusSpan accepted a blank status cell; want refusal")
	}
	if _, _, ok := statusReplaceSpan(raw); ok {
		t.Error("statusReplaceSpan accepted a blank status cell; want refusal")
	}
}

func TestStatusSpanRejectsNonRows(t *testing.T) {
	for _, raw := range []string{
		"",
		"# Applications Tracker",
		"|---|------|",
		"| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
		"| 9 | Tooshort |",
		"not a table row at all",
	} {
		if _, _, ok := statusSpan(raw); ok {
			t.Errorf("statusSpan(%q) ok = true, want false", raw)
		}
	}
}

func TestSpliceStatusPreservesEverythingElse(t *testing.T) {
	raw := "  | 1 | 2026-07-01 | Offerpad | Staff Engineer | 4.6/5 | Offer | ✅ | [001](reports/001.md) | Note |  \r"
	want := "  | 1 | 2026-07-01 | Offerpad | Staff Engineer | 4.6/5 | Applied | ✅ | [001](reports/001.md) | Note |  \r"

	got, ok := spliceStatus(raw, "Applied")
	if !ok {
		t.Fatal("ok = false, want true")
	}
	if got != want {
		t.Errorf("spliceStatus:\n got %q\nwant %q", got, want)
	}
}

func TestSpliceStatusPreservesCellPadding(t *testing.T) {
	// The status cell is padded wider than its content. Only the content is
	// replaced; the surrounding spaces survive.
	raw := "| 1 | 2026-07-01 | Acme | Dev | 4.0/5 |    Applied    | ❌ | [002](reports/002.md) | n |"
	want := "| 1 | 2026-07-01 | Acme | Dev | 4.0/5 |    Offer    | ❌ | [002](reports/002.md) | n |"

	got, ok := spliceStatus(raw, "Offer")
	if !ok {
		t.Fatal("ok = false, want true")
	}
	if got != want {
		t.Errorf("spliceStatus:\n got %q\nwant %q", got, want)
	}
}

func TestSpliceStatusHandlesBoldMarkers(t *testing.T) {
	// Legacy rows wrap the status in markdown bold. AGENTS.md forbids bold in
	// the status field, so the splice covers the markers and normalizes them
	// away rather than producing "**Offer**".
	raw := "| 1 | 2026-07-01 | Acme | Dev | 4.0/5 | **Applied** | ❌ | [002](reports/002.md) | n |"
	want := "| 1 | 2026-07-01 | Acme | Dev | 4.0/5 | Offer | ❌ | [002](reports/002.md) | n |"

	got, ok := spliceStatus(raw, "Offer")
	if !ok {
		t.Fatal("ok = false, want true")
	}
	if got != want {
		t.Errorf("spliceStatus:\n got %q\nwant %q", got, want)
	}
}

// The comparison span and the replacement span deliberately differ on a bold
// row. statusSpan must yield the bare value so writer.go's optimistic lock can
// match it against the canonical status the caller supplies; if it included
// the markers, every legacy bold row would read as stale and become
// unwritable.
func TestStatusSpanExcludesBoldMarkers(t *testing.T) {
	raw := "| 1 | 2026-07-01 | Acme | Dev | 4.0/5 | **Applied** | ❌ | [002](reports/002.md) | n |"

	start, end, ok := statusSpan(raw)
	if !ok {
		t.Fatal("statusSpan ok = false, want true")
	}
	if got := raw[start:end]; got != "Applied" {
		t.Errorf("statusSpan value = %q, want %q", got, "Applied")
	}

	rStart, rEnd, ok := statusReplaceSpan(raw)
	if !ok {
		t.Fatal("statusReplaceSpan ok = false, want true")
	}
	if got := raw[rStart:rEnd]; got != "**Applied**" {
		t.Errorf("statusReplaceSpan value = %q, want %q", got, "**Applied**")
	}
}
