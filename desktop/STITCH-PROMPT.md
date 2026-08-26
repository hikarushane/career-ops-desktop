# career-ops Desktop — Google Stitch Prompt

Source of truth: [`DESIGN.md`](../DESIGN.md) (Figma Community file *Project Dashboard Management*).

This document translates that system's tokens and components onto the real
career-ops desktop screens (Pipeline, Progress, Empty, Error) and the real
`Application`/`Metrics`/`Progress` data shapes in
[`src/api.ts`](src/api.ts). Paste it into Stitch as-is, or split by screen.

## 0. What changed from the pure template, and why

DESIGN.md is a general project-management/CRM/chat kit. career-ops is a
single-user job-application tracker with no login, no team members, and no
"create new record" flow (new rows only ever arrive via `merge-tracker.mjs`,
per `AGENTS.md`). Deliberate departures, so you can diff against DESIGN.md
quickly:

- **No dark mode.** DESIGN.md doesn't define one (§1); this system doesn't add one.
- **Sidebar has 2 items, not 5.** Pipeline, Progress — the only two screens `App.tsx` renders. No Clients/Messages/Calendar/Settings.
- **No user avatars anywhere.** This app has no login or team concept. The header's "profile block" is repurposed to show the selected career-ops folder, not a person.
- **Kanban board is a reinterpretation**, not sourced from the template's project-portal columns 1:1 — see §6.3.
- **Data table, markdown-report typography, charts, and error/mono text are all Derived.** DESIGN.md §1 explicitly says the source has no tables, no code display, no charts, and no error states. Every token in those areas is new, marked `Derived` below, built to match the Observed tokens' proportions and restraint.
- **Empty and Error screens have no sidebar/header.** `App.tsx` renders them *before* the shell mounts (no root folder yet, or the sidecar is unreachable) — matching DESIGN.md's own precedent of not defining every screen at every shell state.

## 1. Visual Theme & Atmosphere

A bright, airy project-workspace aesthetic applied to a job-search pipeline.
White canvas, generous 20px-radius cards, restrained soft shadows, one
confident green accent for anything actionable or winning. Density 5,
Variance 4, Motion 3 — calmer and more spacious than a trading-terminal
dashboard; this reads like Asana or Trello, not Bloomberg.

Native macOS Tauri desktop window. Primary composition at **1366×768**
(validate here first, per DESIGN.md §4.1/§10.8), responsive down through
tablet. Not a marketing site — no hero section, no scroll storytelling.

## 2. Color Palette & Roles

Exactly DESIGN.md §3.1 — do not introduce new hex values.

| Token | Value | Role |
|---|---|---|
| `color.canvas` | `#FFFFFF` | App background, header, sidebar, cards |
| `color.surface.subtle` | `#F5F5F5` | Metrics panel, table header row |
| `color.surface.muted` | `#E4E4E4` | Score-bar tracks, chart grid lines, disabled |
| `color.text.primary` | `#000000` | Headings, labels, body copy |
| `color.icon.default` | `#222222` | Filled icons |
| `color.line.strong` | `#33363F` | Icon/line accents |
| `color.primary` | `#0AB239` | Interview/Offer status, primary buttons, high score, active nav |
| `color.accent.teal` | `#148B84` | Applied/Responded status, secondary buttons |
| `color.accent.amber` | `#D68C1E` | SKIP status, mid score |
| `color.accent.red` | `#B20000` | Rejected/Discarded status, low score, errors |
| `color.accent.magenta` | `#AC2C80` | Evaluated status (pending decision) |
| `color.text.onAccent` | `#FFFFFF` | Text on filled chips/buttons |

### 2.1 Status color mapping (Derived — DESIGN.md defines 5 semantic slots, career-ops has 8 canonical statuses)

| career-ops status | Template slot | Rationale |
|---|---|---|
| Interview, Offer | `color.primary` (green) | "Selected / success" |
| Applied, Responded | `color.accent.teal` | "Standard ongoing" — distinguish the two by label text only, never color alone (DESIGN.md §5.9) |
| Evaluated | `color.accent.magenta` | Matches DESIGN.md's own definition, "upcoming alternate category" — a report exists, no decision made yet |
| SKIP | `color.accent.amber` | Caution — deliberately paused, not urgent |
| Rejected, Discarded | `color.accent.red` | Closed/inactive — DESIGN.md §3.1 already licenses reusing red for "offline/unavailable," not only "urgent" |

### 2.2 Score band mapping (Derived, thresholds from `filters.ts:scoreBand`)

| Score | Color |
|---|---|
| ≥ 4.2 (high) | `color.primary` (green) |
| 3.8–4.1 (mid) | `color.accent.amber` |
| 3.0–3.7 (neutral) | `color.text.primary` (black) |
| < 3.0 (low) | `color.accent.red` |

## 3. Typography

Poppins, weights 400/500/600/700, exactly DESIGN.md §3.2:

| Role | Size | Weight | Use in this app |
|---|---:|---:|---|
| `display` | 40px | 700 | Header page title ("Pipeline" / "Progress") |
| `heading-lg` | 30px | 600 | (unused — no section needs this scale here) |
| `metric-value` | 25px | 700 | Metrics-panel numbers, Rates card values |
| `metric-label` | 20px | 500 | Metrics-panel labels |
| `card-title` | 18px | 700 | Kanban card company name; report-panel company name; markdown H1 |
| `body-lg` | 16px | 600 | (unused here) |
| `label` | 14px | 700 | Nav items, buttons |
| `date` | 14px | 500 | Kanban card date, table date column |
| `chip` | 13px | 600 | Status chips |
| `body` | 12px | 400–500 | Kanban card role/subtitle, table secondary columns |
| `caption` | 10–11px | 400–600 | Report-number chip, timestamps |

### 3.1 Derived additions (not in DESIGN.md — the source has no article, code, table, or chart surfaces)

| Token | Spec | Use |
|---|---|---|
| `heading-sm` | 16px / 600 | Markdown report H2 |
| `article-body` | 14px / 400, line-height 1.5 | Markdown report paragraphs — bridges the gap between `chip` (13px) and `body-lg` (16/600, too bold for prose) |
| `font-mono` | ui-monospace, "SF Mono", Menlo, monospace | Error dumps, inline code, report score tables, PDF/report-number chips |

Do not synthesize weights with faux-bold (DESIGN.md §3.2).

## 4. Application Shell

Per DESIGN.md §4.1, adapted to this app's 2 screens.

```
AppShell
├── Header (82px)
├── Sidebar (171px) — only on Pipeline / Progress
└── Main (remaining width, independently scrollable)
```

**Empty and Error screens render with no Header and no Sidebar** — full-bleed
centered content. This matches `App.tsx`: both states return before the
`.shell` mounts (no root folder chosen yet, or the sidecar failed to start).

### 4.1 Header (82px)

- Page title at `display` (40px/700): "Pipeline" or "Progress"
- Right-aligned utility icons, 25–32px, filled style: **Reload** icon button, **Change folder** icon button. No notification bell, no messages icon — this app has neither.
- 64px vertical divider
- **Workspace block** (repurposes DESIGN.md's profile block — no user identity exists in this app, so no avatar/name/email):
  - 56px folder-glyph icon in place of an avatar
  - Folder's last path segment, 18px bold (e.g. `career-ops`)
  - Full path, 14px regular, `color.text.primary` at reduced emphasis, truncated with ellipsis if it overflows (e.g. `~/Projects/career-ops`)

### 4.2 Sidebar (171px)

- Row height 50px, icon 24px, 30px rounded pill for hover/selected
- Default: white background, black label/icon
- Selected: `color.primary` background, dark label/icon retained (verify contrast per DESIGN.md §9)
- Order: **Pipeline, Progress** — no other items
- Icon concepts: Pipeline = funnel/board glyph, Progress = bar-chart glyph. Match DESIGN.md's filled-icon style; do not invent a different icon language.

## 5. Layout Principles

- CSS Grid for the shell: `82px` header row, then `171px 1fr` column split for sidebar/main
- Content max-width 1194px, 4px spacing grid (`4, 8, 12, 16, 20, 24, 32, 40, 48`) per DESIGN.md §3.5
- No overlapping elements; every card, chip, and panel owns its own spatial zone
- One elevation treatment per surface — never combine a dark border and a strong shadow on the same card (DESIGN.md §3.4)

## 6. Component Stylings

### 6.1 Metrics panel (maps DESIGN.md §5.1 Dashboard summary panel)

- Outer region full content width, inner panel 20px radius, `color.surface.subtle`, `shadow.panel`
- **5 metrics** in one horizontal row with ~51px vertical dividers (career-ops has 5 fields, not 4): Total, Avg, Top, Actionable, With PDF. Values in `metric-value`, labels in `metric-label` beneath, shared baseline.
- Actions stack at the right edge, but **do not add an "Add Project"-style creation button** — this app never creates rows from the UI (`AGENTS.md` pipeline-integrity rule). The action slot holds only **Reload** and **Change folder**, both real, both already in the header — omit this action stack entirely if it would duplicate the header icons. Prefer omitting.
- Wrap metrics before shrinking text on narrower widths.

### 6.2 Status chip

- 13px SemiBold (`chip` token), 25px fixed height, 20px radius, fill = mapped status color at full saturation with `color.text.onAccent` text (or muted-background + colored text if full-saturation chips feel too loud against the white canvas — pick one treatment and use it everywhere, never mixed per-screen)
- Always paired with the status label text, never color alone (DESIGN.md §5.9)

### 6.3 Kanban board — Pipeline, Grouped view (reinterprets DESIGN.md §5.4)

career-ops already groups applications into exactly these 8 status buckets, in
this order (`STATUS_GROUP_ORDER`): **Interview, Offer, Responded, Applied,
Evaluated, SKIP, Rejected, Discarded.** This is a natural Kanban board — one
column per status, not the template's To-Do/In Progress/Activity columns.

- Column: 285px wide, 58px header (status name + count badge), 13px gap between columns
- **8 columns is wider than one screen.** Board container scrolls horizontally (`overflow-x: auto`); first ~4 columns visible at 1366px, remainder reachable by scroll, with a soft right-edge fade hinting more content — this extends DESIGN.md's own mobile-scroll guidance (§8) to the desktop board rather than inventing a new pattern.
- Column header background: `color.surface.subtle`; status color shows only as a small dot beside the column title, not a full-color header (keeps 8 columns calm, not a rainbow strip)

**Card anatomy** (adapts DESIGN.md §5.2 `ProjectCard`, 263×221px, 20px radius, `shadow.card`):

| Slot | Content | Style |
|---|---|---|
| Top | Application date | `date` token, centered |
| Title | Company | `card-title`, centered |
| Subtitle | Role | `body`, centered — replaces template's phase/category line |
| Progress area | **Score**, rendered as the template's progress bar: track 225×13px, 10px radius, `color.surface.muted` track, fill = `(score/5)×100%` in the §2.2 score-band color, score value in `caption`/`font-mono` at the fill's trailing edge | Replaces "% complete" — a fit score visualized as fill, same mechanic |
| Footer divider | — | begins ~173px per template |
| Footer row | Left: small PDF-available glyph if `hasPdf`. Right: status chip (§6.2), small, for when the column header has scrolled out of view | No avatar stack — this app has no team members; do not invent people |

Clicking a card opens the report in a **480px right-side slide-over drawer**
(white surface, `shadow.panel`, close button top-right) rather than a
permanent split panel — an 8-column board and a permanent report pane can't
both fit at 1366px. This is a deliberate interaction choice, not in DESIGN.md.

### 6.4 Data table — Pipeline, Flat view (Derived; DESIGN.md §1 confirms the source has no table component)

- White rows, `color.surface.subtle` sticky header row, `label` token (14/700) for headers
- Row dividers: `border.divider` (1px, `rgba(0,0,0,0.20)`), edge-to-edge
- Columns: #, Date (`date` token), Company (`card-title` scaled to 14px), Role (`body`), Score (`font-mono`, colored per §2.2, right-aligned), Status (chip, §6.2), PDF (small glyph)
- Selected row: `color.surface.subtle` background, 2px `color.primary` left border
- This view keeps the **permanent split** (table left, report panel right, both `1fr`) — a table is narrow enough that both fit, unlike the Kanban board.

### 6.5 Report detail panel (adapts DESIGN.md §5.3 Client card's info-row language)

- Header block: Company as the "name" position (`card-title`), Role beneath (`body`, muted)
- Key-value rows below, same visual rhythm as client-card contact rows (icon optional, `color.text.primary` value, `color.surface.muted`-toned label): Archetype, TL;DR, Remote, Comp
- Actions: **Open job posting** (primary green, DESIGN.md §5.9 compact-button spec — 14px bold, 5px/10px padding, 20px radius), **Open PDF** (teal secondary) — mirrors the template's primary/secondary button convention from Add/Remove Project
- Markdown report body below, using the Derived tokens from §3.1: H1 = `card-title`, H2 = `heading-sm`, paragraphs = `article-body`, code/tables = `font-mono` on `color.surface.subtle`
- Empty state (no row selected): centered `article-body` text, "Select a card to read its report," generous white space, no illustration needed for this transient state

### 6.6 Charts — Progress screen (Derived; DESIGN.md has no chart precedent)

Four cards in a 2×2 grid, each `color.canvas` with `shadow.panel`, 20px radius,
section title in `metric-label` uppercase-tracked:

1. **Funnel** — horizontal bars, Evaluated→Applied→Responded→Interview→Offer, single hue `color.primary` (matches DESIGN.md's "green is the main interactive color")
2. **Score distribution** — vertical bars, one per bucket, colored via §2.2
3. **Rates** — reuse `metric-value`/`metric-label` directly (already defined, no new token needed): Response %, Interview %, Offer %, plus Active/Offers counts
4. **Weekly activity** — vertical bars, single hue `color.accent.teal` (activity = "ongoing," matches its status-color semantic)

Grid lines: `color.surface.muted`, solid, thin. Axis text: `body` token, muted.
No legends on single-series charts. No neon/gradient fills.

### 6.7 Empty / Onboarding state (adapts DESIGN.md §5.7 Messages empty state)

Full-bleed, no shell. Centered composition, max-width 640px, generous
surrounding white space — do not fill it with decoration (DESIGN.md's own
instruction for this pattern):

- Title: "career-ops is not set up yet" (`card-title` scaled up, or `heading-lg`)
- Subtitle: selected path or "No career-ops folder selected," `body`, muted
- Missing-file list: each a `color.surface.subtle` row, left border in `color.accent.amber` (caution, not error — nothing is broken, setup is incomplete), filename in `font-mono`/amber, explanation in `body`/muted
- Primary button (green, §5.9 spec): "Choose your career-ops folder"

### 6.8 Error state (Derived — no template precedent)

Full-bleed, no shell, centered, `card-title`: "Cannot reach the sidecar."
Error text in `font-mono`, `color.accent.red`, `color.surface.subtle`
background block, generous padding — reuses the report panel's code-block
treatment (§6.5) for consistency rather than inventing a new one.

## 7. Responsive Behavior

Reuse DESIGN.md §8 tiers as-is. Practical note for this app: it's a native
window, not a webpage — `tauri.conf.json` sets no minimum size and the
default window is 800×600, so **Tablet (768–1199px)** is the range actually
exercised day-to-day, not just an intermediate step down to mobile. Design
that tier with real care; treat sub-768 "Mobile" as completeness coverage
only, per DESIGN.md's own methodology, unlikely to be exercised in practice.

- **Desktop ≥1200px:** full 171px sidebar, 82px header, board shows ~4 columns before scroll
- **Tablet 768–1199px:** collapse sidebar to icon rail; Kanban board scrolls after ~2 columns; table view keeps its split
- **Mobile <768px:** drawer navigation; single-column stacking; board becomes single-column-at-a-time with swipe

## 8. Motion

Reuse DESIGN.md §7 exactly — this is not a template that earns spring
physics or perpetual micro-loops:

- Hover/press: 120–180ms
- Panel/drawer/route transitions: 180–240ms
- Respect `prefers-reduced-motion`
- Skeleton loaders (Derived, for table/board while data loads): flat shimmer rectangles matching row/card dimensions, no circular spinners

## 9. Anti-Patterns (Banned)

Everything DESIGN.md §6 and §12 already ban, plus, specific to this
adaptation:

- No user avatars, no fake names — this app has no login or team concept
- No invented "create new application" button or flow — this app is browse + status-edit only
- No dark mode — out of scope, matches source
- No notification badges or message icons in the header — nothing in this app produces them
- No redrawn icons from memory — match DESIGN.md's filled-icon style or use a verified matching icon set
- No generic company/role placeholder text — use the realistic sample data in §10

## 10. Screen Specifications

### Screen 1: Pipeline — Grouped (Kanban)

1366×768. Header: "Pipeline" title, Reload + Change-folder icons, workspace
block showing `career-ops` / `~/Projects/career-ops`. Sidebar: Pipeline
active (green pill).

Metrics panel: Total 34 · Avg 3.6 · Top 4.8 · Actionable 28 · With PDF 12

Board columns left to right (first 4 visible, rest via scroll), sample cards:

**Interview** (3)
- Anthropic — Head of Applied AI — 2026-07-18 — score 4.8 (green bar)
- Stripe — Staff ML Engineer — 2026-07-12 — score 4.5 (green bar)
- Vercel — Senior AI Engineer — 2026-07-08 — score 4.3 (green bar)

**Offer** (1)
- Anthropic — Head of Applied AI — 2026-08-10 — score 4.8 (green bar)

**Responded** (2)
- Ramp — Senior Backend Engineer — 2026-07-20 — score 4.1 (amber bar)
- Retool — ML Platform Engineer — 2026-07-19 — score 3.9 (amber bar)

**Applied** (8, board scrolls to reach)
- Linear — Principal Engineer — 2026-07-22 — score 4.6
- Notion — ML Platform Lead — 2026-07-16 — score 4.2
- Figma — Staff Engineer, AI — 2026-07-15 — score 4.0

One card (Stripe, Interview column) shown mid-click, drawer sliding in from
the right with its report open (see Screen 1c).

### Screen 1b: Pipeline — Flat (table)

Same header/sidebar/metrics. Toolbar row beneath metrics: filter pills (ALL
34, EVALUATED 18, APPLIED 8, INTERVIEW 3, TOP ≥4 9, SKIP 2, REJECTED 1,
DISCARDED 2), search input right-aligned, sort dropdown, view-mode dropdown
set to "Flat."

Split view: left = data table (§6.4) with the same sample rows as above,
sorted by score descending, Stripe row selected. Right = permanent report
panel for Stripe (see Screen 1c content, non-drawer).

### Screen 1c: Report panel content (Stripe)

- Company: Stripe · Role: Staff ML Engineer
- Archetype: ML Infrastructure
- TL;DR: ML platform for fraud detection and revenue optimization. Strong IC track with path to tech lead.
- Remote: Hybrid (SF/Seattle) · Comp: $380K–$450K TC
- Buttons: Open job posting (green), Open PDF (teal)
- Below: rendered markdown with an H2 section header, a few bullet points, and a small score-breakdown table in `font-mono`

### Screen 2: Progress (analytics)

Header: "Progress" title. Sidebar: Progress active.

2×2 card grid (§6.6):
1. Funnel — Evaluated 18, Applied 8, Responded 5, Interview 3, Offer 1 (green bars)
2. Score distribution — ≥4.5: 4 (green), 4.0–4.4: 8 (amber), 3.5–3.9: 10 (black), 3.0–3.4: 7 (black), <3.0: 5 (red)
3. Rates — Response 62%, Interview 38%, Offer 13%; Active 11, Offers 1 (all `metric-value`/`metric-label`)
4. Weekly activity — 6 bars, counts 2/5/8/3/6/4, teal

### Screen 3: Empty / Onboarding

No shell. Centered, max-width 640px:
- "career-ops is not set up yet"
- "No career-ops folder selected."
- Missing-file rows: `cv.md` ("Your CV in markdown..."), `config/profile.yml` ("Name, location, target roles..."), `data/applications.md` ("The tracker...")
- Green button: "Choose your career-ops folder"

### Screen 4: Error

No shell. Centered:
- "Cannot reach the sidecar"
- Monospace red error block: `sidecar exited with code 1: career-data: cannot parse applications.md line 42: missing score column`

## 11. Suggested CSS custom properties

Extends DESIGN.md §11 verbatim, adds only the Derived tokens from §3.1:

```css
:root {
  /* --- from DESIGN.md, unchanged --- */
  --font-sans: "Poppins", system-ui, sans-serif;

  --color-canvas: #ffffff;
  --color-surface-subtle: #f5f5f5;
  --color-surface-muted: #e4e4e4;
  --color-text-primary: #000000;
  --color-icon-default: #222222;
  --color-line-strong: #33363f;
  --color-primary: #0ab239;
  --color-accent-teal: #148b84;
  --color-accent-amber: #d68c1e;
  --color-accent-red: #b20000;
  --color-accent-magenta: #ac2c80;

  --radius-card: 20px;
  --radius-control: 20px;
  --radius-nav: 30px;
  --radius-track: 10px;

  --shadow-card: 0 4px 5px rgb(0 0 0 / 30%);
  --shadow-panel: 0 0 5px 5px rgb(0 0 0 / 10%);
  --shadow-action: 0 4px 10px rgb(0 0 0 / 25%);

  --header-height: 82px;
  --sidebar-width: 171px;
  --content-max-width: 1194px;

  /* --- Derived for career-ops: markdown reading, tables, charts, errors --- */
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
  --kanban-column-width: 285px;
  --kanban-column-gap: 13px;
  --drawer-width: 480px;
}
```

## 12. Open question for you, not Stitch

The app currently has no in-shell way to change the career-ops folder once
data has loaded — `EmptyState`'s picker is only reachable before setup
completes. §4.1's "Change folder" header icon assumes that affordance exists.
It doesn't yet in `App.tsx`/`api.ts`. Worth a small follow-up once the mockup
is back, so the design and the real app agree.
