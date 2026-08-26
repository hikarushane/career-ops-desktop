package main

import (
	"strings"
	"unicode"
)

// defaultStatusCellIndex is the legacy 0-based position of the Status column.
// Used only when no header row is detected.
const defaultStatusCellIndex = 5

// defaultReportCellIndex is the legacy 0-based position of the Report column.
const defaultReportCellIndex = 7

// minCells matches the parser: rows with fewer cells are not data rows.
const minCells = 8

// trackerColumns holds detected column indices. A zero-value means "use
// defaults" — call detectColumns on the tracker content first.
type trackerColumns struct {
	status int
	report int
	found  bool
}

// headerAliases maps lowercased header labels to canonical field names,
// mirroring dashboard/internal/data/career.go:trackerHeaderAliases.
var headerAliases = map[string]string{
	"#": "num", "no": "num", "num": "num", "number": "num",
	"date": "date",
	"company": "company", "empresa": "company",
	"via": "via", "source": "via",
	"role": "role", "puesto": "role", "rol": "role",
	"score": "score", "puntaje": "score",
	"status": "status", "estado": "status",
	"pdf": "pdf",
	"report": "report", "reporte": "report",
	"notes": "notes", "notas": "notes",
}

// detectColumns scans lines for the header row and returns column indices.
func detectColumns(lines []string) trackerColumns {
	for _, raw := range lines {
		trimmed := strings.TrimSpace(raw)
		if !strings.HasPrefix(trimmed, "| #") && !strings.HasPrefix(trimmed, "|#") {
			continue
		}
		// Split on pipe, trim each cell, map to canonical names.
		parts := strings.Split(strings.Trim(trimmed, "|"), "|")
		cols := trackerColumns{status: -1, report: -1}
		for i, p := range parts {
			key := strings.ToLower(strings.TrimSpace(p))
			if name, ok := headerAliases[key]; ok {
				switch name {
				case "status":
					cols.status = i
				case "report":
					cols.report = i
				}
			}
		}
		if cols.status >= 0 && cols.report >= 0 {
			cols.found = true
			return cols
		}
	}
	return trackerColumns{status: defaultStatusCellIndex, report: defaultReportCellIndex}
}

// cellSpans returns the byte span of each raw cell in raw, using the same
// splitting rules as ParseApplications (career.go:56-72): tab-separated when
// the row contains a tab, pipe-separated otherwise. Spans are offsets into
// raw, so surrounding whitespace and delimiters are recoverable.
func cellSpans(raw string) [][2]int {
	// ParseApplications trims the whole line with strings.TrimSpace before
	// anything else (career.go:47), and TrimSpace is unicode-aware — it
	// removes NBSP and friends, not only ASCII blanks. Mirror it exactly:
	// if this function and the parser disagree about where the row begins,
	// they disagree about which cell is the status cell.
	lead := len(raw) - len(strings.TrimLeftFunc(raw, unicode.IsSpace))
	end := lead + len(strings.TrimRightFunc(raw[lead:], unicode.IsSpace))
	if lead >= end || raw[lead] != '|' {
		return nil
	}

	body := raw[lead:end]

	if strings.ContainsRune(body, '\t') {
		// Mixed format: a leading "|", then TrimSpace, then tab-separated
		// cells (career.go:58-62). That second trim is load-bearing. Without
		// it a row whose pipe is followed by a tab — "|\t1\t2026-07-01\t…" —
		// yields an empty leading cell and shifts every index by one, so the
		// writer would splice the status over the Score cell.
		inner := body[1:]
		trimmed := strings.TrimLeftFunc(inner, unicode.IsSpace)
		off := lead + 1 + (len(inner) - len(trimmed))
		return splitSpans(trimmed, '\t', off)
	}

	// Pure pipe format: drop the outer pipes, then split on "|".
	l, r := 0, len(body)
	for l < r && body[l] == '|' {
		l++
	}
	for r > l && body[r-1] == '|' {
		r--
	}
	return splitSpans(body[l:r], '|', lead+l)
}

// splitSpans splits s on sep and returns each piece's span, offset by base.
func splitSpans(s string, sep byte, base int) [][2]int {
	spans := make([][2]int, 0, 10)
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			spans = append(spans, [2]int{base + start, base + i})
			start = i + 1
		}
	}
	return append(spans, [2]int{base + start, base + len(s)})
}

// trimSpan narrows a raw cell span to its content: whitespace, stray pipes and
// carriage returns are excluded on both sides. Markdown bold markers are KEPT —
// stripBold removes those, and the two are separate on purpose. See the note
// above statusSpan.
func trimSpan(raw string, span [2]int) (int, int) {
	s, e := span[0], span[1]
	isPad := func(c byte) bool {
		return c == ' ' || c == '\t' || c == '|' || c == '\r'
	}
	for s < e && isPad(raw[s]) {
		s++
	}
	for e > s && isPad(raw[e-1]) {
		e--
	}
	return s, e
}

// stripBold narrows a span past any markdown bold markers wrapping it.
func stripBold(raw string, s, e int) (int, int) {
	for e-s >= 4 && strings.HasPrefix(raw[s:e], "**") && strings.HasSuffix(raw[s:e], "**") {
		s += 2
		e -= 2
	}
	return s, e
}

// stripBoldString is stripBold applied to a whole standalone value rather
// than a span within a raw line. list.go uses it so a legacy "**Applied**"
// status is emitted the same way statusSpan sees it on disk — display,
// expectStatus, and the optimistic lock all agree on one notion of the row's
// current status. Without it, the lock (which excludes bold, see statusSpan
// above) and the list emission (which didn't) could disagree, and every
// write on such a row would be rejected as stale.
func stripBoldString(v string) string {
	s, e := stripBold(v, 0, len(v))
	return v[s:e]
}

// isDataRow reports whether raw is a tracker data row rather than a header,
// separator, or short line.
func isDataRow(raw string, statusIdx int) ([][2]int, bool) {
	spans := cellSpans(raw)
	if len(spans) < minCells || statusIdx >= len(spans) {
		return nil, false
	}
	if h := strings.TrimSpace(raw); strings.HasPrefix(h, "|---") || strings.HasPrefix(h, "| #") {
		return nil, false
	}
	return spans, true
}

// statusSpan locates the status cell's *value* — bold markers excluded.
func statusSpanAt(raw string, statusIdx int) (start, end int, ok bool) {
	spans, ok := isDataRow(raw, statusIdx)
	if !ok {
		return 0, 0, false
	}
	s, e := trimSpan(raw, spans[statusIdx])
	s, e = stripBold(raw, s, e)
	if s >= e {
		return 0, 0, false
	}
	return s, e, true
}

// statusSpan is the legacy entry point using the default column index.
func statusSpan(raw string) (start, end int, ok bool) {
	return statusSpanAt(raw, defaultStatusCellIndex)
}

// statusReplaceSpanAt locates the range spliceStatus overwrites, including
// any bold markers.
func statusReplaceSpanAt(raw string, statusIdx int) (start, end int, ok bool) {
	spans, ok := isDataRow(raw, statusIdx)
	if !ok {
		return 0, 0, false
	}
	s, e := trimSpan(raw, spans[statusIdx])
	if s >= e {
		return 0, 0, false
	}
	return s, e, true
}

// statusReplaceSpan is the legacy entry point using the default column index.
func statusReplaceSpan(raw string) (start, end int, ok bool) {
	return statusReplaceSpanAt(raw, defaultStatusCellIndex)
}

// spliceStatusAt replaces the status cell at statusIdx and returns the
// rewritten row. Every byte outside the replaced range is preserved exactly.
func spliceStatusAt(raw, newStatus string, statusIdx int) (string, bool) {
	start, end, ok := statusReplaceSpanAt(raw, statusIdx)
	if !ok {
		return raw, false
	}
	return raw[:start] + newStatus + raw[end:], true
}

// spliceStatus is the legacy entry point using the default column index.
func spliceStatus(raw, newStatus string) (string, bool) {
	return spliceStatusAt(raw, newStatus, defaultStatusCellIndex)
}
