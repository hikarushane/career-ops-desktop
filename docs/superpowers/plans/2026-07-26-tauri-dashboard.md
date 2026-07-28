# Tauri Desktop Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Tauri desktop dashboard for career-ops that reaches feature parity with the existing Go TUI, running alongside it without being clobbered by `update-system.mjs`.

**Architecture:** A Go sidecar (`dashboard/cmd/career-data`) reuses the TUI's already-exported data layer and emits JSON on stdout. A Tauri v2 app (`desktop/`) spawns that sidecar from Rust and renders a React + TypeScript frontend. Rust does no parsing; Go owns all domain logic; TypeScript owns all presentation.

**Tech Stack:** Go 1.24.2+ (stdlib only), Rust 1.96 / Tauri v2, Node 22, React + Vite + TypeScript, Recharts, react-markdown + remark-gfm.

**Spec:** `docs/superpowers/specs/2026-07-26-tauri-dashboard-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Never modify an existing file under `dashboard/`.** Only add files under `dashboard/cmd/career-data/`. `update-system.mjs` reverts modifications to system paths (update-system.mjs:74, :298).
- **No new Go dependencies.** `dashboard/go.mod` and `go.sum` must be byte-identical at the end of every task. The sidecar uses stdlib only.
- **Never add `desktop/` to the root `package.json`.** The root `package.json` is a system path. `desktop/` carries its own.
- **No hardcoded absolute paths and no secrets.** The career-ops root comes from Tauri's store, overridable by the `CAREER_OPS_PATH` env var. Only `.env.example` is committed.
- **Tracker row layout, 0-based cell indices:** `0=#, 1=Date, 2=Company, 3=Role, 4=Score, 5=Status, 6=PDF, 7=Report, 8=Notes`. Rows with fewer than 8 cells are skipped. **The status cell is index 5.**
- **Canonical statuses, exactly these eight strings:** `Evaluated`, `Applied`, `Responded`, `Interview`, `Offer`, `Rejected`, `Discarded`, `SKIP`.
- **Writes preserve line endings.** This working tree is CRLF. A writer that normalizes to LF marks every row as modified in `git diff`.
- **Score bands, matching `scoreStyle` (pipeline.go:1081-1091):** `>= 4.2` green, `>= 3.8` yellow, `>= 3.0` neutral, below that red.
- **macOS only.** No Windows or Linux packaging in this plan.
- **Commit messages in English.** Conventional Commits prefix (`feat:`, `fix:`, `test:`, `chore:`).
- **Work happens on the `tauri-dashboard` branch**, which already exists and holds the spec commit.
- **The Vite dev port is 1430, not Tauri's default 1420.** An unrelated project on this machine already holds 1420, so Task 6 moved it in both `desktop/vite.config.ts` and `desktop/src-tauri/tauri.conf.json`. Those two must stay in agreement: Tauri checks its `devUrl` against the dev server at startup and a mismatch fails with a bare connection error, not a useful one.
- **Never write to the real `data/applications.md`.** The repo is fully onboarded and that file records an actual job search: 30 reports, real companies, real statuses. It cannot be regenerated. Every write-path test and every manual verification of `set-status` runs against `desktop/fixtures/career-ops/` or a `t.TempDir()`. Reading the real data is fine and useful; writing to it is not.
- **Never run `git add -A`, `git add .`, or `git commit -a`.** Stage only the paths your task created or modified, exactly as each commit step lists them. See the next constraint for why.
- **The working tree is dirty before you start, and that is expected.** 167 tracked files differ from HEAD by CRLF line endings only; 16 more are deleted (`LEGAL_DISCLAIMER.md`, six localized READMEs, `config/profile.example.yml`, the `examples/` tree); `.gitignore`, `CLAUDE.md`, and `interview-prep/story-bank.md` carry unrelated local edits. None of it belongs to this plan. Do not restore, delete, commit, or normalize any of it, and do not "clean up" the tree.

  Because of this, every verification step in this plan uses `--ignore-cr-at-eol` and compares content rather than asserting a clean `git status`. A bare `git status --porcelain` will always look dirty here; that is not a failure signal.

## File Structure

**Go sidecar** — `dashboard/cmd/career-data/`

| File | Responsibility |
|---|---|
| `main.go` | Subcommand dispatch, flag parsing, JSON envelope, exit codes |
| `doctor.go` | Onboarding-state probe |
| `list.go` | Calls the data layer, resolves PDF paths, builds the `list` payload |
| `report.go` | Report markdown read plus path-escape validation |
| `rows.go` | Byte-span location of a tracker row's status cell |
| `writer.go` | Optimistic lock, backup, atomic write, line-ending preservation |
| `*_test.go` | One test file per source file above |
| `testdata/career-ops/` | Dirty-data fixtures for `list` and `report` |

`rows.go` is split from `writer.go` because span location is pure string arithmetic that is worth testing on its own, while `writer.go` touches the filesystem.

**Tauri app** — `desktop/`

| File | Responsibility |
|---|---|
| `src-tauri/src/lib.rs` | Plugin registration, command handler list |
| `src-tauri/src/sidecar.rs` | The only place that spawns the sidecar; four `#[tauri::command]` wrappers |
| `src-tauri/capabilities/default.json` | Permission grants, scoped to this sidecar |
| `scripts/build-sidecar.mjs` | `go build` plus host-triple naming |
| `src/api.ts` | Typed `invoke()` wrappers and the TypeScript mirror of the JSON contract |
| `src/config.ts` | Career-ops path: store persistence, dev override, directory picker |
| `src/theme.css` | Catppuccin Latte/Mocha custom properties |
| `src/app.css` | Layout, table, report and chart styles |
| `src/App.tsx` | Routing between Empty / Pipeline / Progress, global data state |
| `src/screens/EmptyState.tsx` | Onboarding-missing screen and directory picker |
| `src/screens/Pipeline.tsx` | Filter/sort/search state, the write handler, split-pane layout |
| `src/screens/Progress.tsx` | Four chart blocks |
| `src/components/MetricsBar.tsx` | The five aggregate figures |
| `src/components/Toolbar.tsx` | Tabs, search, sort and view controls |
| `src/components/AppTable.tsx` | The table and its sortable headers |
| `src/components/StatusSelect.tsx` | The inline status dropdown |
| `src/components/ReportPane.tsx` | Preview card plus rendered markdown |
| `src/components/RateCard.tsx` | `RateCard` (percentage) and `CountCard` (count) |
| `src/lib/filters.ts` | Pure filter/sort/group/search functions |
| `src/lib/filters.test.ts` | Vitest coverage of the above |
| `fixtures/career-ops/` | Realistic synthetic data for UI development |
| `README.md` | Setup, architecture and write-safety notes |

`src/lib/filters.ts` is pure and separate from `Pipeline.tsx` so the parity check against the TUI (acceptance criterion 2) is a unit test, not a click-through.

---

## Task 1: Sidecar scaffold and `doctor`

Produces a runnable binary that answers the one question this repo can answer today: what is missing.

**Files:**
- Create: `dashboard/cmd/career-data/main.go`
- Create: `dashboard/cmd/career-data/doctor.go`
- Test: `dashboard/cmd/career-data/doctor_test.go`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `func fail(code, message string) int` — prints `{"ok":false,"error":code,"message":...}` to stdout, returns exit code 1.
  - `func emit(v any) int` — marshals `v` to stdout with a trailing newline, returns 0.
  - `type DoctorResult struct { OK bool; CareerOpsPath string; TrackerPath *string; Missing []string; Ready bool }`
  - `func runDoctor(root string) DoctorResult`
  - `func resolveTracker(root string) (string, bool)` — returns `<root>/applications.md` if it exists, else `<root>/data/applications.md` if it exists, else `ok=false`.

- [ ] **Step 1: Write the failing test**

Create `dashboard/cmd/career-data/doctor_test.go`:

```go
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRunDoctorEmptyRoot(t *testing.T) {
	root := t.TempDir()

	got := runDoctor(root)

	if got.Ready {
		t.Fatalf("Ready = true, want false for an empty root")
	}
	if got.TrackerPath != nil {
		t.Fatalf("TrackerPath = %v, want nil", *got.TrackerPath)
	}
	want := []string{"cv.md", "config/profile.yml", "modes/_profile.md", "portals.yml", "data/applications.md"}
	if len(got.Missing) != len(want) {
		t.Fatalf("Missing = %v, want %v", got.Missing, want)
	}
	for i, w := range want {
		if got.Missing[i] != w {
			t.Errorf("Missing[%d] = %q, want %q", i, got.Missing[i], w)
		}
	}
}

func TestRunDoctorFindsTrackerInDataDir(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "data"), 0o755); err != nil {
		t.Fatal(err)
	}
	tracker := filepath.Join(root, "data", "applications.md")
	if err := os.WriteFile(tracker, []byte("# Applications Tracker\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	got := runDoctor(root)

	if !got.Ready {
		t.Fatalf("Ready = false, want true when the tracker exists")
	}
	if got.TrackerPath == nil || *got.TrackerPath != tracker {
		t.Fatalf("TrackerPath = %v, want %q", got.TrackerPath, tracker)
	}
	for _, m := range got.Missing {
		if m == "data/applications.md" {
			t.Errorf("Missing still lists data/applications.md")
		}
	}
}

func TestRunDoctorFindsTrackerAtRoot(t *testing.T) {
	root := t.TempDir()
	tracker := filepath.Join(root, "applications.md")
	if err := os.WriteFile(tracker, []byte("# Applications Tracker\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	got := runDoctor(root)

	if got.TrackerPath == nil || *got.TrackerPath != tracker {
		t.Fatalf("TrackerPath = %v, want %q", got.TrackerPath, tracker)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && go test ./cmd/career-data/ -run TestRunDoctor -v`
Expected: FAIL — `undefined: runDoctor`.

- [ ] **Step 3: Write `doctor.go`**

Create `dashboard/cmd/career-data/doctor.go`:

```go
package main

import (
	"os"
	"path/filepath"
)

// onboardingFiles are the files career-ops needs before any evaluation can run.
// Order is display order in the empty state, so it is fixed, not alphabetical.
var onboardingFiles = []string{
	"cv.md",
	"config/profile.yml",
	"modes/_profile.md",
	"portals.yml",
	"data/applications.md",
}

// DoctorResult reports which onboarding files are missing under root.
type DoctorResult struct {
	OK            bool     `json:"ok"`
	CareerOpsPath string   `json:"careerOpsPath"`
	TrackerPath   *string  `json:"trackerPath"`
	Missing       []string `json:"missing"`
	Ready         bool     `json:"ready"`
}

// resolveTracker mirrors ParseApplications: the tracker sits at the root, or
// else under data/.
func resolveTracker(root string) (string, bool) {
	for _, rel := range []string{"applications.md", filepath.Join("data", "applications.md")} {
		p := filepath.Join(root, rel)
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p, true
		}
	}
	return "", false
}

func runDoctor(root string) DoctorResult {
	res := DoctorResult{OK: true, CareerOpsPath: root, Missing: []string{}}

	tracker, hasTracker := resolveTracker(root)
	if hasTracker {
		res.TrackerPath = &tracker
		res.Ready = true
	}

	for _, rel := range onboardingFiles {
		if rel == "data/applications.md" {
			if !hasTracker {
				res.Missing = append(res.Missing, rel)
			}
			continue
		}
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(rel))); err != nil {
			res.Missing = append(res.Missing, rel)
		}
	}

	return res
}
```

- [ ] **Step 4: Write `main.go`**

Create `dashboard/cmd/career-data/main.go`:

```go
// Command career-data exposes the career-ops dashboard data layer as JSON on
// stdout, for the Tauri desktop app to consume.
//
// It imports the TUI's data package and adds nothing to it. Existing files
// under dashboard/ are never modified, because update-system.mjs reverts
// modifications to system paths but leaves new files alone.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

// errorPayload is the shape every failure takes on stdout.
type errorPayload struct {
	OK      bool   `json:"ok"`
	Error   string `json:"error"`
	Message string `json:"message"`
}

// emit writes v as JSON to stdout and reports the process exit code.
func emit(v any) int {
	enc := json.NewEncoder(os.Stdout)
	if err := enc.Encode(v); err != nil {
		fmt.Fprintf(os.Stderr, "encode: %v\n", err)
		return 1
	}
	return 0
}

// fail writes a machine-readable error to stdout, a human-readable one to
// stderr, and reports exit code 1.
func fail(code, message string) int {
	fmt.Fprintf(os.Stderr, "%s: %s\n", code, message)
	_ = emit(errorPayload{OK: false, Error: code, Message: message})
	return 1
}

const usage = `career-data <command> [flags]

Commands:
  doctor      --path <dir>
  list        --path <dir>
  report      --path <dir> --file <reportPath>
  set-status  --path <dir> --report-number <n> --expect-status <s> --status <s>
`

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(args []string) int {
	if len(args) == 0 {
		fmt.Fprint(os.Stderr, usage)
		return fail("usage", "no command given")
	}

	cmd, rest := args[0], args[1:]

	switch cmd {
	case "doctor":
		fs := flag.NewFlagSet("doctor", flag.ContinueOnError)
		path := fs.String("path", "", "career-ops root directory")
		if err := fs.Parse(rest); err != nil {
			return fail("usage", err.Error())
		}
		if *path == "" {
			return fail("usage", "--path is required")
		}
		return emit(runDoctor(*path))

	default:
		fmt.Fprint(os.Stderr, usage)
		return fail("usage", "unknown command: "+cmd)
	}
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd dashboard && go test ./cmd/career-data/ -v`
Expected: PASS — three tests.

- [ ] **Step 6: Verify `go.mod` is untouched and the TUI still builds**

Run: `cd dashboard && git diff --ignore-cr-at-eol --exit-code -- go.mod go.sum && go build ./... && go test ./...`
Expected: no diff output, exit 0, all existing tests pass. `--ignore-cr-at-eol` is required: these files already differ from HEAD by line endings alone, so a bare `--exit-code` fails before your change is even considered.

- [ ] **Step 7: Run it against the real repo**

Run both, because they exercise opposite branches:

```bash
cd dashboard
go run ./cmd/career-data doctor --path ..        # the real, onboarded repo
go run ./cmd/career-data doctor --path /tmp      # a directory with nothing
```

Expected from the real repo: `"ready":true`, `"missing":[]`, and `trackerPath` pointing at `../data/applications.md`. The repo is fully onboarded — `cv.md`, `config/profile.yml`, `modes/_profile.md`, `portals.yml` and the tracker all exist.

Expected from `/tmp`: `"ready":false` and all five paths listed in `missing`, in the order `onboardingFiles` declares them.

Note for anyone reading an earlier revision of this plan: it asserted the repo was un-onboarded and predicted the second output for the first command. That was a controller error — the check behind it ran from inside `dashboard/`, so every relative path missed.

- [ ] **Step 8: Commit**

```bash
git add dashboard/cmd/career-data/
git commit -m "feat(sidecar): add career-data command with doctor subcommand"
```

---

## Task 2: Sidecar `list`

Turns the data layer into the payload the whole frontend reads. Includes the dirty-data fixtures every later Go task reuses.

**Files:**
- Create: `dashboard/cmd/career-data/list.go`
- Create: `dashboard/cmd/career-data/testdata/career-ops/data/applications.md`
- Create: `dashboard/cmd/career-data/testdata/career-ops/reports/001-offerpad-2026-07-01.md`
- Create: `dashboard/cmd/career-data/testdata/career-ops/output/offerpad-cv.pdf`
- Test: `dashboard/cmd/career-data/list_test.go`
- Modify: `dashboard/cmd/career-data/main.go` (add the `list` case to the switch)

**Interfaces:**
- Consumes: `emit`, `fail`, `resolveTracker` from Task 1.
- Produces:
  - `type ListResult struct { OK bool; Applications []Application; Metrics Metrics; Progress Progress }`
  - `type Application struct` with JSON keys `number, date, company, role, status, normStatus, statusPriority, score, scoreRaw, hasPdf, pdfPath, reportPath, reportNumber, notes, jobUrl, archetype, tldr, remote, compEstimate`

    `normStatus` and `statusPriority` are `data.NormalizeStatus(status)` and `data.StatusPriority(status)`, emitted rather than left for the frontend to recompute. `NormalizeStatus` is 30 lines of bilingual pattern matching (career.go:473-505) and `StatusPriority` encodes the group order (career.go:593-614). A TypeScript reimplementation of either would be a second copy of domain logic, free to drift from the Go one — the exact failure this architecture exists to prevent.
  - `func runList(root string) (ListResult, error)`
  - `func resolvePDF(root, company string) string` — returns a root-relative path when exactly one `output/*.pdf` matches the company slug, else `""`.
  - `func slugify(s string) string` — lowercases, replaces every run of non-alphanumeric bytes with `-`, trims leading and trailing `-`.

- [ ] **Step 0: Write `summary.go` — report field extraction**

`data.LoadReportSummary` extracts nothing from any real report. Its regexes want a Spanish, bold, pipe-table form; across the repo's 30 reports, `Arquetipo` appears 0 times, `**TL;DR**|` 0, `**Remote**|` 0, `**Comp**|` 0. This is the one place the sidecar reimplements instead of delegating. Full reasoning and measurements: spec §4.1.

Real reports use two forms, and both must match:

```
**Archetype:** Technical PM (Intern-level)      ← header colon form
| Archetype | Technical PM (Intern) |           ← table row form
```

Create `dashboard/cmd/career-data/summary.go`:

```go
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
	// actually occur. Coverage is 2/30 — a property of the data, not the
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
```

Write `dashboard/cmd/career-data/summary_test.go` covering, at minimum: the header-colon form; the table-row form; a report carrying both, where the header form wins; a bold value inside a table cell (`| Archetype | **Platform** |`); a field that is absent, returning `""`; `Compensation`, `Comp assessment` and `Salary benchmarks` all matching the comp field; and the scoring-table guard — given

```
| Comp | 1.0 | €800–1,500/month vs €52,000+/year minimum |
```

`comp` must come back `""`, not `"1.0"`. That row shape is real (reports/001), and showing a score where a salary belongs is worse than showing nothing.

Then confirm the real corpus, which is the whole point of this change:

```bash
cd dashboard && go run ./cmd/career-data list --path .. \
  | python3 -c "import json,sys; a=json.load(sys.stdin)['applications']; print({k: sum(1 for x in a if x[k]) for k in ('archetype','tldr','remote','compEstimate')}, 'of', len(a))"
```

**The gate is archetype 30, tldr 30, remote 24.** Any of those near zero means the patterns regressed to the data layer's behavior, which is the bug this whole change exists to fix.

**Comp is reported, not asserted.** It measures 2. Do not tune the patterns to move it: the reports do not record compensation as a field, and the four that come closest write multi-line market-research blocks (`**Salary benchmarks (Germany, 2025–2026):**` followed by bullets) that would not fit the card's one line even if extracted. The `Salary\s+benchmarks` alternative in `patComp` currently matches nothing real; it is kept because it costs nothing and would match a clean one-line form if a future report used one.

If your measured comp differs from 2, report the number and which reports moved. Do not change code to reach it.

- [ ] **Step 1: Create the fixture tracker**

Create `dashboard/cmd/career-data/testdata/career-ops/data/applications.md`. Every row here is a trap that has to survive parsing and, later, writing:

```markdown
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-07-01 | Offerpad | Staff Engineer | 4.6/5 | Offer | ✅ | [001](reports/001-offerpad-2026-07-01.md) | Company name contains the word Offer |
| 2 | 2026-07-02 | Acme | Backend Engineer | 4.0/5 | Applied | ❌ | [002](reports/002-acme-2026-07-02.md) | Interview scheduled for next week |
| 3 | 2026-07-03 | Globex | Data Engineer | 3.5/5 | Evaluated | ❌ | [003](reports/003-globex-2026-07-03.md) | Mid band |
| 4 | 2026-07-04 | Initech | SRE | 2.4/5 | SKIP | ❌ | [004](reports/004-initech-2026-07-04.md) | Below threshold |
| 5 | 2026-07-05 | Umbrella | ML Engineer | 4.9/5 | Interview | ✅ | [005](reports/005-umbrella-2026-07-05.md) | Top band |
| 6 | 2026-07-06 | Hooli | Platform Engineer | 3.9/5 | Rejected | ❌ | [006](reports/006-hooli-2026-07-06.md) | Yellow band |
| 7 | 2026-07-07 | Soylent | Analyst | 3.2/5 | Discarded | ❌ | [007](reports/007-soylent-2026-07-07.md) | Closed posting |
| 8 | 2026-07-08 | Vehement | Architect | 4.3/5 | Responded | ❌ | [008](reports/008-vehement-2026-07-08.md) | Recruiter replied |
| 9 | 2026-07-09 | Tooshort |
```

Row 9 has four cells and must be skipped by the parser, not crash it.

- [ ] **Step 2: Create the fixture report and PDF**

Create `dashboard/cmd/career-data/testdata/career-ops/reports/001-offerpad-2026-07-01.md`:

```markdown
# 001 — Offerpad — Staff Engineer

**Date:** 2026-07-01
**Archetype:** Platform / Infra
**Score:** 4.6/5
**URL:** https://jobs.example.test/offerpad/staff-engineer
**Legitimacy:** verified
**PDF:** ✅
**TL;DR:** Strong infra match, comp band above target, remote-friendly team
**Remote:** Remote (EU)

---

## A) Role Summary

| Dimension | Value |
|-----------|-------|
| Archetype | Platform / Infra |
| Domain | Developer infrastructure |
| Comp | 90-110k EUR |

Fixture content.
```

This mirrors the shape of the repo's real reports — English header-colon fields above a plain table — rather than the Spanish bold-pipe form `data.LoadReportSummary` demands. `extractSummary` must handle it, and the fixture is worthless as a fixture if it does not look like real data.

Create a non-empty placeholder PDF so the glob has something to find:

```bash
mkdir -p dashboard/cmd/career-data/testdata/career-ops/output
printf '%%PDF-1.4\n%%EOF\n' > dashboard/cmd/career-data/testdata/career-ops/output/offerpad-cv.pdf
```

- [ ] **Step 3: Write the failing test**

Create `dashboard/cmd/career-data/list_test.go`:

```go
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd dashboard && go test ./cmd/career-data/ -run 'TestSlugify|TestRunList|TestResolvePDF' -v`
Expected: FAIL — `undefined: slugify`, `undefined: runList`, `undefined: resolvePDF`.

- [ ] **Step 5: Write `list.go`**

Create `dashboard/cmd/career-data/list.go`:

```go
package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/santifer/career-ops/dashboard/internal/data"
	"github.com/santifer/career-ops/dashboard/internal/model"
)

// errNoTracker means applications.md exists at neither candidate location.
var errNoTracker = errors.New("tracker not found")

// Application is the wire form of model.CareerApplication plus a resolved PDF
// path. Field order matches the tracker's column order for readability.
type Application struct {
	Number       int     `json:"number"`
	Date         string  `json:"date"`
	Company      string  `json:"company"`
	Role         string  `json:"role"`
	Status       string  `json:"status"`
	NormStatus   string  `json:"normStatus"`
	StatusPrio   int     `json:"statusPriority"`
	Score        float64 `json:"score"`
	ScoreRaw     string  `json:"scoreRaw"`
	HasPDF       bool    `json:"hasPdf"`
	PDFPath      string  `json:"pdfPath"`
	ReportPath   string  `json:"reportPath"`
	ReportNumber string  `json:"reportNumber"`
	Notes        string  `json:"notes"`
	JobURL       string  `json:"jobUrl"`
	Archetype    string  `json:"archetype"`
	TlDr         string  `json:"tldr"`
	Remote       string  `json:"remote"`
	CompEstimate string  `json:"compEstimate"`
}

// ListResult is the full payload the frontend loads on startup and after every
// write.
type ListResult struct {
	OK           bool                 `json:"ok"`
	Applications []Application        `json:"applications"`
	Metrics      model.PipelineMetrics `json:"metrics"`
	Progress     model.ProgressMetrics `json:"progress"`
}

// slugify reduces a company name to a comparable token: lowercase, with every
// run of non-alphanumeric bytes collapsed to a single hyphen.
func slugify(s string) string {
	var b strings.Builder
	lastHyphen := true // suppresses a leading hyphen
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'A' && c <= 'Z':
			b.WriteByte(c + ('a' - 'A'))
			lastHyphen = false
		case (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'):
			b.WriteByte(c)
			lastHyphen = false
		default:
			if !lastHyphen {
				b.WriteByte('-')
				lastHyphen = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

// resolvePDF finds the generated CV for a company. generate-pdf.mjs takes its
// output path as a caller-supplied argument, so there is no naming convention
// to rely on: a unique slug match wins, anything else returns empty and the UI
// falls back to opening the output directory.
func resolvePDF(root, company string) string {
	slug := slugify(company)
	if slug == "" {
		return ""
	}
	matches, err := filepath.Glob(filepath.Join(root, "output", "*.pdf"))
	if err != nil {
		return ""
	}
	var hit string
	for _, m := range matches {
		if !strings.Contains(slugify(filepath.Base(m)), slug) {
			continue
		}
		if hit != "" {
			return "" // ambiguous
		}
		hit = m
	}
	if hit == "" {
		return ""
	}
	rel, err := filepath.Rel(root, hit)
	if err != nil {
		return ""
	}
	return filepath.ToSlash(rel)
}

func runList(root string) (ListResult, error) {
	apps := data.ParseApplications(root)
	if apps == nil {
		return ListResult{}, errNoTracker
	}

	out := ListResult{
		OK:           true,
		Applications: make([]Application, 0, len(apps)),
		Metrics:      data.ComputeMetrics(apps),
		Progress:     data.ComputeProgressMetrics(apps),
	}

	for _, a := range apps {
		item := Application{
			Number:       a.Number,
			Date:         a.Date,
			Company:      a.Company,
			Role:         a.Role,
			Status:       a.Status,
			NormStatus:   data.NormalizeStatus(a.Status),
			StatusPrio:   data.StatusPriority(a.Status),
			Score:        a.Score,
			ScoreRaw:     a.ScoreRaw,
			HasPDF:       a.HasPDF,
			ReportPath:   a.ReportPath,
			ReportNumber: a.ReportNumber,
			Notes:        a.Notes,
			JobURL:       a.JobURL,
		}
		if a.ReportPath != "" {
			// extractSummary, not data.LoadReportSummary — see summary.go for why.
			if content, err := os.ReadFile(filepath.Join(root, a.ReportPath)); err == nil {
				item.Archetype, item.TlDr, item.Remote, item.CompEstimate =
					extractSummary(string(content))
			}
		}
		if a.HasPDF {
			item.PDFPath = resolvePDF(root, a.Company)
		}
		out.Applications = append(out.Applications, item)
	}

	return out, nil
}
```

- [ ] **Step 6: Wire `list` into the dispatcher**

In `dashboard/cmd/career-data/main.go`, add this case to the switch in `run`, directly above `default:`:

```go
	case "list":
		fs := flag.NewFlagSet("list", flag.ContinueOnError)
		path := fs.String("path", "", "career-ops root directory")
		if err := fs.Parse(rest); err != nil {
			return fail("usage", err.Error())
		}
		if *path == "" {
			return fail("usage", "--path is required")
		}
		res, err := runList(*path)
		if err != nil {
			return fail("not-found", "applications.md not found under "+*path)
		}
		return emit(res)
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd dashboard && go test ./cmd/career-data/ -v`
Expected: PASS — eight tests (Task 1's three plus five new).

- [ ] **Step 8: Confirm nothing under `dashboard/` outside `cmd/` changed**

Run: `cd dashboard && git diff --ignore-cr-at-eol --stat -- . ':(exclude)cmd/career-data' | grep . && echo DIRTY || echo CLEAN`
Expected: `CLEAN`. This asserts no *content* change to the existing TUI. A bare `git status` cannot be used: the tree already shows fifteen dirty paths under `dashboard/` from the pre-existing CRLF divergence.

- [ ] **Step 9: Commit**

```bash
git add dashboard/cmd/career-data/
git commit -m "feat(sidecar): add list subcommand with dirty-data fixtures"
```

---

## Task 3: Sidecar `report`

Small, but it owns the path-escape check. A reviewer could accept `list` and still reject this, so it gets its own gate.

**Files:**
- Create: `dashboard/cmd/career-data/report.go`
- Test: `dashboard/cmd/career-data/report_test.go`
- Modify: `dashboard/cmd/career-data/main.go` (add the `report` case)

**Interfaces:**
- Consumes: `emit`, `fail` from Task 1.
- Produces:
  - `type ReportResult struct { OK bool; Path string; Markdown string; Archetype string; TlDr string; Remote string; Comp string }`
  - `func runReport(root, rel string) (ReportResult, error)`
  - `var errPathEscape = errors.New("path escapes root")`

- [ ] **Step 1: Write the failing test**

Create `dashboard/cmd/career-data/report_test.go`:

```go
package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunReportReadsMarkdownAndSummary(t *testing.T) {
	res, err := runReport("testdata/career-ops", "reports/001-offerpad-2026-07-01.md")
	if err != nil {
		t.Fatalf("runReport: %v", err)
	}
	// "A) Role Summary" is the heading real reports use, and the fixture was
	// rewritten to match them in Task 2. An earlier revision of this plan
	// asserted "Block A — Role Summary", which no report or fixture contains.
	if !strings.Contains(res.Markdown, "A) Role Summary") {
		t.Errorf("Markdown does not contain the report body")
	}
	if res.Archetype != "Platform / Infra" {
		t.Errorf("Archetype = %q, want %q", res.Archetype, "Platform / Infra")
	}
	if res.Remote != "Remote (EU)" {
		t.Errorf("Remote = %q, want %q", res.Remote, "Remote (EU)")
	}
}

func TestRunReportRejectsEscapingPath(t *testing.T) {
	for _, rel := range []string{
		"../../../etc/passwd",
		"reports/../../go.mod",
		"/etc/passwd",
	} {
		if _, err := runReport("testdata/career-ops", rel); !errors.Is(err, errPathEscape) {
			t.Errorf("runReport(%q) error = %v, want errPathEscape", rel, err)
		}
	}
}

func TestRunReportMissingFile(t *testing.T) {
	if _, err := runReport("testdata/career-ops", "reports/999-nope.md"); err == nil {
		t.Error("runReport for a missing file returned nil error")
	} else if errors.Is(err, errPathEscape) {
		t.Error("a missing file was reported as a path escape")
	}
}

// TestSafeJoinSymlinkEscape covers the case EvalSymlinks cannot: it fails
// all-or-nothing on a missing path, so a symlinked directory pointing outside
// root, asked for a leaf that does not exist, would fall back to the
// unresolved lexical path and slip through a prefix check.
func TestSafeJoinSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()

	if err := os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("no"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "escape")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}

	for _, rel := range []string{
		"escape/secret.txt",       // target exists — EvalSymlinks resolves it
		"escape/does-not-exist.md", // target missing — the case that regressed
	} {
		got, err := safeJoin(root, rel)
		if !errors.Is(err, errPathEscape) {
			t.Errorf("safeJoin(%q) = %q, err %v; want errPathEscape", rel, got, err)
		}
	}
}

// resolvedRoot is what safeJoin's return value can be compared against.
//
// safeJoin resolves symlinks on the root before building its result, so its
// return value is always a fully resolved path. On macOS t.TempDir() hands
// back something under /var/folders/…, and /var is a symlink to private/var —
// so the raw TempDir path never prefix-matches safeJoin's output. Comparing
// against the unresolved path fails on every macOS machine while the code is
// perfectly correct.
func resolvedRoot(t *testing.T, root string) string {
	t.Helper()
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatalf("EvalSymlinks(%q): %v", root, err)
	}
	return resolved
}

// A missing file that genuinely lives inside root must stay a missing file,
// not become an escape. This is the regression the symlink fix could cause.
func TestSafeJoinAllowsMissingFileInsideRoot(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "reports"), 0o755); err != nil {
		t.Fatal(err)
	}

	got, err := safeJoin(root, "reports/999-nope.md")
	if err != nil {
		t.Fatalf("safeJoin for a missing file inside root: %v", err)
	}
	want := resolvedRoot(t, root)
	if !strings.HasPrefix(got, want+string(filepath.Separator)) {
		t.Errorf("safeJoin = %q, want a path under %q", got, want)
	}
}

// A missing file in a directory that does not exist either must also stay
// inside root — resolveNearest has to walk up more than one level here.
func TestSafeJoinAllowsMissingDirInsideRoot(t *testing.T) {
	root := t.TempDir()

	got, err := safeJoin(root, "no/such/dir/report.md")
	if err != nil {
		t.Fatalf("safeJoin for a missing nested path inside root: %v", err)
	}
	want := resolvedRoot(t, root)
	if !strings.HasPrefix(got, want+string(filepath.Separator)) {
		t.Errorf("safeJoin = %q, want a path under %q", got, want)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && go test ./cmd/career-data/ -run TestRunReport -v`
Expected: FAIL — `undefined: runReport`.

- [ ] **Step 3: Write `report.go`**

Create `dashboard/cmd/career-data/report.go`:

```go
package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/santifer/career-ops/dashboard/internal/data"
)

// errPathEscape means the requested report resolves outside the career-ops
// root. The frontend passes paths straight from the tracker, but the tracker is
// user-editable text, so the check belongs here.
var errPathEscape = errors.New("path escapes root")

// ReportResult carries the full markdown plus the same summary fields list
// returns, so the preview card and the rendered body come from one round trip.
type ReportResult struct {
	OK        bool   `json:"ok"`
	Path      string `json:"path"`
	Markdown  string `json:"markdown"`
	Archetype string `json:"archetype"`
	TlDr      string `json:"tldr"`
	Remote    string `json:"remote"`
	Comp      string `json:"comp"`
}

// resolveNearest resolves symlinks on the deepest ancestor of p that exists,
// then re-appends the components that do not.
//
// filepath.EvalSymlinks fails all-or-nothing when any component is missing.
// Falling back to the unresolved lexical path on that error is unsafe: a
// symlinked directory inside root pointing outside it, asked for a leaf that
// does not exist, yields a path that still textually sits under root and
// passes a prefix check while resolving outside root at the OS level.
// Resolving the existing ancestor closes that hole while leaving ordinary
// missing files inside root reported as missing, not as escapes.
func resolveNearest(p string) (string, error) {
	var missing []string
	cur := p
	for {
		if resolved, err := filepath.EvalSymlinks(cur); err == nil {
			out := resolved
			for i := len(missing) - 1; i >= 0; i-- {
				out = filepath.Join(out, missing[i])
			}
			return out, nil
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			return "", errPathEscape
		}
		missing = append(missing, filepath.Base(cur))
		cur = parent
	}
}

// safeJoin resolves rel under root and confirms the result stays inside it,
// after symlinks are followed on whichever ancestors already exist.
func safeJoin(root, rel string) (string, error) {
	if filepath.IsAbs(rel) {
		return "", errPathEscape
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(absRoot); err == nil {
		absRoot = resolved
	}

	target, err := resolveNearest(filepath.Join(absRoot, filepath.FromSlash(rel)))
	if err != nil {
		return "", err
	}

	// absRoot+Separator, not a bare prefix — otherwise /rootsuffix passes as
	// being inside /root.
	if target != absRoot && !strings.HasPrefix(target, absRoot+string(filepath.Separator)) {
		return "", errPathEscape
	}
	return target, nil
}

func runReport(root, rel string) (ReportResult, error) {
	full, err := safeJoin(root, rel)
	if err != nil {
		return ReportResult{}, err
	}

	content, err := os.ReadFile(full)
	if err != nil {
		return ReportResult{}, err
	}

	res := ReportResult{OK: true, Path: rel, Markdown: string(content)}
	res.Archetype, res.TlDr, res.Remote, res.Comp = extractSummary(res.Markdown)
	return res, nil
}
```

- [ ] **Step 4: Wire `report` into the dispatcher**

In `dashboard/cmd/career-data/main.go`, add this case directly above `default:`:

```go
	case "report":
		fs := flag.NewFlagSet("report", flag.ContinueOnError)
		path := fs.String("path", "", "career-ops root directory")
		file := fs.String("file", "", "report path, relative to the root")
		if err := fs.Parse(rest); err != nil {
			return fail("usage", err.Error())
		}
		if *path == "" || *file == "" {
			return fail("usage", "--path and --file are both required")
		}
		res, err := runReport(*path, *file)
		switch {
		case errors.Is(err, errPathEscape):
			return fail("invalid-path", "report path resolves outside the career-ops root")
		case err != nil:
			return fail("io-error", err.Error())
		}
		return emit(res)
```

Add `"errors"` to that file's import block.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd dashboard && go test ./cmd/career-data/ -v`
Expected: PASS — eleven tests.

- [ ] **Step 6: Commit**

```bash
git add dashboard/cmd/career-data/
git commit -m "feat(sidecar): add report subcommand with path-escape validation"
```

---

## Task 4: Status cell location (`rows.go`)

Pure string arithmetic, no filesystem. This is the core of write safety, so it is tested alone before anything touches a real file.

The approach is a **byte-span splice, not a split-and-rejoin.** Splitting a row into cells and rejoining them loses the original padding and delimiter spacing, which would show up as noise in `git diff`. Locating the byte range of the status cell's trimmed content and splicing over just that range leaves every other byte of the row untouched by construction.

**Files:**
- Create: `dashboard/cmd/career-data/rows.go`
- Test: `dashboard/cmd/career-data/rows_test.go`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `func statusSpan(raw string) (start, end int, ok bool)` — byte offsets of the status cell's value, **excluding** any markdown bold markers. This is the comparison span: writer.go's optimistic lock matches it against the canonical status the caller supplies. `ok` is false when `raw` is not a data row.
  - `func statusReplaceSpan(raw string) (start, end int, ok bool)` — the same cell **including** bold markers. This is the replacement span.
  - `func spliceStatus(raw, newStatus string) (string, bool)` — splices over the replacement span.
  - `func cellSpans(raw string) [][2]int` and `func trimSpan(raw string, span [2]int) (int, int)` — Task 5 calls both directly to read cell 7, the report link.
  - `const statusCellIndex = 5`

**Why two spans.** A legacy row may hold `**Applied**`. The lock has to see `Applied` so it can match the canonical value the frontend sends — otherwise every bold row reads as stale and becomes unwritable. The splice has to cover `**Applied**` so the rewrite yields `Offer` rather than `**Offer**`, because AGENTS.md forbids markdown bold in the status field. One span cannot satisfy both.

- [ ] **Step 1: Write the failing test**

Create `dashboard/cmd/career-data/rows_test.go`:

```go
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && go test ./cmd/career-data/ -run 'TestStatusSpan|TestSpliceStatus' -v`
Expected: FAIL — `undefined: statusSpan`, `undefined: spliceStatus`.

- [ ] **Step 3: Write `rows.go`**

Create `dashboard/cmd/career-data/rows.go`:

```go
package main

import (
	"strings"
	"unicode"
)

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
```

- [ ] **Step 3b: Write the parser-parity test**

This is the test that catches the whole class of bug this task can produce. `cellSpans` is a second implementation of `ParseApplications`'s splitting rules; if the two ever disagree about which cell is the status, the writer edits a different cell than the reader reports, silently. Rather than assert the rules by hand, run both over the same rows and compare.

Create `dashboard/cmd/career-data/rows_parity_test.go`:

```go
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dashboard && go test ./cmd/career-data/ -run 'TestStatusSpan|TestSpliceStatus|TestCellSpans' -v`
Expected: PASS. `TestCellSpansAgreesWithParser` is the one to watch — it fails loudly on any splitting rule that drifts from the parser.

- [ ] **Step 5: Run the whole package**

Run: `cd dashboard && go test ./cmd/career-data/ -v`
Expected: PASS — eighteen tests.

- [ ] **Step 6: Commit**

```bash
git add dashboard/cmd/career-data/rows.go dashboard/cmd/career-data/rows_test.go
git commit -m "feat(sidecar): locate the status cell by byte span, not string replace"
```

---

## Task 5: Sidecar `set-status`

The only code in this project that writes user data. `applications.md` cannot be regenerated, so this task carries four protections and the heaviest test coverage.

**On line endings:** splitting the file on `"\n"` leaves any `"\r"` attached to the end of each line, and rejoining with `"\n"` reproduces those bytes exactly. No terminator detection is needed, and CRLF survives for free. `trimSpan` already excludes a trailing `"\r"` from the status span, so the splice never reaches it.

This repo's own `data/applications.md` is LF-only — it is gitignored, so it was never touched by the CRLF divergence that affects the tracked files. The CRLF handling still matters: `desktop/fixtures/career-ops/` and any other user's checkout may differ, and a writer that silently normalizes line endings would rewrite every row of such a file.

**Files:**
- Create: `dashboard/cmd/career-data/writer.go`
- Test: `dashboard/cmd/career-data/writer_test.go`
- Modify: `dashboard/cmd/career-data/main.go` (add the `set-status` case)

**Interfaces:**
- Consumes: `resolveTracker` (Task 1), `statusSpan` and `spliceStatus` (Task 4), `emit` and `fail` (Task 1).
- Produces:
  - `type SetStatusResult struct { OK bool; ReportNumber string; OldStatus string; NewStatus string; Backup string }`
  - `func setStatus(root, reportNumber, expect, next string) (SetStatusResult, error)`
  - `var errRowNotFound`, `var errInvalidStatus`
  - `type staleError struct { Actual string }` implementing `error`, matched with `errors.As` so the handler can report the value it actually found on disk. There is deliberately no `errStale` sentinel — the actual status has to travel with the error, which a bare sentinel cannot carry.
  - `var canonicalStatuses = []string{"Evaluated", "Applied", "Responded", "Interview", "Offer", "Rejected", "Discarded", "SKIP"}`

- [ ] **Step 1: Write the failing test**

Create `dashboard/cmd/career-data/writer_test.go`:

```go
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && go test ./cmd/career-data/ -run TestSetStatus -v`
Expected: FAIL — `undefined: setStatus`.

- [ ] **Step 3: Write `writer.go`**

Create `dashboard/cmd/career-data/writer.go`:

```go
package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

var (
	errRowNotFound   = errors.New("row not found")
	errInvalidStatus = errors.New("invalid status")
)

// canonicalStatuses is the allowed set, from templates/states.yml. Anything
// else is refused before the file is opened.
var canonicalStatuses = []string{
	"Evaluated", "Applied", "Responded", "Interview", "Offer", "Rejected", "Discarded", "SKIP",
}

// staleError means the row's status on disk is not what the caller expected,
// so the file changed outside the app and the write is refused.
type staleError struct {
	Actual string
}

func (e *staleError) Error() string {
	return fmt.Sprintf("row status is %q on disk", e.Actual)
}

// SetStatusResult is the success payload for set-status.
type SetStatusResult struct {
	OK           bool   `json:"ok"`
	ReportNumber string `json:"reportNumber"`
	OldStatus    string `json:"oldStatus"`
	NewStatus    string `json:"newStatus"`
	Backup       string `json:"backup"`
}

func isCanonical(s string) bool {
	for _, c := range canonicalStatuses {
		if c == s {
			return true
		}
	}
	return false
}

// rowHasReportNumber checks cell 7 (the report link) rather than the whole
// line, so a notes cell mentioning "[002]" cannot match the wrong row.
func rowHasReportNumber(raw, number string) bool {
	spans := cellSpans(raw)
	const reportCellIndex = 7
	if len(spans) <= reportCellIndex {
		return false
	}
	s, e := trimSpan(raw, spans[reportCellIndex])
	return strings.HasPrefix(raw[s:e], "["+number+"]")
}

// setStatus rewrites one row's status cell under four protections: an
// optimistic lock, a single-cell splice, a backup, and an atomic rename.
func setStatus(root, reportNumber, expect, next string) (SetStatusResult, error) {
	if !isCanonical(next) {
		return SetStatusResult{}, fmt.Errorf("%w: %q", errInvalidStatus, next)
	}

	tracker, ok := resolveTracker(root)
	if !ok {
		return SetStatusResult{}, errNoTracker
	}

	original, err := os.ReadFile(tracker)
	if err != nil {
		return SetStatusResult{}, err
	}

	// Splitting on "\n" leaves any "\r" attached to the end of each line, so
	// joining with "\n" reproduces the original bytes. CRLF survives without
	// any terminator detection.
	lines := strings.Split(string(original), "\n")

	target := -1
	for i, raw := range lines {
		if rowHasReportNumber(raw, reportNumber) {
			target = i
			break
		}
	}
	if target < 0 {
		return SetStatusResult{}, fmt.Errorf("%w: report %s", errRowNotFound, reportNumber)
	}

	start, end, ok := statusSpan(lines[target])
	if !ok {
		return SetStatusResult{}, fmt.Errorf("%w: report %s has no status cell", errRowNotFound, reportNumber)
	}

	actual := lines[target][start:end]
	if actual != expect {
		return SetStatusResult{}, &staleError{Actual: actual}
	}

	backupRel, err := writeBackup(root, tracker, original)
	if err != nil {
		return SetStatusResult{}, err
	}

	updated, _ := spliceStatus(lines[target], next)
	lines[target] = updated

	if err := atomicWrite(tracker, []byte(strings.Join(lines, "\n"))); err != nil {
		return SetStatusResult{}, err
	}

	return SetStatusResult{
		OK:           true,
		ReportNumber: reportNumber,
		OldStatus:    actual,
		NewStatus:    next,
		Backup:       backupRel,
	}, nil
}

// writeBackup copies the pre-write bytes next to the tracker and returns the
// backup's path relative to root. One level, overwritten each time.
func writeBackup(root, tracker string, content []byte) (string, error) {
	backup := filepath.Join(filepath.Dir(tracker), ".applications.md.bak")
	if err := os.WriteFile(backup, content, 0o644); err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, backup)
	if err != nil {
		return backup, nil
	}
	return filepath.ToSlash(rel), nil
}

// atomicWrite writes to a temp file in the target's directory and renames over
// it, so a crash mid-write leaves the original intact.
func atomicWrite(path string, content []byte) error {
	dir := filepath.Dir(path)

	mode := os.FileMode(0o644)
	if st, err := os.Stat(path); err == nil {
		mode = st.Mode().Perm()
	}

	tmp, err := os.CreateTemp(dir, ".applications.md.tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op once the rename succeeds

	if _, err := io.Copy(tmp, strings.NewReader(string(content))); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, mode); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}
```

- [ ] **Step 4: Wire `set-status` into the dispatcher**

In `dashboard/cmd/career-data/main.go`, add this case directly above `default:`:

```go
	case "set-status":
		fs := flag.NewFlagSet("set-status", flag.ContinueOnError)
		path := fs.String("path", "", "career-ops root directory")
		number := fs.String("report-number", "", "report number, e.g. 001")
		expect := fs.String("expect-status", "", "the status the caller last saw")
		next := fs.String("status", "", "the new status")
		if err := fs.Parse(rest); err != nil {
			return fail("usage", err.Error())
		}
		if *path == "" || *number == "" || *expect == "" || *next == "" {
			return fail("usage", "--path, --report-number, --expect-status and --status are all required")
		}

		res, err := setStatus(*path, *number, *expect, *next)
		var stale *staleError
		switch {
		case errors.As(err, &stale):
			_ = emit(struct {
				OK           bool   `json:"ok"`
				Error        string `json:"error"`
				Message      string `json:"message"`
				ActualStatus string `json:"actualStatus"`
			}{
				OK:    false,
				Error: "stale",
				Message: fmt.Sprintf(
					"Row %s currently reads %q, expected %q. The file changed outside the app.",
					*number, stale.Actual, *expect),
				ActualStatus: stale.Actual,
			})
			return 1
		case errors.Is(err, errInvalidStatus):
			return fail("invalid-status", err.Error())
		case errors.Is(err, errRowNotFound):
			return fail("not-found", err.Error())
		case errors.Is(err, errNoTracker):
			return fail("not-found", "applications.md not found under "+*path)
		case err != nil:
			return fail("io-error", err.Error())
		}
		return emit(res)
```

Add `"fmt"` to that file's import block if it is not already there.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd dashboard && go test ./cmd/career-data/ -v`
Expected: PASS — twenty-six tests.

- [ ] **Step 6: Confirm the TUI is untouched and still green**

```bash
cd dashboard
git diff --ignore-cr-at-eol --exit-code -- go.mod go.sum && echo "go.mod unchanged"
go test ./...
git diff --ignore-cr-at-eol --stat -- . ':(exclude)cmd/career-data' | grep . && echo DIRTY || echo CLEAN
```
Expected: `go.mod unchanged`, every package green, `CLEAN`.

- [ ] **Step 7: Commit**

```bash
git add dashboard/cmd/career-data/
git commit -m "feat(sidecar): add set-status with optimistic lock, backup and atomic write"
```

---

## Task 6: Tauri scaffold, sidecar build, Rust bridge

Ends with a window on screen that shows real `doctor` output from the real repo. No React UI yet beyond a `<pre>`.

**Files:**
- Create: `desktop/` (scaffolded)
- Create: `desktop/scripts/build-sidecar.mjs`
- Create: `desktop/src-tauri/src/sidecar.rs`
- Create: `desktop/.env.example`
- Create: `desktop/.gitignore`
- Modify: `desktop/src-tauri/src/lib.rs`
- Modify: `desktop/src-tauri/Cargo.toml`
- Modify: `desktop/src-tauri/tauri.conf.json`
- Modify: `desktop/src-tauri/capabilities/default.json`
- Modify: `desktop/package.json`
- Modify: `desktop/src/App.tsx`

**Interfaces:**
- Consumes: the `career-data` binary built from `dashboard/cmd/career-data` (Tasks 1-5).
- Produces, callable from TypeScript via `invoke`:
  - `doctor(path: string) -> Value`
  - `list_applications(path: string) -> Value`
  - `read_report(path: string, file: string) -> Value`
  - `set_status(path: string, reportNumber: string, expectStatus: string, status: string) -> Value`

  Every one resolves to the sidecar's parsed JSON, including `{ok: false, ...}` payloads. They reject only when the sidecar could not run or did not produce JSON.

- [ ] **Step 1: Check the scaffolder's flags, then scaffold**

Run: `npm create tauri-app@latest -- --help`

Read the output, then scaffold a React + TypeScript app into `desktop/`. With the current CLI that is:

```bash
cd /Users/shane_yeh/Projects/career-ops
npm create tauri-app@latest desktop -- --template react-ts --manager npm --yes
```

If the flags differ, run it interactively and choose: TypeScript/JavaScript → npm → React → TypeScript.

- [ ] **Step 2: Install dependencies and the plugins**

```bash
cd desktop
npm install
npm install @tauri-apps/plugin-shell @tauri-apps/plugin-dialog @tauri-apps/plugin-store @tauri-apps/plugin-opener
cd src-tauri
cargo add tauri-plugin-shell tauri-plugin-dialog tauri-plugin-store tauri-plugin-opener
cargo add serde_json
```

- [ ] **Step 3: Write the sidecar build script**

Create `desktop/scripts/build-sidecar.mjs`:

```js
// Builds the Go sidecar and names it the way Tauri expects: the binary
// declared in bundle.externalBin must exist as <name>-<target-triple>.
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '..');
const repoRoot = resolve(desktop, '..');
const goDir = join(repoRoot, 'dashboard');
const outDir = join(desktop, 'src-tauri', 'binaries');

function hostTriple() {
  const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  const match = out.match(/^host: (.+)$/m);
  if (!match) {
    throw new Error('could not read the host triple from `rustc -vV`');
  }
  return match[1].trim();
}

const triple = hostTriple();
const staged = join(goDir, 'career-data-build');

rmSync(staged, { force: true });
execFileSync('go', ['build', '-o', staged, './cmd/career-data'], {
  cwd: goDir,
  stdio: 'inherit',
});

mkdirSync(outDir, { recursive: true });
const target = join(outDir, `career-data-${triple}`);
copyFileSync(staged, target);
rmSync(staged, { force: true });

console.log(`sidecar: ${target}`);
```

- [ ] **Step 4: Add the npm scripts**

In `desktop/package.json`, set the `scripts` block to:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "build:sidecar": "node scripts/build-sidecar.mjs",
    "tauri": "tauri",
    "tauri:dev": "npm run build:sidecar && tauri dev",
    "tauri:build": "npm run build:sidecar && tauri build"
  }
}
```

- [ ] **Step 5: Run the build script and verify the binary lands**

```bash
cd desktop && npm run build:sidecar
ls src-tauri/binaries/
```
Expected: one file named `career-data-<your-host-triple>`, for example `career-data-aarch64-apple-darwin`.

- [ ] **Step 6: Declare the sidecar and its permission**

In `desktop/src-tauri/tauri.conf.json`, add to the `bundle` object:

```json
"externalBin": ["binaries/career-data"]
```

Replace `desktop/src-tauri/capabilities/default.json` with:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "career-ops desktop dashboard",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "store:default",
    "opener:allow-open-path",
    "opener:allow-open-url",
    {
      "identifier": "shell:allow-execute",
      "allow": [{ "name": "binaries/career-data", "args": true, "sidecar": true }]
    }
  ]
}
```

The frontend never constructs a shell command; Rust owns spawning. This grant exists because the sidecar runs through the shell plugin, and it is scoped to that one binary.

- [ ] **Step 7: Write the Rust bridge**

Create `desktop/src-tauri/src/sidecar.rs`:

```rust
//! The only place that spawns the career-data sidecar.
//!
//! No parsing happens here. Domain logic lives in Go, presentation lives in
//! TypeScript, and this file moves bytes between them.

use serde_json::Value;
use tauri_plugin_shell::ShellExt;

/// Runs the sidecar and returns its stdout parsed as JSON.
///
/// A `{"ok": false, ...}` payload is a successful call: the sidecar ran and
/// reported a domain error, which the frontend renders. `Err` is reserved for
/// the sidecar failing to run or not producing JSON at all.
async fn run(app: &tauri::AppHandle, args: Vec<String>) -> Result<Value, String> {
    let command = app
        .shell()
        .sidecar("career-data")
        .map_err(|e| format!("sidecar not available: {e}. Run `npm run build:sidecar`."))?
        .args(args);

    let output = command
        .output()
        .await
        .map_err(|e| format!("sidecar failed to start: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    serde_json::from_str::<Value>(stdout.trim()).map_err(|e| {
        format!("sidecar did not return JSON ({e}).\nstdout: {stdout}\nstderr: {stderr}")
    })
}

#[tauri::command]
pub async fn doctor(app: tauri::AppHandle, path: String) -> Result<Value, String> {
    run(&app, vec!["doctor".into(), "--path".into(), path]).await
}

#[tauri::command]
pub async fn list_applications(app: tauri::AppHandle, path: String) -> Result<Value, String> {
    run(&app, vec!["list".into(), "--path".into(), path]).await
}

#[tauri::command]
pub async fn read_report(
    app: tauri::AppHandle,
    path: String,
    file: String,
) -> Result<Value, String> {
    run(
        &app,
        vec![
            "report".into(),
            "--path".into(),
            path,
            "--file".into(),
            file,
        ],
    )
    .await
}

#[tauri::command]
pub async fn set_status(
    app: tauri::AppHandle,
    path: String,
    report_number: String,
    expect_status: String,
    status: String,
) -> Result<Value, String> {
    run(
        &app,
        vec![
            "set-status".into(),
            "--path".into(),
            path,
            "--report-number".into(),
            report_number,
            "--expect-status".into(),
            expect_status,
            "--status".into(),
            status,
        ],
    )
    .await
}
```

- [ ] **Step 8: Register the plugins and commands**

Replace the body of `desktop/src-tauri/src/lib.rs` with:

```rust
mod sidecar;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            sidecar::doctor,
            sidecar::list_applications,
            sidecar::read_report,
            sidecar::set_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 9: Add the config files**

Create `desktop/.env.example`:

```
# Development override for the career-ops root directory.
# Without it the app uses the path stored in Tauri's app config, and asks for
# one on first launch. Never commit a real .env.
CAREER_OPS_PATH=./fixtures/career-ops
```

Create `desktop/.gitignore`:

```
node_modules/
dist/
.env
src-tauri/target/
src-tauri/binaries/
src-tauri/gen/
```

- [ ] **Step 10: Prove the bridge end to end**

Replace `desktop/src/App.tsx` with a temporary probe:

```tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function App() {
  const [out, setOut] = useState('loading…');

  useEffect(() => {
    invoke('doctor', { path: '..' })
      .then((r) => setOut(JSON.stringify(r, null, 2)))
      .catch((e) => setOut(`ERROR: ${e}`));
  }, []);

  return <pre style={{ padding: 16, fontFamily: 'ui-monospace, monospace' }}>{out}</pre>;
}
```

- [ ] **Step 11: Run it**

Run: `cd desktop && npm run tauri:dev`

Expected: a window showing the same JSON `go run ./cmd/career-data doctor --path ..` printed in Task 1 — `ready: false` with five missing files. If it shows `ERROR: sidecar not available`, `npm run build:sidecar` did not run or the triple in the filename does not match.

- [ ] **Step 12: Commit**

```bash
git add desktop/
git commit -m "feat(desktop): scaffold Tauri app with Go sidecar bridge"
```

---

## Task 7: Typed API, theme, config path, empty state

Delivers acceptance criterion 1: launched against this repo as it stands, the app shows the empty state naming the missing files.

**Files:**
- Create: `desktop/src/api.ts`
- Create: `desktop/src/theme.css`
- Create: `desktop/src/config.ts`
- Create: `desktop/src/screens/EmptyState.tsx`
- Modify: `desktop/src/App.tsx` (replace the Task 6 probe)
- Modify: `desktop/src/main.tsx` (import `theme.css`)

**Interfaces:**
- Consumes: the four Rust commands from Task 6.
- Produces:
  - `type Application` — TypeScript mirror of the Go struct, same JSON keys.
  - `type Metrics = { total: number; byStatus: Record<string, number>; avgScore: number; topScore: number; withPdf: number; actionable: number }`
  - `type FunnelStage = { label: string; count: number; pct: number }`
  - `type ScoreBucket = { label: string; count: number }`
  - `type WeekActivity = { week: string; count: number }`
  - `type Progress = { funnelStages: FunnelStage[]; scoreBuckets: ScoreBucket[]; weeklyActivity: WeekActivity[]; responseRate: number; interviewRate: number; offerRate: number; avgScore: number; topScore: number; totalOffers: number; activeApps: number }`
  - `type DoctorResult`, `type ListResult`, `type ReportResult`, `type SetStatusResult`
  - `type SidecarError = { ok: false; error: string; message: string; actualStatus?: string }`
  - `async function doctor(root: string): Promise<DoctorResult | SidecarError>`
  - `async function listApplications(root: string): Promise<ListResult | SidecarError>`
  - `async function readReport(root: string, file: string): Promise<ReportResult | SidecarError>`
  - `async function setStatus(root, reportNumber, expectStatus, status): Promise<SetStatusResult | SidecarError>`
  - `function isError(r: { ok: boolean }): r is SidecarError`
  - `async function loadRoot(): Promise<string | null>` and `async function saveRoot(p: string): Promise<void>` from `config.ts`
  - `async function pickRoot(): Promise<string | null>` from `config.ts`

**Note on Go's JSON casing.** `model.PipelineMetrics` and `model.ProgressMetrics` have no struct tags, so `encoding/json` emits their Go field names: `Total`, `ByStatus`, `AvgScore`, `FunnelStages`, `ScoreBuckets`, `WeeklyActivity`, `ResponseRate`, and so on — capitalized. Adding tags would mean modifying a file under `dashboard/`, which is forbidden. The TypeScript types therefore use the capitalized keys for these two objects, and only for these two. `Application` uses the lowercase keys from its own tags. Verify against real output before writing the types:

```bash
cd dashboard && go run ./cmd/career-data list --path cmd/career-data/testdata/career-ops | head -c 2000
```

- [ ] **Step 1: Confirm the JSON key casing**

Run the command above and read the `metrics` and `progress` objects. Write the TypeScript types in Step 3 to match exactly what you see, not what you expect.

- [ ] **Step 2: Write `theme.css`**

Create `desktop/src/theme.css`. Values are copied from `dashboard/internal/theme/catppuccin.go` and `catppuccin_latte.go` so both dashboards render the same colors:

```css
:root {
  /* Catppuccin Latte */
  --base: #eff1f5;
  --surface: #dce0e8;
  --overlay: #9ca0b0;
  --text: #4c4f69;
  --subtext: #5c5f77;
  --blue: #1e66f5;
  --mauve: #8839ef;
  --green: #40a02b;
  --yellow: #df8e1d;
  --sky: #04a5e5;
  --peach: #fe640b;
  --red: #d20f39;
  --pink: #ea76cb;
}

@media (prefers-color-scheme: dark) {
  :root {
    /* Catppuccin Mocha */
    --base: #1e1e2e;
    --surface: #313244;
    --overlay: #45475a;
    --text: #cdd6f4;
    --subtext: #a6adc8;
    --blue: #89b4fa;
    --mauve: #cba6f7;
    --green: #a6e3a1;
    --yellow: #f9e2af;
    --sky: #89dceb;
    --peach: #fab387;
    --red: #f38ba8;
    --pink: #f5c2e7;
  }
}

/* Status colors, from pipeline.go:1094-1105 */
:root {
  --status-interview: var(--green);
  --status-offer: var(--green);
  --status-applied: var(--sky);
  --status-responded: var(--blue);
  --status-evaluated: var(--text);
  --status-skip: var(--red);
  --status-rejected: var(--subtext);
  --status-discarded: var(--subtext);
}

/* Score bands, from pipeline.go:1081-1091 */
:root {
  --score-high: var(--green);
  --score-mid: var(--yellow);
  --score-neutral: var(--text);
  --score-low: var(--red);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--base);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
}
```

Import it from `desktop/src/main.tsx`: `import './theme.css';`

- [ ] **Step 3: Write `api.ts`**

Create `desktop/src/api.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';

export type Application = {
  number: number;
  date: string;
  company: string;
  role: string;
  status: string;
  /** data.NormalizeStatus(status), computed in Go so it cannot drift. */
  normStatus: string;
  /** data.StatusPriority(status): interview 0 … discarded 7, unknown 8. */
  statusPriority: number;
  score: number;
  scoreRaw: string;
  hasPdf: boolean;
  pdfPath: string;
  reportPath: string;
  reportNumber: string;
  notes: string;
  jobUrl: string;
  archetype: string;
  tldr: string;
  remote: string;
  compEstimate: string;
};

// PipelineMetrics and ProgressMetrics have no JSON struct tags in the Go data
// layer, and adding tags would mean modifying a system-path file. Their keys
// therefore arrive capitalized.
export type Metrics = {
  Total: number;
  ByStatus: Record<string, number>;
  AvgScore: number;
  TopScore: number;
  WithPDF: number;
  Actionable: number;
};

export type FunnelStage = { Label: string; Count: number; Pct: number };
export type ScoreBucket = { Label: string; Count: number };
export type WeekActivity = { Week: string; Count: number };

export type Progress = {
  FunnelStages: FunnelStage[];
  ScoreBuckets: ScoreBucket[];
  WeeklyActivity: WeekActivity[];
  ResponseRate: number;
  InterviewRate: number;
  OfferRate: number;
  AvgScore: number;
  TopScore: number;
  TotalOffers: number;
  ActiveApps: number;
};

export type DoctorResult = {
  ok: true;
  careerOpsPath: string;
  trackerPath: string | null;
  missing: string[];
  ready: boolean;
};

export type ListResult = {
  ok: true;
  applications: Application[];
  metrics: Metrics;
  progress: Progress;
};

export type ReportResult = {
  ok: true;
  path: string;
  markdown: string;
  archetype: string;
  tldr: string;
  remote: string;
  comp: string;
};

export type SetStatusResult = {
  ok: true;
  reportNumber: string;
  oldStatus: string;
  newStatus: string;
  backup: string;
};

export type SidecarError = {
  ok: false;
  error: string;
  message: string;
  actualStatus?: string;
};

export function isError(r: { ok: boolean }): r is SidecarError {
  return r.ok === false;
}

export const CANONICAL_STATUSES = [
  'Evaluated',
  'Applied',
  'Responded',
  'Interview',
  'Offer',
  'Rejected',
  'Discarded',
  'SKIP',
] as const;

export function doctor(root: string) {
  return invoke<DoctorResult | SidecarError>('doctor', { path: root });
}

export function listApplications(root: string) {
  return invoke<ListResult | SidecarError>('list_applications', { path: root });
}

export function readReport(root: string, file: string) {
  return invoke<ReportResult | SidecarError>('read_report', { path: root, file });
}

export function setStatus(
  root: string,
  reportNumber: string,
  expectStatus: string,
  status: string,
) {
  return invoke<SetStatusResult | SidecarError>('set_status', {
    path: root,
    reportNumber,
    expectStatus,
    status,
  });
}
```

- [ ] **Step 4: Write `config.ts`**

Create `desktop/src/config.ts`:

```ts
import { load } from '@tauri-apps/plugin-store';
import { open } from '@tauri-apps/plugin-dialog';

const STORE_FILE = 'settings.json';
const ROOT_KEY = 'careerOpsPath';

// The dev override. Vite exposes VITE_-prefixed vars only, so .env.local uses
// VITE_CAREER_OPS_PATH while .env.example documents CAREER_OPS_PATH for the
// shell. Neither is ever a hardcoded absolute path.
const devRoot = import.meta.env.VITE_CAREER_OPS_PATH as string | undefined;

export async function loadRoot(): Promise<string | null> {
  if (devRoot) return devRoot;
  const store = await load(STORE_FILE, { autoSave: true });
  return (await store.get<string>(ROOT_KEY)) ?? null;
}

export async function saveRoot(path: string): Promise<void> {
  const store = await load(STORE_FILE, { autoSave: true });
  await store.set(ROOT_KEY, path);
  await store.save();
}

export async function pickRoot(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, title: 'Select your career-ops folder' });
  if (typeof picked !== 'string') return null;
  await saveRoot(picked);
  return picked;
}
```

Update `desktop/.env.example` to document both names:

```
# Development override for the career-ops root directory.
# Vite only exposes VITE_-prefixed variables to the frontend.
VITE_CAREER_OPS_PATH=./fixtures/career-ops
```

- [ ] **Step 5: Write `EmptyState.tsx`**

Create `desktop/src/screens/EmptyState.tsx`:

```tsx
type Props = {
  root: string | null;
  missing: string[];
  onPick: () => void;
};

const EXPLAIN: Record<string, string> = {
  'cv.md': 'Your CV in markdown. career-ops reads every metric from here.',
  'config/profile.yml': 'Name, location, target roles, comp range.',
  'modes/_profile.md': 'Your personalization layer. Updates never overwrite it.',
  'portals.yml': 'Which companies and job boards the scanner searches.',
  'data/applications.md': 'The tracker. Nothing appears in this dashboard until it exists.',
};

export default function EmptyState({ root, missing, onPick }: Props) {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 48 }}>
      <h1 style={{ marginTop: 0 }}>career-ops is not set up yet</h1>

      <p style={{ color: 'var(--subtext)' }}>
        {root ? <>Looking in <code>{root}</code>.</> : 'No career-ops folder selected.'}
      </p>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {missing.map((f) => (
          <li
            key={f}
            style={{
              background: 'var(--surface)',
              borderLeft: '3px solid var(--peach)',
              padding: '12px 16px',
              marginBottom: 8,
              borderRadius: 4,
            }}
          >
            <code style={{ color: 'var(--peach)' }}>{f}</code>
            <div style={{ color: 'var(--subtext)', marginTop: 4 }}>{EXPLAIN[f] ?? ''}</div>
          </li>
        ))}
      </ul>

      <p style={{ color: 'var(--subtext)' }}>
        Onboarding happens in the CLI. Open career-ops in your AI coding CLI and it will walk you
        through creating these. This window picks up the result on Reload.
      </p>

      <button
        onClick={onPick}
        style={{
          background: 'var(--blue)',
          color: 'var(--base)',
          border: 0,
          borderRadius: 4,
          padding: '8px 16px',
          cursor: 'pointer',
        }}
      >
        {root ? 'Choose a different folder' : 'Choose your career-ops folder'}
      </button>
    </main>
  );
}
```

- [ ] **Step 6: Wire `App.tsx`**

Replace `desktop/src/App.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { doctor, isError, type DoctorResult } from './api';
import { loadRoot, pickRoot } from './config';
import EmptyState from './screens/EmptyState';

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [probe, setProbe] = useState<DoctorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (path: string) => {
    setError(null);
    try {
      const r = await doctor(path);
      if (isError(r)) {
        setError(r.message);
        return;
      }
      setProbe(r);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    loadRoot().then((p) => {
      setRoot(p);
      if (p) refresh(p);
    });
  }, [refresh]);

  const onPick = useCallback(async () => {
    const picked = await pickRoot();
    if (!picked) return;
    setRoot(picked);
    await refresh(picked);
  }, [refresh]);

  if (error) {
    return (
      <main style={{ padding: 48 }}>
        <h1>Cannot reach the sidecar</h1>
        <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--red)' }}>{error}</pre>
      </main>
    );
  }

  if (!root || !probe || !probe.ready) {
    return <EmptyState root={root} missing={probe?.missing ?? []} onPick={onPick} />;
  }

  return <pre style={{ padding: 16 }}>ready — pipeline lands in Task 9</pre>;
}
```

- [ ] **Step 7: Create the empty fixture**

The empty state needs a directory that genuinely has no tracker. The real repo is fully onboarded, so it cannot serve as one.

```bash
mkdir -p desktop/fixtures/empty-career-ops
printf '# Placeholder\n\nA career-ops root with nothing set up, for verifying the empty state.\nThe directory must exist and stay otherwise empty.\n' > desktop/fixtures/empty-career-ops/README.md
```

- [ ] **Step 8: Verify acceptance criterion 1, both branches**

Run `cd desktop && npm run tauri:dev`, then use the folder button to select each of these in turn:

1. `desktop/fixtures/empty-career-ops` → the empty state lists all five missing files with their explanations.
2. `/Users/shane_yeh/Projects/career-ops` → **not** the empty state. This repo is onboarded, so `doctor` returns `ready: true` and the app falls through to the placeholder that Task 9 replaces with the pipeline.

Both branches matter. An empty state that also fires on a healthy repo is worse than none.

- [ ] **Step 9: Commit**

```bash
git add desktop/
git commit -m "feat(desktop): add typed sidecar API, Catppuccin theme and empty state"
```

---

## Task 8: Filter, sort, group and search as pure functions

Delivers acceptance criterion 2 as a unit test rather than a click-through. These functions mirror `applyFilterAndSort` (pipeline.go:534-600) and `matchesSearch` (pipeline.go:516-531) exactly.

**Files:**
- Create: `desktop/src/lib/filters.ts`
- Create: `desktop/src/lib/filters.test.ts`
- Create: `desktop/fixtures/career-ops/data/applications.md`
- Create: `desktop/fixtures/career-ops/reports/` (three reports)
- Modify: `desktop/package.json` (add vitest)
- Modify: `desktop/vite.config.ts` (vitest config)

**Interfaces:**
- Consumes: `Application` from `src/api.ts` (Task 7).
- Produces:
  - `type FilterKey = 'all' | 'evaluated' | 'applied' | 'interview' | 'top' | 'skip' | 'rejected' | 'discarded'`
  - `type SortKey = 'score' | 'date' | 'company' | 'status'`
  - `type ViewMode = 'grouped' | 'flat'`
  - `const TABS: { key: FilterKey; label: string }[]`
  - `const STATUS_GROUP_ORDER: string[]`
  - `function matchesSearch(app: Application, query: string): boolean`
  - `function applyFilterAndSort(apps: Application[], filter: FilterKey, sort: SortKey, view: ViewMode, query: string): Application[]`
  - `function countForFilter(apps: Application[], filter: FilterKey, query: string): number`
  - `function scoreBand(score: number): 'high' | 'mid' | 'neutral' | 'low'`

- [ ] **Step 1: Install vitest**

```bash
cd desktop && npm install -D vitest
```

In `desktop/vite.config.ts`, add a `test` block alongside the existing config:

```ts
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
```

- [ ] **Step 2: Create the UI development fixture**

This one is realistic, unlike the Go testdata fixture, which is deliberately nasty.

The real repo has 30 reports and a live tracker, so it is tempting to develop against that instead. Don't. The fixture exists for two reasons that outlive the data question: it is deterministic, so a parity test asserting exact row order stays valid, and it is safe to write to, which the real tracker is not. Read the real data freely when you want to see how messy real rows get; point the write path at the fixture only.

Create `desktop/fixtures/career-ops/data/applications.md`:

```markdown
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-07-20 | Anthropic | Applied AI Engineer | 4.8/5 | Interview | ✅ | [001](reports/001-anthropic-2026-07-20.md) | Onsite loop scheduled |
| 2 | 2026-07-18 | Retool | Forward Deployed Engineer | 4.4/5 | Applied | ✅ | [002](reports/002-retool-2026-07-18.md) | Referral via ex-colleague |
| 3 | 2026-07-15 | n8n | Automation Engineer | 4.1/5 | Responded | ❌ | [003](reports/003-n8n-2026-07-15.md) | Recruiter screen booked |
| 4 | 2026-07-12 | Tinybird | Solutions Engineer | 3.9/5 | Evaluated | ❌ | [004](reports/004-tinybird-2026-07-12.md) | Comp band unclear |
| 5 | 2026-07-10 | Factorial | Platform Engineer | 3.6/5 | Evaluated | ❌ | [005](reports/005-factorial-2026-07-10.md) | Hybrid, 3 days onsite |
| 6 | 2026-07-08 | Attio | Backend Engineer | 3.3/5 | Rejected | ❌ | [006](reports/006-attio-2026-07-08.md) | No reason given |
| 7 | 2026-07-05 | Clarity AI | Data Engineer | 2.8/5 | SKIP | ❌ | [007](reports/007-clarity-ai-2026-07-05.md) | Stack mismatch |
| 8 | 2026-07-02 | Travelperk | Engineering Manager | 4.2/5 | Offer | ✅ | [008](reports/008-travelperk-2026-07-02.md) | Verbal offer, negotiating |
| 9 | 2026-06-28 | Elevenlabs | Applied AI Engineer | 4.6/5 | Discarded | ❌ | [009](reports/009-elevenlabs-2026-06-28.md) | Posting closed |
| 10 | 2026-06-25 | Wellfound | Growth Engineer | 3.1/5 | Applied | ❌ | [010](reports/010-wellfound-2026-06-25.md) | Long shot |
```

Create three reports so the split pane has content. `desktop/fixtures/career-ops/reports/001-anthropic-2026-07-20.md`:

```markdown
# Evaluation: Anthropic — Applied AI Engineer

**Date:** 2026-07-20
**Archetype:** Applied AI
**Score:** 4.8/5
**URL:** https://jobs.example.test/anthropic/applied-ai-engineer
**Legitimacy:** High Confidence
**PDF:** ✅
**TL;DR:** Best archetype match in the pipeline; comp above target and the team is remote-first
**Remote:** Remote (EU)
**Comp assessment:** 120-150k EUR

---

## A) Role Summary

| Dimension | Value |
|-----------|-------|
| Archetype | Applied AI |
| Domain | AI safety research tooling |
| Function | Applied engineering |

Fixture content for UI development. Long enough to exercise scrolling in the
report pane, with tables to exercise remark-gfm.

## B) Match with CV

| Requirement | Evidence | Gap |
|-------------|----------|-----|
| LLM evaluation pipelines | Built one at scale | None |
| Rust | Reading level only | Real |
```

`desktop/fixtures/career-ops/reports/002-retool-2026-07-18.md`:

```markdown
# Evaluation: Retool — Forward Deployed Engineer

**Date:** 2026-07-18
**Archetype:** Solutions / FDE
**Score:** 4.4/5
**URL:** https://jobs.example.test/retool/forward-deployed-engineer
**Legitimacy:** High Confidence
**PDF:** ✅
**TL;DR:** Customer-facing build work; referral in hand, but heavy travel expectation
**Remote:** Remote (EU), 25% travel

---

## A) Role Summary

Fixture content. Shorter than 001 on purpose, so the report pane is exercised
with both a long and a short document. This one deliberately omits any
compensation field, so the preview card's em-dash fallback gets exercised.
```

`desktop/fixtures/career-ops/reports/008-travelperk-2026-07-02.md`:

```markdown
# Evaluation: Travelperk — Engineering Manager

**Date:** 2026-07-02
**Archetype:** Engineering Leadership
**Score:** 4.2/5
**URL:** https://jobs.example.test/travelperk/engineering-manager
**Legitimacy:** High Confidence
**PDF:** ✅
**TL;DR:** First management role; strong team, comp at the low end of target
**Remote:** Hybrid (Barcelona)

---

## A) Role Summary

| Dimension | Value |
|-----------|-------|
| Archetype | Engineering Leadership |
| Compensation | 85-100k EUR |

Fixture content. This row carries the Offer status, so it is the one to use when
checking that the Offer group sorts first after Interview. Its compensation sits
in a table row rather than a header field, so it exercises `extractSummary`'s
second matcher.
```

All three fixtures follow the shape of the repo's real reports: English `**Field:**` header lines above `## A) …` sections, not the `## Block A — …` headings an earlier revision of this plan used. Real reports use `## A) Role Summary`; a fixture that diverges from that cannot catch extraction bugs, and it already caused one stale test assertion in Task 3.

The other seven rows deliberately have no report file. That exercises the "this row has no linked report" branch in Task 10 without needing a separate fixture.

- [ ] **Step 3: Write the failing test**

Create `desktop/src/lib/filters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Application } from '../api';
import { applyFilterAndSort, countForFilter, matchesSearch, scoreBand } from './filters';

function app(over: Partial<Application>): Application {
  return {
    number: 0,
    date: '2026-07-01',
    company: 'X',
    role: 'Dev',
    status: 'Evaluated',
    normStatus: 'evaluated',
    statusPriority: 4,
    score: 3.0,
    scoreRaw: '3.0/5',
    hasPdf: false,
    pdfPath: '',
    reportPath: '',
    reportNumber: '',
    notes: '',
    jobUrl: '',
    archetype: '',
    tldr: '',
    remote: '',
    compEstimate: '',
    ...over,
  };
}

const FIXTURE: Application[] = [
  app({ number: 1, company: 'Anthropic', score: 4.8, status: 'Interview', normStatus: 'interview', statusPriority: 0, date: '2026-07-20' }),
  app({ number: 2, company: 'Retool', score: 4.4, status: 'Applied', normStatus: 'applied', statusPriority: 3, date: '2026-07-18' }),
  app({ number: 3, company: 'n8n', score: 4.1, status: 'Responded', normStatus: 'responded', statusPriority: 2, date: '2026-07-15' }),
  app({ number: 4, company: 'Tinybird', score: 3.9, status: 'Evaluated', normStatus: 'evaluated', statusPriority: 4, date: '2026-07-12' }),
  app({ number: 7, company: 'Clarity AI', score: 4.5, status: 'SKIP', normStatus: 'skip', statusPriority: 5, date: '2026-07-05' }),
  app({ number: 8, company: 'Travelperk', score: 4.2, status: 'Offer', normStatus: 'offer', statusPriority: 1, date: '2026-07-02' }),
  // Exactly 4.0. Without a row on the boundary, `>= 4.0` and `> 4.0` are
  // indistinguishable and a mutation to the comparison passes the suite —
  // verified by mutating filters.ts and watching all 14 tests still pass.
  app({ number: 9, company: 'Boundary', score: 4.0, status: 'Evaluated', normStatus: 'evaluated', statusPriority: 4, date: '2026-07-01' }),
];

describe('matchesSearch', () => {
  it('matches company, role and notes case-insensitively', () => {
    const a = app({ company: 'Anthropic', role: 'Applied AI Engineer', notes: 'Onsite loop' });
    expect(matchesSearch(a, 'anthro')).toBe(true);
    expect(matchesSearch(a, 'ENGINEER')).toBe(true);
    expect(matchesSearch(a, 'onsite')).toBe(true);
    expect(matchesSearch(a, 'nope')).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(matchesSearch(app({}), '')).toBe(true);
  });
});

describe('applyFilterAndSort', () => {
  it('filter "all" keeps every row', () => {
    expect(applyFilterAndSort(FIXTURE, 'all', 'score', 'flat', '')).toHaveLength(7);
  });

  it('filter "top" is score >= 4.0 excluding skip', () => {
    // Clarity AI scores 4.5 but is SKIP, so it is excluded — this mirrors
    // pipeline.go:546-549, where the label says "TOP >=4" and the code says
    // >= 4.0 && norm != "skip".
    const got = applyFilterAndSort(FIXTURE, 'top', 'score', 'flat', '');
    expect(got.map((a) => a.company)).toEqual(['Anthropic', 'Retool', 'Travelperk', 'n8n', 'Boundary']);
  });

  it('filter "top" includes a row scoring exactly 4.0', () => {
    // The boundary is the whole point of `>=`. Pin it separately so the rule
    // survives even if the ordering assertion above is ever loosened.
    const got = applyFilterAndSort(FIXTURE, 'top', 'score', 'flat', '');
    expect(got.map((a) => a.company)).toContain('Boundary');
  });

  it('filter "top" excludes a row scoring just under 4.0', () => {
    const got = applyFilterAndSort(FIXTURE, 'top', 'score', 'flat', '');
    expect(got.map((a) => a.company)).not.toContain('Tinybird');
  });

  it('a status filter matches the normalized status', () => {
    const got = applyFilterAndSort(FIXTURE, 'interview', 'score', 'flat', '');
    expect(got.map((a) => a.company)).toEqual(['Anthropic']);
  });

  it('sorts by score descending', () => {
    const got = applyFilterAndSort(FIXTURE, 'all', 'score', 'flat', '');
    expect(got.map((a) => a.score)).toEqual([4.8, 4.5, 4.4, 4.2, 4.1, 4.0, 3.9]);
  });

  it('sorts by date descending as a string comparison', () => {
    const got = applyFilterAndSort(FIXTURE, 'all', 'date', 'flat', '');
    expect(got[0].company).toBe('Anthropic');
    expect(got[got.length - 1].company).toBe('Boundary');
  });

  it('sorts by company case-insensitively ascending', () => {
    const got = applyFilterAndSort(FIXTURE, 'all', 'company', 'flat', '');
    expect(got.map((a) => a.company)).toEqual([
      'Anthropic', 'Boundary', 'Clarity AI', 'n8n', 'Retool', 'Tinybird', 'Travelperk',
    ]);
  });

  it('sorts by status priority ascending', () => {
    const got = applyFilterAndSort(FIXTURE, 'all', 'status', 'flat', '');
    expect(got.map((a) => a.statusPriority)).toEqual([0, 1, 2, 3, 4, 4, 5]);
  });

  it('grouped view orders by status priority first, then the chosen sort', () => {
    const got = applyFilterAndSort(FIXTURE, 'all', 'score', 'grouped', '');
    expect(got.map((a) => a.statusPriority)).toEqual([0, 1, 2, 3, 4, 4, 5]);
  });

  it('search narrows within the active tab', () => {
    const got = applyFilterAndSort(FIXTURE, 'top', 'score', 'flat', 'retool');
    expect(got.map((a) => a.company)).toEqual(['Retool']);
  });

  it('does not mutate its input', () => {
    const order = FIXTURE.map((a) => a.company);
    applyFilterAndSort(FIXTURE, 'all', 'company', 'grouped', '');
    expect(FIXTURE.map((a) => a.company)).toEqual(order);
  });
});

describe('countForFilter', () => {
  it('counts what the tab would show', () => {
    expect(countForFilter(FIXTURE, 'all', '')).toBe(7);
    expect(countForFilter(FIXTURE, 'top', '')).toBe(5);
    expect(countForFilter(FIXTURE, 'skip', '')).toBe(1);
  });
});

describe('scoreBand', () => {
  it('matches the TUI thresholds', () => {
    expect(scoreBand(4.2)).toBe('high');
    expect(scoreBand(4.19)).toBe('mid');
    expect(scoreBand(3.8)).toBe('mid');
    expect(scoreBand(3.79)).toBe('neutral');
    expect(scoreBand(3.0)).toBe('neutral');
    expect(scoreBand(2.99)).toBe('low');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd desktop && npm test`
Expected: FAIL — cannot resolve `./filters`.

- [ ] **Step 5: Write `filters.ts`**

Create `desktop/src/lib/filters.ts`:

```ts
import type { Application } from '../api';

export type FilterKey =
  | 'all' | 'evaluated' | 'applied' | 'interview'
  | 'top' | 'skip' | 'rejected' | 'discarded';

export type SortKey = 'score' | 'date' | 'company' | 'status';
export type ViewMode = 'grouped' | 'flat';

/** Tab order and labels, from pipeline.go:83-92. */
export const TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'evaluated', label: 'EVALUATED' },
  { key: 'applied', label: 'APPLIED' },
  { key: 'interview', label: 'INTERVIEW' },
  { key: 'top', label: 'TOP ≥4' },
  { key: 'skip', label: 'SKIP' },
  { key: 'rejected', label: 'REJECTED' },
  { key: 'discarded', label: 'DISCARDED' },
];

/** Group display order, from pipeline.go:99. */
export const STATUS_GROUP_ORDER = [
  'interview', 'offer', 'responded', 'applied',
  'evaluated', 'skip', 'rejected', 'discarded',
];

/** Mirrors matchesSearch (pipeline.go:516-531). */
export function matchesSearch(app: Application, query: string): boolean {
  if (query === '') return true;
  const q = query.toLowerCase();
  return (
    app.company.toLowerCase().includes(q) ||
    app.role.toLowerCase().includes(q) ||
    app.notes.toLowerCase().includes(q)
  );
}

function passesFilter(app: Application, filter: FilterKey): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'top':
      // The label reads "TOP >=4"; the rule is >= 4.0 and not skip.
      return app.score >= 4.0 && app.normStatus !== 'skip';
    default:
      return app.normStatus === filter;
  }
}

/** Comparators are stable, matching Go's sort.SliceStable. */
function compare(a: Application, b: Application, sort: SortKey): number {
  switch (sort) {
    case 'score':
      return b.score - a.score;
    case 'date':
      // The TUI compares the raw date strings, which works because they are
      // ISO-formatted. Kept identical rather than parsed, so malformed dates
      // sort the same way in both dashboards.
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    case 'company': {
      const x = a.company.toLowerCase();
      const y = b.company.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    }
    case 'status':
      return a.statusPriority - b.statusPriority;
  }
}

/** Mirrors applyFilterAndSort (pipeline.go:534-600). Returns a new array. */
export function applyFilterAndSort(
  apps: Application[],
  filter: FilterKey,
  sort: SortKey,
  view: ViewMode,
  query: string,
): Application[] {
  const out = apps.filter((a) => matchesSearch(a, query) && passesFilter(a, filter));

  out.sort((a, b) => compare(a, b, sort));

  if (view === 'grouped') {
    out.sort((a, b) => {
      if (a.statusPriority !== b.statusPriority) {
        return a.statusPriority - b.statusPriority;
      }
      // Within a group the TUI falls back to score for the status sort.
      return compare(a, b, sort === 'status' ? 'score' : sort);
    });
  }

  return out;
}

export function countForFilter(
  apps: Application[],
  filter: FilterKey,
  query: string,
): number {
  return apps.filter((a) => matchesSearch(a, query) && passesFilter(a, filter)).length;
}

/** Score bands from scoreStyle (pipeline.go:1081-1091). */
export function scoreBand(score: number): 'high' | 'mid' | 'neutral' | 'low' {
  if (score >= 4.2) return 'high';
  if (score >= 3.8) return 'mid';
  if (score >= 3.0) return 'neutral';
  return 'low';
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd desktop && npm test`
Expected: PASS — sixteen assertions across five describes.

- [ ] **Step 7: Cross-check against the TUI on the same fixture**

Build the TUI and point it at the desktop fixture, then compare row sets tab by tab:

```bash
cd dashboard && go build -o /tmp/career-dashboard . && /tmp/career-dashboard --path ../desktop/fixtures/career-ops
```

Walk the eight tabs with `tab`, cycle sorts with `s`, and confirm the row sets match what `filters.test.ts` asserts. Note any divergence as a test case before moving on. This is the manual half of acceptance criterion 2; the automated half is Step 6.

- [ ] **Step 8: Commit**

```bash
git add desktop/
git commit -m "feat(desktop): add pure filter/sort/search functions with TUI parity tests"
```

---

## Task 9: Pipeline screen — metrics bar, toolbar, table

The main screen, read-only for now. The status cell renders as a colored label; making it editable is Task 11, so a reviewer can judge layout and data binding without the write path in scope.

**Files:**
- Create: `desktop/src/screens/Pipeline.tsx`
- Create: `desktop/src/components/MetricsBar.tsx`
- Create: `desktop/src/components/Toolbar.tsx`
- Create: `desktop/src/components/AppTable.tsx`
- Create: `desktop/src/app.css`
- Modify: `desktop/src/App.tsx`

**Interfaces:**
- Consumes: `Application`, `Metrics`, `listApplications`, `isError` (Task 7); `TABS`, `applyFilterAndSort`, `countForFilter`, `scoreBand`, `STATUS_GROUP_ORDER`, `FilterKey`, `SortKey`, `ViewMode` (Task 8).
- Produces:
  - `<Pipeline root={string} data={ListResult} onReload={() => Promise<void>} />`
  - `<MetricsBar metrics={Metrics} />`
  - `<Toolbar filter sort view query counts onFilter onSort onView onQuery onReload />`
  - `<AppTable rows={Application[]} grouped={boolean} selected={string | null} sort={SortKey} onSelect={(reportNumber: string) => void} onSort={(s: SortKey) => void} />` — `AppTable` gains an `onStatusChange` prop in Task 11.
  - `function statusLabel(norm: string): string` exported from `AppTable.tsx`.

- [ ] **Step 1: Write `app.css`**

Create `desktop/src/app.css`:

```css
.shell { display: grid; grid-template-columns: 180px 1fr; height: 100vh; }

.nav { background: var(--surface); padding: 16px 8px; display: flex; flex-direction: column; gap: 4px; }
.nav button {
  background: none; border: 0; color: var(--subtext); text-align: left;
  padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 14px;
}
.nav button[aria-current='true'] { background: var(--overlay); color: var(--text); }

.pane { display: flex; flex-direction: column; min-width: 0; overflow: hidden; }

.metrics { display: flex; gap: 24px; padding: 12px 16px; border-bottom: 1px solid var(--surface); }
.metric-label { color: var(--subtext); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.metric-value { font-size: 20px; font-variant-numeric: tabular-nums; }

.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 16px; border-bottom: 1px solid var(--surface); }
.tab {
  background: none; border: 1px solid transparent; color: var(--subtext);
  padding: 4px 10px; border-radius: 999px; cursor: pointer; font-size: 12px;
}
.tab[aria-pressed='true'] { background: var(--overlay); color: var(--text); }
.toolbar input, .toolbar select {
  background: var(--surface); color: var(--text); border: 1px solid var(--overlay);
  border-radius: 4px; padding: 4px 8px; font-size: 13px;
}

.split { display: grid; grid-template-columns: 1fr 1fr; flex: 1; min-height: 0; }
.split > * { overflow: auto; min-width: 0; }

table.apps { width: 100%; border-collapse: collapse; font-size: 13px; }
table.apps th {
  position: sticky; top: 0; background: var(--base); text-align: left;
  padding: 6px 8px; border-bottom: 1px solid var(--overlay);
  color: var(--subtext); font-weight: 500; cursor: pointer; white-space: nowrap;
}
table.apps td { padding: 6px 8px; border-bottom: 1px solid var(--surface); }
table.apps tr[aria-selected='true'] { background: var(--surface); }
table.apps tr.group-head td {
  background: var(--surface); color: var(--subtext); font-size: 11px;
  text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 0;
}

.score { font-variant-numeric: tabular-nums; text-align: right; }
.score.high { color: var(--score-high); font-weight: 600; }
.score.mid { color: var(--score-mid); }
.score.neutral { color: var(--score-neutral); }
.score.low { color: var(--score-low); }

.status-pill { padding: 2px 8px; border-radius: 999px; background: var(--surface); font-size: 12px; }
```

Import it from `desktop/src/main.tsx`, after `theme.css`.

- [ ] **Step 2: Write `MetricsBar.tsx`**

```tsx
import type { Metrics } from '../api';

const FIELDS: { label: string; get: (m: Metrics) => string }[] = [
  { label: 'Total', get: (m) => String(m.Total) },
  { label: 'Avg', get: (m) => m.AvgScore.toFixed(1) },
  { label: 'Top', get: (m) => m.TopScore.toFixed(1) },
  { label: 'Actionable', get: (m) => String(m.Actionable) },
  { label: 'With PDF', get: (m) => String(m.WithPDF) },
];

export default function MetricsBar({ metrics }: { metrics: Metrics }) {
  return (
    <div className="metrics">
      {FIELDS.map((f) => (
        <div key={f.label}>
          <div className="metric-label">{f.label}</div>
          <div className="metric-value">{f.get(metrics)}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `Toolbar.tsx`**

```tsx
import { TABS, type FilterKey, type SortKey, type ViewMode } from '../lib/filters';

type Props = {
  filter: FilterKey;
  sort: SortKey;
  view: ViewMode;
  query: string;
  counts: Record<FilterKey, number>;
  onFilter: (f: FilterKey) => void;
  onSort: (s: SortKey) => void;
  onView: (v: ViewMode) => void;
  onQuery: (q: string) => void;
  onReload: () => void;
};

export default function Toolbar(p: Props) {
  return (
    <div className="toolbar">
      {TABS.map((t) => (
        <button
          key={t.key}
          className="tab"
          aria-pressed={p.filter === t.key}
          onClick={() => p.onFilter(t.key)}
        >
          {t.label} <span style={{ opacity: 0.6 }}>{p.counts[t.key]}</span>
        </button>
      ))}

      <input
        type="search"
        placeholder="Search company, role, notes"
        value={p.query}
        onChange={(e) => p.onQuery(e.target.value)}
        style={{ marginLeft: 'auto', minWidth: 220 }}
      />

      <select value={p.sort} onChange={(e) => p.onSort(e.target.value as SortKey)}>
        <option value="score">Sort: score</option>
        <option value="date">Sort: date</option>
        <option value="company">Sort: company</option>
        <option value="status">Sort: status</option>
      </select>

      <select value={p.view} onChange={(e) => p.onView(e.target.value as ViewMode)}>
        <option value="grouped">Grouped</option>
        <option value="flat">Flat</option>
      </select>

      <button className="tab" onClick={p.onReload}>Reload</button>
    </div>
  );
}
```

- [ ] **Step 4: Write `AppTable.tsx`**

```tsx
import { Fragment } from 'react';
import type { Application } from '../api';
import { scoreBand, type SortKey } from '../lib/filters';

/** Display labels for normalized statuses, matching statusLabel (pipeline.go:1129). */
const LABELS: Record<string, string> = {
  interview: 'Interview',
  offer: 'Offer',
  responded: 'Responded',
  applied: 'Applied',
  evaluated: 'Evaluated',
  skip: 'SKIP',
  rejected: 'Rejected',
  discarded: 'Discarded',
};

export function statusLabel(norm: string): string {
  return LABELS[norm] ?? norm;
}

/** Only these four columns are sortable, matching the TUI's sort cycle. */
const COLUMNS: { key: string; label: string; sort?: SortKey; align?: 'right' }[] = [
  { key: 'num', label: '#' },
  { key: 'date', label: 'Date', sort: 'date' },
  { key: 'company', label: 'Company', sort: 'company' },
  { key: 'role', label: 'Role' },
  { key: 'score', label: 'Score', sort: 'score', align: 'right' },
  { key: 'status', label: 'Status', sort: 'status' },
  { key: 'pdf', label: 'PDF' },
];

type Props = {
  rows: Application[];
  grouped: boolean;
  selected: string | null;
  sort: SortKey;
  onSelect: (reportNumber: string) => void;
  onSort: (s: SortKey) => void;
};

export default function AppTable({ rows, grouped, selected, sort, onSelect, onSort }: Props) {
  let lastGroup = '';

  return (
    <table className="apps">
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th
              key={c.key}
              style={{ textAlign: c.align ?? 'left', cursor: c.sort ? 'pointer' : 'default' }}
              aria-sort={c.sort && sort === c.sort ? 'descending' : undefined}
              onClick={() => c.sort && onSort(c.sort)}
            >
              {c.label}
              {c.sort === sort ? ' ▾' : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => {
          const head = grouped && a.normStatus !== lastGroup;
          if (head) lastGroup = a.normStatus;
          const rowKey = a.reportNumber || `${a.company}-${a.number}`;
          return (
            <Fragment key={rowKey}>
              {head && (
                <tr className="group-head">
                  <td colSpan={COLUMNS.length}>{statusLabel(a.normStatus)}</td>
                </tr>
              )}
              <tr
                aria-selected={selected === a.reportNumber}
                onClick={() => onSelect(a.reportNumber)}
                style={{ cursor: 'pointer' }}
              >
                <td>{a.number}</td>
                <td>{a.date}</td>
                <td>{a.company}</td>
                <td>{a.role}</td>
                <td className={`score ${scoreBand(a.score)}`}>{a.score.toFixed(1)}</td>
                <td>
                  <span
                    className="status-pill"
                    style={{ color: `var(--status-${a.normStatus}, var(--text))` }}
                  >
                    {a.status}
                  </span>
                </td>
                <td>{a.hasPdf ? '✅' : ''}</td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
```

The `th` styling in `app.css` promises a click target, so the handler exists from the start rather than being added later. Columns without a `sort` key render with the default cursor and ignore clicks.

- [ ] **Step 5: Write `Pipeline.tsx`**

```tsx
import { useMemo, useState } from 'react';
import type { ListResult } from '../api';
import {
  applyFilterAndSort, countForFilter, TABS,
  type FilterKey, type SortKey, type ViewMode,
} from '../lib/filters';
import AppTable from '../components/AppTable';
import MetricsBar from '../components/MetricsBar';
import Toolbar from '../components/Toolbar';

// onReload is async because Task 11 awaits it after a successful write.
type Props = { root: string; data: ListResult; onReload: () => Promise<void> };

export default function Pipeline({ root, data, onReload }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('score');
  const [view, setView] = useState<ViewMode>('grouped');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(
    () => applyFilterAndSort(data.applications, filter, sort, view, query),
    [data.applications, filter, sort, view, query],
  );

  const counts = useMemo(() => {
    const out = {} as Record<FilterKey, number>;
    for (const t of TABS) out[t.key] = countForFilter(data.applications, t.key, query);
    return out;
  }, [data.applications, query]);

  return (
    <div className="pane">
      <MetricsBar metrics={data.metrics} />
      <Toolbar
        filter={filter} sort={sort} view={view} query={query} counts={counts}
        onFilter={setFilter} onSort={setSort} onView={setView}
        onQuery={setQuery} onReload={onReload}
      />
      <div className="split">
        <div>
          <AppTable
            rows={rows}
            grouped={view === 'grouped'}
            selected={selected}
            sort={sort}
            onSelect={setSelected}
            onSort={setSort}
          />
        </div>
        <div style={{ padding: 16, color: 'var(--subtext)' }}>
          {selected ? `Selected ${selected} — report pane lands in Task 10` : 'Select a row'}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire `App.tsx` to load and render the pipeline**

Replace the `return <pre …>ready…</pre>` branch in `desktop/src/App.tsx` with a `list` fetch and a nav. Keep the existing empty-state and error branches unchanged:

```tsx
// add to the imports
import { listApplications, type ListResult } from './api';
import Pipeline from './screens/Pipeline';

// add to the component state
const [data, setData] = useState<ListResult | null>(null);
const [screen, setScreen] = useState<'pipeline' | 'progress'>('pipeline');

const reload = useCallback(async () => {
  if (!root) return;
  const r = await listApplications(root);
  if (isError(r)) { setError(r.message); return; }
  setData(r);
}, [root]);

useEffect(() => { if (probe?.ready) reload(); }, [probe, reload]);

// replace the ready branch
if (!data) return <main style={{ padding: 48 }}>Loading…</main>;

return (
  <div className="shell">
    <nav className="nav">
      <button aria-current={screen === 'pipeline'} onClick={() => setScreen('pipeline')}>Pipeline</button>
      <button aria-current={screen === 'progress'} onClick={() => setScreen('progress')}>Progress</button>
    </nav>
    {screen === 'pipeline'
      ? <Pipeline root={root!} data={data} onReload={reload} />
      : <div className="pane" style={{ padding: 16 }}>Progress lands in Task 12</div>}
  </div>
);
```

- [ ] **Step 7: Run against the fixture**

```bash
cd desktop && VITE_CAREER_OPS_PATH=./fixtures/career-ops npm run tauri:dev
```

Expected: ten rows, grouped by status with Interview first, sorted by score inside each group. Every tab shows its count. Search narrows live. `TOP ≥4` shows four rows, excluding the SKIP row.

- [ ] **Step 8: Commit**

```bash
git add desktop/
git commit -m "feat(desktop): add pipeline screen with metrics bar, toolbar and table"
```

---

## Task 10: Report pane

Fills the right half of the split: the preview card, the rendered markdown, and the two escape hatches to the system browser and Preview.app.

**Files:**
- Create: `desktop/src/components/ReportPane.tsx`
- Modify: `desktop/src/screens/Pipeline.tsx` (replace the placeholder pane)
- Modify: `desktop/src/app.css` (markdown styles)

**Interfaces:**
- Consumes: `readReport`, `isError`, `ReportResult`, `Application` (Task 7).
- Produces: `<ReportPane root={string} app={Application | null} />`

- [ ] **Step 1: Install the markdown renderer**

```bash
cd desktop && npm install react-markdown remark-gfm
```

`remark-gfm` is required, not optional: evaluation reports carry their summary fields in a markdown table, and core markdown does not support tables.

- [ ] **Step 2: Add markdown styles to `app.css`**

```css
.report { padding: 16px 20px; }
.report-card {
  background: var(--surface); border-radius: 6px; padding: 12px 16px; margin-bottom: 16px;
}
.report-card dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0; }
.report-card dt { color: var(--subtext); font-size: 12px; }
.report-card dd { margin: 0; }
.report-actions { display: flex; gap: 8px; margin-top: 12px; }
.report-actions button {
  background: var(--blue); color: var(--base); border: 0; border-radius: 4px;
  padding: 6px 12px; cursor: pointer; font-size: 13px;
}
.report-actions button:disabled { background: var(--overlay); color: var(--subtext); cursor: default; }

.md { line-height: 1.6; }
.md h1 { font-size: 20px; }
.md h2 { font-size: 16px; margin-top: 24px; border-bottom: 1px solid var(--surface); padding-bottom: 4px; }
.md code { background: var(--surface); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
.md pre { background: var(--surface); padding: 12px; border-radius: 4px; overflow-x: auto; }
.md table { border-collapse: collapse; width: 100%; font-size: 13px; display: block; overflow-x: auto; }
.md th, .md td { border: 1px solid var(--overlay); padding: 4px 8px; text-align: left; }
.md a { color: var(--blue); }
```

- [ ] **Step 3: Write `ReportPane.tsx`**

```tsx
import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { isError, readReport, type Application, type ReportResult } from '../api';

type Props = { root: string; app: Application | null };

export default function ReportPane({ root, app }: Props) {
  const [report, setReport] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    setError(null);
    if (!app?.reportPath) return;

    let cancelled = false;
    readReport(root, app.reportPath)
      .then((r) => {
        if (cancelled) return;
        if (isError(r)) setError(r.message);
        else setReport(r);
      })
      .catch((e) => !cancelled && setError(String(e)));

    return () => { cancelled = true; };
  }, [root, app?.reportPath]);

  if (!app) {
    return <div className="report" style={{ color: 'var(--subtext)' }}>Select a row to read its report.</div>;
  }

  return (
    <div className="report">
      <div className="report-card">
        <dl>
          <dt>Company</dt><dd>{app.company}</dd>
          <dt>Role</dt><dd>{app.role}</dd>
          <dt>Archetype</dt><dd>{app.archetype || '—'}</dd>
          <dt>TL;DR</dt><dd>{app.tldr || '—'}</dd>
          <dt>Remote</dt><dd>{app.remote || '—'}</dd>
          <dt>Comp</dt><dd>{app.compEstimate || '—'}</dd>
        </dl>

        <div className="report-actions">
          <button disabled={!app.jobUrl} onClick={() => openUrl(app.jobUrl)}>
            {app.jobUrl ? 'Open job posting' : 'No job URL'}
          </button>

          {app.pdfPath ? (
            <button onClick={() => openPath(`${root}/${app.pdfPath}`)}>Open PDF</button>
          ) : (
            // generate-pdf.mjs takes its output path from the caller, so a
            // company with no unique match gets the folder, not a guess.
            <button onClick={() => openPath(`${root}/output`)}>
              {app.hasPdf ? 'Open output folder' : 'No PDF'}
            </button>
          )}
        </div>
      </div>

      {error && <pre style={{ color: 'var(--red)', whiteSpace: 'pre-wrap' }}>{error}</pre>}
      {!error && !report && app.reportPath && <div style={{ color: 'var(--subtext)' }}>Loading report…</div>}
      {!app.reportPath && <div style={{ color: 'var(--subtext)' }}>This row has no linked report.</div>}
      {report && (
        <div className="md">
          <Markdown remarkPlugins={[remarkGfm]}>{report.markdown}</Markdown>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire it into `Pipeline.tsx`**

Replace the placeholder `<div style={{ padding: 16, …}}>` in the split with:

```tsx
        <ReportPane
          root={root}
          app={rows.find((a) => a.reportNumber === selected) ?? null}
        />
```

Add `import ReportPane from '../components/ReportPane';` and stop ignoring the `root` prop in the destructure: `export default function Pipeline({ root, data, onReload }: Props) {`.

- [ ] **Step 5: Verify**

Run: `cd desktop && VITE_CAREER_OPS_PATH=./fixtures/career-ops npm run tauri:dev`

Check, in order:
1. Selecting the Anthropic row renders its report, and the "B) Match with CV" markdown table has visible borders — that confirms `remark-gfm` is active.
2. "Open job posting" opens `https://jobs.example.test/...` in the system browser.
3. A row whose report has no `**URL:**` shows a disabled "No job URL" button rather than opening about:blank.
4. Selecting a row with no `reportPath` shows the card with "This row has no linked report" and does not spin forever.

- [ ] **Step 6: Commit**

```bash
git add desktop/
git commit -m "feat(desktop): render report markdown and preview card in the split pane"
```

---

## Task 11: Status writeback

Delivers acceptance criteria 3 and 4. The only task where the desktop app writes user data.

**Files:**
- Create: `desktop/src/components/StatusSelect.tsx`
- Modify: `desktop/src/components/AppTable.tsx` (accept `onStatusChange`)
- Modify: `desktop/src/screens/Pipeline.tsx` (own the write, reload, and error banner)
- Modify: `desktop/src/app.css` (banner styles)

**Interfaces:**
- Consumes: `setStatus`, `isError`, `CANONICAL_STATUSES` (Task 7).
- Produces:
  - `<StatusSelect value={string} normStatus={string} disabled={boolean} onChange={(next: string) => void} />`
  - `AppTable` gains `onStatusChange?: (app: Application, next: string) => void` and `pendingRow?: string | null`.

**No optimistic UI.** The cell keeps showing the old value until the sidecar confirms the write and the reload returns. A failed write therefore never leaves the screen disagreeing with the file.

- [ ] **Step 1: Add banner styles to `app.css`**

```css
.banner {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 10px 16px; border-left: 3px solid var(--red); background: var(--surface);
}
.banner.stale { border-left-color: var(--peach); }
.banner p { margin: 0; flex: 1; }
.banner button {
  background: var(--overlay); color: var(--text); border: 0;
  border-radius: 4px; padding: 4px 10px; cursor: pointer;
}
```

- [ ] **Step 2: Write `StatusSelect.tsx`**

```tsx
import { CANONICAL_STATUSES } from '../api';

type Props = {
  value: string;
  normStatus: string;
  disabled: boolean;
  onChange: (next: string) => void;
};

export default function StatusSelect({ value, normStatus, disabled, onChange }: Props) {
  // A legacy row may hold a non-canonical status ("aplicado", "hold"). Keep it
  // in the list so the select can display it, but never write it back.
  const options = CANONICAL_STATUSES.includes(value as never)
    ? [...CANONICAL_STATUSES]
    : [value, ...CANONICAL_STATUSES];

  return (
    <select
      value={value}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        if (e.target.value !== value) onChange(e.target.value);
      }}
      style={{
        background: 'var(--surface)',
        color: `var(--status-${normStatus}, var(--text))`,
        border: '1px solid var(--overlay)',
        borderRadius: 4,
        padding: '2px 6px',
        fontSize: 12,
      }}
    >
      {options.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
```

`onClick` stops propagation because the row itself is clickable; without it, opening the dropdown would also change the selection.

- [ ] **Step 3: Accept the handler in `AppTable.tsx`**

Extend `Props`:

```tsx
  onStatusChange?: (app: Application, next: string) => void;
  pendingRow?: string | null;
```

Replace the status `<td>` body with:

```tsx
                <td>
                  {onStatusChange ? (
                    <StatusSelect
                      value={a.status}
                      normStatus={a.normStatus}
                      disabled={pendingRow === a.reportNumber || !a.reportNumber}
                      onChange={(next) => onStatusChange(a, next)}
                    />
                  ) : (
                    <span className="status-pill" style={{ color: `var(--status-${a.normStatus}, var(--text))` }}>
                      {a.status}
                    </span>
                  )}
                </td>
```

Add `import StatusSelect from './StatusSelect';`. A row with no `reportNumber` cannot be located by the writer, so its select is disabled rather than failing on submit.

- [ ] **Step 4: Own the write in `Pipeline.tsx`**

Add state and the handler:

```tsx
const [pendingRow, setPendingRow] = useState<string | null>(null);
const [writeError, setWriteError] = useState<{ stale: boolean; message: string } | null>(null);

const changeStatus = useCallback(
  async (app: Application, next: string) => {
    setWriteError(null);
    setPendingRow(app.reportNumber);
    try {
      // expectStatus is the value this UI last read. The sidecar refuses the
      // write if the file says something else.
      const r = await setStatus(root, app.reportNumber, app.status, next);
      if (isError(r)) {
        setWriteError({ stale: r.error === 'stale', message: r.message });
        return;
      }
      await onReload();
    } catch (e) {
      setWriteError({ stale: false, message: String(e) });
    } finally {
      setPendingRow(null);
    }
  },
  [root, onReload],
);
```

Render the banner above the split:

```tsx
{writeError && (
  <div className={`banner${writeError.stale ? ' stale' : ''}`}>
    <p>{writeError.message}</p>
    <button onClick={() => { setWriteError(null); onReload(); }}>Reload</button>
    <button onClick={() => setWriteError(null)}>Dismiss</button>
  </div>
)}
```

Pass the new props to `AppTable`: `onStatusChange={changeStatus}` and `pendingRow={pendingRow}`.

Add `Application`, `isError` and `setStatus` to the `../api` import, and `useCallback` to the React import. The `onReload` prop is already typed `() => Promise<void>` from Task 9, and `App.tsx`'s `reload` is already async, so no signature change is needed.

- [ ] **Step 5: Verify acceptance criterion 3**

```bash
cd desktop && cp fixtures/career-ops/data/applications.md /tmp/before.md
VITE_CAREER_OPS_PATH=./fixtures/career-ops npm run tauri:dev
```

Change the Tinybird row from `Evaluated` to `Applied`, then:

```bash
cd desktop && diff /tmp/before.md fixtures/career-ops/data/applications.md
```

Expected: exactly one changed line, differing only in the status cell. Every other cell, including padding, is identical.

- [ ] **Step 6: Verify acceptance criterion 4**

With the app still open, edit the fixture from a terminal — change the n8n row's status from `Responded` to `Interview` by hand. Then, in the app (which has not reloaded), change that same row to `Offer`.

Expected: the peach-bordered banner reads that the row currently reads `Interview` and expected `Responded`, the cell still shows `Responded`, and the file is unchanged. Clicking Reload brings the app in sync and the change then succeeds.

- [ ] **Step 7: Verify the backup landed**

```bash
ls -la desktop/fixtures/career-ops/data/.applications.md.bak
```
Expected: present, matching the file's contents before the last successful write.

- [ ] **Step 8: Restore the fixture and commit**

```bash
cd desktop && cp /tmp/before.md fixtures/career-ops/data/applications.md
rm fixtures/career-ops/data/.applications.md.bak
cd .. && git add desktop/
git commit -m "feat(desktop): add status writeback with optimistic-lock error handling"
```

---

## Task 12: Progress screen

Four charts replacing the TUI's block-character drawings. This is the motivation that started the project, so it is the one screen where visual quality is the deliverable.

**Files:**
- Create: `desktop/src/screens/Progress.tsx`
- Create: `desktop/src/components/RateCard.tsx`
- Modify: `desktop/src/App.tsx` (render `Progress` instead of the placeholder)
- Modify: `desktop/src/app.css` (grid and card styles)

**Interfaces:**
- Consumes: `Progress` type from `src/api.ts` (Task 7), remembering its capitalized keys.
- Produces:
  - `<Progress data={ProgressType} />`
  - `<RateCard label={string} value={number} />` — default export, renders a ratio as a percentage
  - `<CountCard label={string} value={number} />` — named export, renders a raw count

- [ ] **Step 1: Load the dataviz skill**

Before writing any chart code or choosing any chart color, invoke the `dataviz` skill. It defines the form heuristic, the color formula and its validator, and the mark and interaction rules this task must follow. Do not skip it because the charts look simple — palette and axis decisions made here set the pattern for the whole screen.

The Catppuccin variables in `theme.css` are the palette source. Do not introduce a second set of chart colors.

- [ ] **Step 2: Install Recharts**

```bash
cd desktop && npm install recharts
```

- [ ] **Step 3: Add layout styles to `app.css`**

```css
.progress-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px; padding: 16px; overflow: auto;
}
.card {
  background: var(--surface); border-radius: 6px; padding: 16px; min-width: 0;
}
.card h2 { margin: 0 0 12px; font-size: 13px; color: var(--subtext); text-transform: uppercase; letter-spacing: 0.05em; }
.rates { display: flex; gap: 16px; }
.rate { flex: 1; text-align: center; }
.rate-value { font-size: 28px; font-variant-numeric: tabular-nums; }
.rate-label { color: var(--subtext); font-size: 12px; }
```

- [ ] **Step 4: Write `RateCard.tsx`**

```tsx
/** A ratio rendered as a percentage. */
export default function RateCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rate">
      <div className="rate-value">{(value * 100).toFixed(0)}%</div>
      <div className="rate-label">{label}</div>
    </div>
  );
}

/** A raw count. Separate from RateCard so a count is never shown as a percent. */
export function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rate">
      <div className="rate-value">{value}</div>
      <div className="rate-label">{label}</div>
    </div>
  );
}
```

Import both in `Progress.tsx`: `import RateCard, { CountCard } from '../components/RateCard';`

Confirm the scale before trusting `RateCard`: `ComputeProgressMetrics` may return rates as fractions or as percentages. Run

```bash
cd dashboard && go run ./cmd/career-data list --path ../desktop/fixtures/career-ops | grep -o '"ResponseRate":[0-9.]*'
```

and if the value is already 0-100, drop the `* 100`.

- [ ] **Step 5: Write `Progress.tsx`**

```tsx
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Progress as ProgressData } from '../api';
import RateCard, { CountCard } from '../components/RateCard';

const AXIS = { stroke: 'var(--subtext)', fontSize: 12 };
const GRID = 'var(--overlay)';

export default function Progress({ data }: { data: ProgressData }) {
  const funnel = data.FunnelStages.map((s) => ({ name: s.Label, count: s.Count, pct: s.Pct }));
  const buckets = data.ScoreBuckets.map((b) => ({ name: b.Label, count: b.Count }));
  const weeks = data.WeeklyActivity.map((w) => ({ name: w.Week, count: w.Count }));

  // Score buckets are ordered from the highest band down, so the first two get
  // the "good" colors. This mirrors the score bands the table uses.
  const bucketColor = (i: number) =>
    ['var(--score-high)', 'var(--score-mid)', 'var(--score-neutral)', 'var(--score-neutral)', 'var(--score-low)'][i]
    ?? 'var(--score-neutral)';

  return (
    <div className="pane">
      <div className="progress-grid">
        <section className="card">
          <h2>Funnel</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnel} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis type="number" {...AXIS} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={90} {...AXIS} />
              <Tooltip
                contentStyle={{ background: 'var(--base)', border: `1px solid ${GRID}`, color: 'var(--text)' }}
                formatter={(v: number, _n, item) => [`${v} (${item.payload.pct.toFixed(0)}%)`, 'Count']}
              />
              <Bar dataKey="count" fill="var(--blue)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h2>Score distribution</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={buckets}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis {...AXIS} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'var(--base)', border: `1px solid ${GRID}`, color: 'var(--text)' }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {buckets.map((b, i) => <Cell key={b.name} fill={bucketColor(i)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h2>Rates</h2>
          <div className="rates">
            <RateCard label="Response" value={data.ResponseRate} />
            <RateCard label="Interview" value={data.InterviewRate} />
            <RateCard label="Offer" value={data.OfferRate} />
          </div>
          <div className="rates" style={{ marginTop: 20 }}>
            <CountCard label="Active" value={data.ActiveApps} />
            <CountCard label="Offers" value={data.TotalOffers} />
          </div>
        </section>

        <section className="card">
          <h2>Weekly activity</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeks}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis {...AXIS} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'var(--base)', border: `1px solid ${GRID}`, color: 'var(--text)' }}
              />
              <Bar dataKey="count" fill="var(--mauve)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire it into `App.tsx`**

Replace the progress placeholder:

```tsx
      : <Progress data={data.progress} />}
```

Add `import Progress from './screens/Progress';`.

- [ ] **Step 7: Verify**

Run: `cd desktop && VITE_CAREER_OPS_PATH=./fixtures/career-ops npm run tauri:dev`, then open Progress.

Check:
1. All four blocks render with data from the ten fixture rows.
2. Toggle the OS between light and dark; every axis, grid line and bar stays legible in both. This is what `prefers-color-scheme` in `theme.css` is for.
3. Resize the window narrow; charts shrink without the page scrolling sideways.
4. Rates read as percentages and the Active/Offers cards read as counts.

- [ ] **Step 8: Commit**

```bash
git add desktop/
git commit -m "feat(desktop): add progress screen with funnel, score, rate and activity charts"
```

---

## Task 13: Update survivability and documentation

Delivers acceptance criteria 5 and 6, and closes the loop on the constraint the whole architecture is built around.

**Files:**
- Create: `desktop/README.md`
- Modify: `.gitignore` (root) — only if the checks below show a gap

**Interfaces:**
- Consumes: everything.
- Produces: no code.

- [ ] **Step 1: Verify acceptance criterion 5**

```bash
cd dashboard
git diff --ignore-cr-at-eol --exit-code -- go.mod go.sum && echo "go.mod unchanged"
go build ./... && go test ./...
```
Expected: `go.mod unchanged`, and every package green, including the pre-existing `internal/data` and `internal/ui/screens` tests.

- [ ] **Step 2: Verify acceptance criterion 6 without running a real update**

`update-system.mjs apply` would pull v1.8.0 → v1.22.0 across sixty-plus system files, which is a separate decision for the user to make. The mechanism can be tested exactly and safely on its own, because `git checkout <commit> -- dashboard/` behaves identically whether the commit is `FETCH_HEAD` or a local one: it restores paths present in the commit and leaves local-only files alone.

`527b3a8` predates this branch, so it contains `dashboard/` without `cmd/career-data/`:

```bash
cd /Users/shane_yeh/Projects/career-ops
git checkout 527b3a8 -- dashboard/
ls dashboard/cmd/career-data/          # must still list every file
git status --porcelain dashboard/      # shows the restored system files
```

Expected: `dashboard/cmd/career-data/` is fully intact. That is the same operation update-system.mjs performs, so the sidecar survives updates.

Restore the branch state:

```bash
git checkout HEAD -- dashboard/
git diff --ignore-cr-at-eol --stat -- dashboard/ | grep . && echo DIRTY || echo CLEAN
```

Expected: `CLEAN`. Note one harmless side effect: both checkouts rewrite `dashboard/`'s tracked files from git, so their line endings come back as LF. Those files were CRLF before this step, which is why they showed as dirty. Fewer dirty paths after this step is the expected outcome, not a problem — and no file content changes.

- [ ] **Step 3: Confirm `desktop/` is outside every system path**

```bash
grep -n "desktop" update-system.mjs || echo "desktop/ is not a system path — correct"
```
Expected: the fallback message. If `desktop` appears in `SYSTEM_PATHS`, stop: the architecture's core assumption has changed.

- [ ] **Step 4: Confirm build artefacts are ignored**

```bash
cd /Users/shane_yeh/Projects/career-ops
git status --porcelain desktop/ | grep -E 'node_modules|src-tauri/(target|binaries|gen)|\.env$' && echo "LEAK" || echo "CLEAN"
```
Expected: `CLEAN`. If it prints `LEAK`, add the missing entries to `desktop/.gitignore`.

- [ ] **Step 5: Write `desktop/README.md`**

```markdown
# career-ops desktop

A Tauri dashboard for the career-ops pipeline. It runs alongside the Go TUI in
`../dashboard`, which stays the terminal and SSH option.

## Requirements

Go 1.24.2+, Node 22+, Rust 1.96+, Xcode Command Line Tools. macOS only.

## Run

    npm install
    npm run tauri:dev

`tauri:dev` builds the Go sidecar first. On first launch the app asks for your
career-ops folder and remembers it.

For UI work against synthetic data, skip the picker:

    VITE_CAREER_OPS_PATH=./fixtures/career-ops npm run tauri:dev

## Build

    npm run tauri:build

## Architecture

    desktop/  ──invoke──▶  src-tauri (Rust)  ──spawn──▶  career-data (Go)
                                                              │
                                                    ../dashboard/internal/data

The Go sidecar (`../dashboard/cmd/career-data`) reuses the TUI's data layer and
emits JSON. Rust only spawns it and forwards stdout. No parsing happens in Rust,
and no domain logic is reimplemented in TypeScript — `normStatus` and
`statusPriority` are computed in Go precisely so they cannot drift.

`dashboard/` is a system path in `update-system.mjs`, so the sidecar is
additive: it imports the existing exported functions and modifies no existing
file. `desktop/` is not a system path at all. Both survive
`node update-system.mjs apply`.

## Writing to the tracker

Changing a status is the only write. It is guarded by an optimistic lock, a
single-cell byte splice, a backup at `data/.applications.md.bak`, and an atomic
rename. Line endings are preserved. Adding rows is not supported — that goes
through `merge-tracker.mjs`, per the pipeline-integrity rule in AGENTS.md.

## Tests

    cd ../dashboard && go test ./...   # sidecar and existing TUI
    npm test                           # filter/sort parity with the TUI
```

- [ ] **Step 6: Report the README gap, do not edit the root README**

The root `README.md` documents the TUI at lines 220-228 and lists "Dashboard TUI" in the features table at line 77. Both are now incomplete.

Per the project's README consistency gate, **do not edit `README.md` or `README.zh-TW.md` in this task.** Instead report to the user:

- What changed: a second dashboard exists, with its own requirements (Rust, Node) and its own run command.
- Proposed edit to `README.md`: add a "Desktop app" subsection after "Dashboard TUI" pointing at `desktop/README.md`, and add a "Desktop Dashboard" row to the features table.
- Proposed edit to `README.zh-TW.md`: the same change, kept in sync.
- Ask whether to proceed.

Only edit after the user confirms.

- [ ] **Step 7: Commit**

```bash
git add desktop/README.md
git commit -m "docs(desktop): document setup, architecture and write safety"
```

---

## Notes for the implementer

**When a step's expected output does not match.** Stop and read the actual output before adjusting code. Several steps deliberately ask you to verify Go's JSON casing (Task 7 Step 1) and the rate scale (Task 12 Step 4) against real output rather than trusting this document, because those values come from structs without JSON tags and cannot be changed from here.

**Never tune code to hit a number this plan predicts.** Task 2 burned three rounds on one field because the plan stated a coverage figure the controller had estimated from an ad-hoc grep rather than measured by running the code. Each time, the implementer was right and the document was wrong. If your measurement disagrees with a stated figure, report the measurement and what produced it. A number in this plan is a hypothesis; your run is the evidence.

**A failing test may be the test's fault.** Several of this plan's tests were written by the controller without being run. When one fails, diagnose before assuming the implementation is wrong — and never edit the implementation to satisfy a test you have not first confirmed is correct. Two concrete traps already hit: a heading string no fixture contained, and comparing a path against an unresolved `t.TempDir()` on macOS, where `/var` is a symlink to `private/var`. Report the diagnosis rather than patching around it.

**When you are tempted to edit a file under `dashboard/` outside `cmd/career-data/`.** Don't. The next `update-system.mjs apply` reverts it. If the data layer genuinely needs a change, that is an upstream issue against `santifer/career-ops`, and the sidecar works around it in the meantime — the same route the status writer took.

**The TUI is the reference implementation.** Where this plan and the Go code disagree about filter or sort behavior, the Go code wins, and the divergence becomes a test case.
