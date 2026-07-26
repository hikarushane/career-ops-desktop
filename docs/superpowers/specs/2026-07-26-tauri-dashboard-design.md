# Tauri Desktop Dashboard — Design

**Date:** 2026-07-26
**Status:** Approved, pending implementation plan
**Scope:** Add a Tauri desktop dashboard that reaches feature parity with the existing Go TUI, running alongside it.

---

## 1. Motivation

The existing dashboard is a Go + Bubble Tea TUI (`dashboard/`, ~3,900 lines across three screens). It works, but four things push toward a desktop GUI:

- **Charts.** The progress screen draws its funnel, score distribution, and weekly activity with block characters. A real chart is legible; a character-cell bar is not.
- **Mouse and forms.** Changing a status means opening a modal picker and driving it with keys. A dropdown in the row is faster and needs no memorized bindings.
- **No terminal.** Launching requires `cd dashboard && go build && ./career-dashboard --path ..`. A double-clickable app removes that.
- **Reading reports.** Evaluation reports are long markdown documents. Rendered markdown beats a terminal pager, and generated CV PDFs should be reachable from the same window.

The TUI stays. It is the fallback for SSH and terminal-only contexts, and it stays under upstream maintenance. Whether to remove it is a later decision, made after the desktop app has proven itself.

---

## 2. Constraints

These three facts shape every decision below.

### 2.1 `dashboard/` is a system path

`update-system.mjs` lists `dashboard/` in `SYSTEM_PATHS` (update-system.mjs:74). Applying an update runs:

```js
git('checkout', 'FETCH_HEAD', '--', path)
```

for each system path (update-system.mjs:298-300). That command restores files present in `FETCH_HEAD`. It does not delete files that exist only locally.

Consequences:

- A new top-level directory (`desktop/`) is untouched by updates.
- **New** files under `dashboard/` survive updates.
- **Modified** existing files under `dashboard/` are reverted on the next update.

The repo currently sits at v1.8.0 with v1.22.0 available upstream, so an update will happen.

### 2.2 The repo has never been onboarded

`cv.md`, `config/profile.yml`, `modes/_profile.md`, `portals.yml`, and `data/applications.md` do not exist. Neither do the `data/`, `reports/`, or `output/` directories.

The TUI currently exits with status 1 on launch (main.go:162-165). There is no real data to develop or test a UI against, so the design must supply fixtures and must treat the empty state as a designed screen rather than a fallback.

### 2.3 The existing status writeback is unsafe

`replaceStatusInLine` (dashboard/internal/data/career.go:580-583) does:

```go
return strings.Replace(line, oldStatus, newStatus, 1)
```

This replaces the first occurrence anywhere in the row. A company named `Offerpad` with status `Offer`, or a notes cell containing `Interview`, corrupts the wrong column. `UpdateApplicationStatus` additionally rejoins with `"\n"`, rewriting the whole file's line endings — relevant because this working tree is CRLF throughout.

The desktop app must not route writes through this function.

---

## 3. Architecture

Three components:

| Component | Location | Survives `update-system.mjs apply` |
|---|---|---|
| Go sidecar `career-data` | `dashboard/cmd/career-data/` | Yes — new files only |
| Tauri app | `desktop/` | Yes — not a system path |
| Existing Go TUI | rest of `dashboard/` | Yes — left unmodified, keeps receiving upstream updates |

### 3.1 The rule: never modify an existing file under `dashboard/`

The sidecar is purely additive. It imports the already-exported functions from `internal/data` and `internal/model`:

- `data.ParseApplications(path) []model.CareerApplication`
- `data.ComputeMetrics(apps) model.PipelineMetrics`
- `data.ComputeProgressMetrics(apps) model.ProgressMetrics`
- `data.LoadReportSummary(path, reportPath) (archetype, tldr, remote, comp string)`

No new Go dependencies — `encoding/json` is stdlib, so `go.mod` needs no edit either.

The trade this buys: when upstream improves the parser, the sidecar inherits the improvement for free. When upstream changes a signature, the sidecar fails to compile — a loud, detectable failure rather than silent drift. Two parsers maintained in parallel would drift silently, which is the failure mode this rule exists to prevent.

### 3.2 Read and write are split

**Read** calls the existing exported functions listed above.

**Write** is implemented inside the sidecar, in `dashboard/cmd/career-data/writer.go`. It does not call `data.UpdateApplicationStatus`, for the reasons in §2.3.

### 3.3 Rust does no parsing

The Rust layer does exactly three things: spawn the sidecar, forward its stdout to the frontend, and turn a non-zero exit into a typed error. All domain logic lives in Go; all presentation lives in TypeScript. Anything else in Rust is a bug.

---

## 4. Sidecar CLI contract

`career-data` writes JSON to stdout, human-readable diagnostics to stderr, and exits non-zero on failure.

```
career-data list        --path <dir>
career-data report      --path <dir> --file <reportPath>
career-data set-status  --path <dir> --report-number <n> --expect-status <s> --status <s>
career-data doctor      --path <dir>
```

`--path` accepts the career-ops root. The sidecar resolves the tracker at `<dir>/applications.md`, falling back to `<dir>/data/applications.md`, matching `ParseApplications`.

### 4.1 `list`

```json
{
  "ok": true,
  "applications": [
    {
      "number": 1,
      "date": "2026-07-01",
      "company": "Anthropic",
      "role": "Applied AI Engineer",
      "status": "Evaluated",
      "score": 4.5,
      "scoreRaw": "4.5/5",
      "hasPdf": true,
      "pdfPath": "output/anthropic-applied-ai.pdf",
      "reportPath": "reports/001-anthropic-2026-07-01.md",
      "reportNumber": "001",
      "notes": "Strong archetype match",
      "jobUrl": "https://job.example/123",
      "archetype": "Applied AI",
      "tldr": "…",
      "remote": "Remote (EU)",
      "compEstimate": "€90-110k"
    }
  ],
  "metrics": {
    "total": 1, "byStatus": {"evaluated": 1},
    "avgScore": 4.5, "topScore": 4.5, "withPdf": 1, "actionable": 1
  },
  "progress": {
    "funnelStages": [{"label": "Evaluated", "count": 1, "pct": 100.0}],
    "scoreBuckets": [{"label": "4.5-5.0", "count": 1}],
    "weeklyActivity": [{"week": "2026-W27", "count": 1}],
    "responseRate": 0.0, "interviewRate": 0.0, "offerRate": 0.0,
    "avgScore": 4.5, "topScore": 4.5, "totalOffers": 0, "activeApps": 1
  }
}
```

`list` eagerly resolves every report summary, mirroring the TUI's batch preload (main.go:175-183). Report count is in the hundreds at most; the cost is not worth lazy loading.

`metrics.byStatus` keys are `NormalizeStatus` output — lowercase, not the display casing in the `status` field (career.go:446-447). The frontend maps them back to labels for display.

`tldr` here is the value returned by `LoadReportSummary`, which truncates at 120 characters. That is fine for the table preview card — the untruncated text is available in the full markdown from `report`. Re-implementing the extraction regexes in the sidecar to avoid truncation would duplicate logic and is rejected.

`pdfPath` is resolved by globbing `output/*.pdf` and matching against a slug of the company name. `generate-pdf.mjs` takes its output path as a caller-supplied argument (generate-pdf.mjs:81-99), so there is no naming convention to rely on. A unique match sets `pdfPath`; zero or multiple matches leave it empty and set `hasPdf` from the tracker column alone. The UI does not guess.

### 4.2 `report`

```json
{
  "ok": true,
  "path": "reports/001-anthropic-2026-07-01.md",
  "markdown": "# 001 — Anthropic …",
  "archetype": "Applied AI",
  "tldr": "…",
  "remote": "Remote (EU)",
  "comp": "€90-110k"
}
```

`--file` is validated to resolve inside the career-ops root after symlink resolution. A path escaping the root is rejected with `error: "invalid-path"`.

### 4.3 `set-status`

Success:

```json
{
  "ok": true,
  "reportNumber": "001",
  "oldStatus": "Evaluated",
  "newStatus": "Applied",
  "backup": "data/.applications.md.bak"
}
```

Failure:

```json
{
  "ok": false,
  "error": "stale",
  "message": "Row 001 currently reads \"Applied\", expected \"Evaluated\". The file changed outside the app.",
  "actualStatus": "Applied"
}
```

Error codes: `not-found`, `stale`, `invalid-status`, `invalid-path`, `parse-error`, `io-error`.

`--status` is validated against the canonical set from `templates/states.yml`: `Evaluated`, `Applied`, `Responded`, `Interview`, `Offer`, `Rejected`, `Discarded`, `SKIP`. Anything else returns `invalid-status` without touching the file.

### 4.4 `doctor`

```json
{
  "ok": true,
  "careerOpsPath": "/Users/…/career-ops",
  "trackerPath": null,
  "missing": ["cv.md", "config/profile.yml", "portals.yml", "data/applications.md"],
  "ready": false
}
```

`ready` is false whenever the tracker is missing. The other entries in `missing` are informational and drive the empty-state copy.

---

## 5. Write safety

`applications.md` is user data that cannot be regenerated. `set-status` applies four protections, in order:

1. **Optimistic lock.** After locating the row by report number, verify that the row's current status equals `--expect-status`. A mismatch means the file changed outside the app; return `stale` and write nothing.
2. **Single-column edit.** Split the row into cells, replace only the status cell, and rejoin. Every other cell is preserved byte-for-byte. No table reformatting, no column realignment, no whitespace normalization.
3. **Backup.** Copy the tracker to `data/.applications.md.bak` before writing. Single level, overwritten each time.
4. **Atomic write.** Write to a temp file in the same directory, then `rename` over the target. A crash mid-write leaves the original intact.

**Line endings are preserved.** The writer detects the file's dominant terminator on read and rejoins with the same one. This working tree is CRLF; a writer that normalizes to LF would show every row as modified in `git diff`.

The row locator handles both delimiter forms `ParseApplications` accepts: pure pipe-delimited, and the mixed `| ` prefix with tab-separated cells (career.go:56-60).

---

## 6. Screens

Single window. A narrow left nav switches between Pipeline and Progress. No multi-window.

### 6.1 Pipeline

Replaces the TUI's pipeline and viewer screens. The TUI split them because a terminal has no room for both; a desktop window does, so they become a split pane.

- **Metrics bar** (top): Total, Avg score, Top score, Actionable, With PDF.
- **Toolbar**: eight filter tabs — `ALL`, `EVALUATED`, `APPLIED`, `INTERVIEW`, `TOP ≥4`, `SKIP`, `REJECTED`, `DISCARDED`; a search box matching substrings across company, role, and notes; a sort control over score / date / company / status; a grouped ↔ flat toggle.
- **Left pane — table**: click a column header to sort, score cells colored by band, and the status cell is an inline dropdown over the eight canonical states. Selecting a value writes immediately.

  Score bands match `scoreStyle` (pipeline.go:1081-1091) exactly: `≥ 4.2` green, `≥ 3.8` yellow, `≥ 3.0` neutral, below that red. Diverging here would make the two dashboards disagree about which rows look good.
- **Right pane — report**: a preview card (Archetype, TL;DR, Remote, Comp, a button opening the job URL in the system browser, a button opening the PDF when `pdfPath` resolved), and below it the full rendered markdown.

Grouped view orders status groups as the TUI does: interview, offer, responded, applied, evaluated, skip, rejected, discarded.

### 6.2 Progress

Four blocks, drawn as SVG rather than character cells:

- Funnel — horizontal bars with per-stage counts and percentages.
- Score distribution — histogram over the buckets `ComputeProgressMetrics` produces.
- Rates — three cards: response, interview, offer.
- Weekly activity — bar chart over ISO weeks.

### 6.3 Empty state

The app invokes `doctor` on launch. When `ready` is false it shows the empty state instead of the pipeline: which files are missing, and that onboarding happens in the CLI.

This is the only screen reachable with no data, and it is the first screen this repo will actually show. It gets designed properly — not treated as a fallback.

---

## 7. Data flow

```
launch → doctor → ready === false ? empty state : list → all data into React state
change status → set-status → on success, re-run list
select row → report --file <path> → render
```

Full reload after a write rather than local state patching. Data volume is a few hundred rows; the reload cost is negligible and it guarantees the view never diverges from the file. This mirrors the TUI's `reloadPipelineData` (main.go:36-41).

External file changes are picked up by a manual **Reload** button. No file watcher — see §11.

---

## 8. Error handling

**No optimistic UI.** The request goes out first; the table updates only on success. A failed write leaves the old value visible alongside the error. The app never shows a state the file does not have.

Sidecar stderr is surfaced verbatim. It is not swallowed and not rewritten into a generic message.

Specific cases:

| Condition | Behavior |
|---|---|
| Sidecar binary missing | "Sidecar not built — run `npm run build:sidecar`" |
| Sidecar exits non-zero | Show the error code and stderr text |
| stdout is not valid JSON | Show the raw stdout and stderr |
| `set-status` returns `stale` | Keep the old value, prompt to Reload |
| `set-status` returns `not-found` | Keep the old value, prompt to Reload |
| Tracker disappears while running | Fall back to the empty state |

---

## 9. Testing

**Go sidecar** — table-driven tests with fixtures under `dashboard/cmd/career-data/testdata/`. Required dirty-data cases:

- Company name containing `Offer` (e.g. `Offerpad`) with status `Offer`
- Notes cell containing `Interview` while status is something else
- Mixed `| ` + tab delimiter rows
- Rows with fewer cells than the header
- Duplicate report numbers
- CRLF input — assert the output keeps CRLF
- Optimistic lock — the file changes between read and write, assert `stale` and an unmodified file

**Frontend** — no end-to-end suite. Instead, `desktop/fixtures/career-ops/` provides a synthetic career-ops root (an `applications.md` covering every status and score band, plus three reports). Dev mode points at it by default. This is what makes UI work possible while the real repo has no data.

**Regression** — `cd dashboard && go test ./...` must stay green. The sidecar adds tests; it changes none.

---

## 10. Build and configuration

`desktop/` carries its own `package.json` and `.gitignore`. The root `package.json` is a system path and is not touched.

```
npm run build:sidecar   # go build ./cmd/career-data
                        # host triple from `rustc -vV`
                        # → src-tauri/binaries/career-data-<triple>
npm run tauri dev       # runs build:sidecar first
npm run tauri build     # produces the .app
```

`tauri.conf.json`:

```json
{
  "bundle": { "externalBin": ["binaries/career-data"] }
}
```

Capabilities grant `shell:allow-execute` scoped to `binaries/career-data` with `sidecar: true`, and nothing else.

**Stack:** React + Vite + TypeScript.

**Theme.** The TUI ships Catppuccin Mocha and Latte (`dashboard/internal/theme/`). The desktop app reuses those palettes as CSS custom properties and follows the OS light/dark preference — Latte for light, Mocha for dark. Status and score colors then read identically across both dashboards.

**career-ops path.** Never hardcoded. Stored in Tauri's app config; on first launch the app shows a directory picker. `desktop/.env.example` documents a `CAREER_OPS_PATH` override for development, defaulting to the fixtures directory.

`desktop/.gitignore` covers `node_modules/`, `src-tauri/target/`, `src-tauri/binaries/`, and `.env`. Only `.env.example` is committed; no path, key, or token is ever hardcoded in source.

---

## 11. Out of scope

Recorded deliberately, not forgotten:

- **File watcher** for external tracker changes. Manual Reload first; add a watcher only if the manual button proves annoying in practice.
- **Triggering scripts from the GUI** (`scan.mjs`, `generate-pdf.mjs`, `check-liveness.mjs`).
- **Editing notes**, or any tracker column other than status.
- **Adding rows.** New entries go through `merge-tracker.mjs`, per the pipeline-integrity rule in AGENTS.md.
- **Multi-window, tabs, and cross-platform packaging.** macOS only for now.
- **Removing the Go TUI.** A separate decision, after this app has been used against real data.

---

## 12. Acceptance criteria

1. On this repo as it stands today (no user data), the app launches and shows the empty state listing the missing files.
2. Against `desktop/fixtures/career-ops/`, all eight filter tabs, four sort modes, search, and grouped/flat produce the same row sets as the TUI on the same fixture.
3. Changing one row's status yields a `git diff data/applications.md` touching exactly that row's status cell — no other cell, no line-ending change.
4. With the app open, editing `applications.md` externally and then changing a status in the app is rejected with `stale` and leaves the file unmodified.
5. `cd dashboard && go test ./...` passes.
6. After `node update-system.mjs apply`, both `desktop/` and `dashboard/cmd/career-data/` are intact and the app still builds.

---

## 13. Known issue, not fixed here

`data.UpdateApplicationStatus` and `replaceStatusInLine` (career.go:545-583) remain unsafe for the TUI, which still calls them. Fixing that means editing a system-layer file, which an update would revert. The correct route is an upstream issue against `santifer/career-ops`. This design routes around the bug rather than fixing it, and the sidecar's writer is where a correct implementation now lives.
