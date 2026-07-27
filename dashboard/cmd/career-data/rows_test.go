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
	raw := "| 1\t2026-07-01\tAcme\tBackend\t4.0/5\tApplied\t❌\t[002](reports/002.md)\tInterview soon"

	start, end, ok := statusSpan(raw)
	if !ok {
		t.Fatal("ok = false, want true")
	}
	if got := raw[start:end]; got != "Applied" {
		t.Fatalf("raw[start:end] = %q, want %q", got, "Applied")
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
	// Legacy rows wrap the status in markdown bold. NormalizeStatus tolerates
	// it, so the span covers the markers and the splice removes them.
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
