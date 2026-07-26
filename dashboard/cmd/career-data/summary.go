package main

import (
	"regexp"
	"strings"
)

// Report summary extraction.
//
// data.LoadReportSummary cannot do this: its regexes require a bold,
// pipe-table form and the literal Spanish word "Arquetipo", which no report
// in this repo uses. Fixing it means editing dashboard/internal/data/, a
// system path that update-system.mjs reverts — so extraction lives here.
// See docs/superpowers/specs/2026-07-26-tauri-dashboard-design.md §4.1.

// fieldPattern builds the two matchers for one field label. label is a regex
// fragment, so alternations like "Comp(?:ensation)?" are allowed.
func fieldPattern(label string) []*regexp.Regexp {
	return []*regexp.Regexp{
		// **Label:** value
		regexp.MustCompile(`(?mi)^\*\*` + label + `:\*\*[ \t]*(.+?)[ \t]*$`),
		// | Label | value |
		regexp.MustCompile(`(?mi)^\|[ \t]*` + label + `[ \t]*\|[ \t]*([^|\r\n]+)`),
	}
}

var (
	patArchetype = fieldPattern(`Archetype`)
	patTlDr      = fieldPattern(`TL;DR`)
	patRemote    = fieldPattern(`Remote`)
	// Reports record compensation inconsistently; accept the variants that
	// actually occur. Coverage is 3/30 — a property of the data, not the
	// matcher. Unmatched fields render as an em dash in the UI.
	patComp = fieldPattern(`(?:Comp(?:ensation)?(?:\s+assessment)?|Salary\s+benchmarks)`)
)

// bareNumber matches a value that is only a number. Reports score dimensions
// in tables shaped `| Dimension | Score | Rationale |`, and some of those
// dimensions are named "Comp" — so the table-row matcher can capture a score
// like "1.0" instead of a compensation figure. A preview card reading
// "Comp: 1.0" is worse than one reading "—", so such captures are discarded
// and matching falls through to the next pattern.
var bareNumber = regexp.MustCompile(`^\d+(?:\.\d+)?$`)

// firstMatch returns the first capture any pattern yields, cleaned.
func firstMatch(text string, pats []*regexp.Regexp) string {
	for _, p := range pats {
		if m := p.FindStringSubmatch(text); m != nil {
			v := cleanField(m[1])
			if v != "" && !bareNumber.MatchString(v) {
				return v
			}
		}
	}
	return ""
}

// cleanField strips table padding and markdown bold from a captured value.
func cleanField(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimRight(s, "|")
	s = strings.TrimSpace(s)
	for len(s) >= 4 && strings.HasPrefix(s, "**") && strings.HasSuffix(s, "**") {
		s = strings.TrimSpace(s[2 : len(s)-2])
	}
	return s
}

// extractSummary pulls the four preview-card fields out of a report's
// markdown. Values are returned untruncated; the UI truncates for display.
func extractSummary(markdown string) (archetype, tldr, remote, comp string) {
	return firstMatch(markdown, patArchetype),
		firstMatch(markdown, patTlDr),
		firstMatch(markdown, patRemote),
		firstMatch(markdown, patComp)
}
