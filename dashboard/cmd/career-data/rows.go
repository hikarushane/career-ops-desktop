package main

import "strings"

// statusCellIndex is the 0-based position of the Status column in
// applications.md rows:
//
//	0=# 1=Date 2=Company 3=Role 4=Score 5=Status 6=PDF 7=Report 8=Notes
//
// Note that the TSV files under batch/tracker-additions/ put status before
// score; merge-tracker.mjs swaps them. This constant describes the tracker,
// not the TSV.
const statusCellIndex = 5

// minCells matches the parser: rows with fewer cells are not data rows.
const minCells = 8

// cellSpans returns the byte span of each raw cell in raw, using the same
// splitting rules as ParseApplications (career.go:56-72): tab-separated when
// the row contains a tab, pipe-separated otherwise. Spans are offsets into
// raw, so surrounding whitespace and delimiters are recoverable.
func cellSpans(raw string) [][2]int {
	lead := 0
	for lead < len(raw) && (raw[lead] == ' ' || raw[lead] == '\t') {
		lead++
	}
	end := len(raw)
	for end > lead {
		c := raw[end-1]
		if c != ' ' && c != '\t' && c != '\r' && c != '\n' {
			break
		}
		end--
	}
	if lead >= end || raw[lead] != '|' {
		return nil
	}

	body := raw[lead:end]

	if strings.ContainsRune(body, '\t') {
		// Mixed format: a leading "|" then tab-separated cells.
		return splitSpans(body[1:], '\t', lead+1)
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

// isDataRow reports whether raw is a tracker data row rather than a header,
// separator, or short line.
func isDataRow(raw string) ([][2]int, bool) {
	spans := cellSpans(raw)
	if len(spans) < minCells || statusCellIndex >= len(spans) {
		return nil, false
	}
	if h := strings.TrimSpace(raw); strings.HasPrefix(h, "|---") || strings.HasPrefix(h, "| #") {
		return nil, false
	}
	return spans, true
}

// statusSpan locates the status cell's *value* — bold markers excluded.
//
// Comparison and replacement need different spans, which is why there are two
// functions. A legacy row may hold "**Applied**". The optimistic lock in
// writer.go compares this span against the canonical status the caller last
// saw ("Applied"), so the markers must be outside it or every bold row would
// read as stale. Replacement has the opposite need — see statusReplaceSpan.
func statusSpan(raw string) (start, end int, ok bool) {
	spans, ok := isDataRow(raw)
	if !ok {
		return 0, 0, false
	}
	s, e := trimSpan(raw, spans[statusCellIndex])
	s, e = stripBold(raw, s, e)
	if s >= e {
		return 0, 0, false
	}
	return s, e, true
}

// statusReplaceSpan locates the range spliceStatus overwrites: the status
// cell's value *including* any bold markers around it.
//
// AGENTS.md requires canonical statuses with no markdown bold in the status
// field, so rewriting "**Applied**" must yield "Offer", not "**Offer**".
// Splicing over the markers normalizes the row on the way past.
func statusReplaceSpan(raw string) (start, end int, ok bool) {
	spans, ok := isDataRow(raw)
	if !ok {
		return 0, 0, false
	}
	s, e := trimSpan(raw, spans[statusCellIndex])
	if s >= e {
		return 0, 0, false
	}
	return s, e, true
}

// spliceStatus replaces the status cell and returns the rewritten row. Every
// byte outside the replaced range is preserved exactly.
func spliceStatus(raw, newStatus string) (string, bool) {
	start, end, ok := statusReplaceSpan(raw)
	if !ok {
		return raw, false
	}
	return raw[:start] + newStatus + raw[end:], true
}
