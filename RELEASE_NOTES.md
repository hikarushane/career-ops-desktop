# Release Notes

## v0.5.0

Released 2026-09-04.

- Interview prep, practice and debrief run as conversations: an intake form (date, time, round, interviewer) starts the first turn, follow-up messages continue it, and the exchange survives restarts. Every turn names the job's report and JD capture so smaller models never ask for the posting again.
- Files the AI writes are one click away: prep files under each Interview card, files written under each reply, and the raw JD capture from the report panel.
- Job postings that render client-side (StepStone and similar) are read from their embedded JSON-LD; bot walls such as Indeed explain themselves and fall back to the paste box.
- Settings › Job Search is the onboarding preferences form again; the AI rewrites only the targeting files (`config/profile.yml`, `modes/_profile.md`, `portals.yml`), previewed before it is applied.
- Traditional Chinese interface, switched from a wordless globe tab in Settings or the onboarding language step; a fresh install stays English.
- Kanban cards drag onto status columns; the report panel has a status select, a draggable edge and a JD preview; the table view spans the full width until a row is picked; a finished evaluation opens its card.
- Home shows a running scan or batch, every sub-screen has a top-left Back, and the running task chip breathes.
- Desktop offers Claude Code, Codex and Antigravity (agy) as AI providers; the unverified opencode, copilot, qwen and grok entries are gone.

## v0.4.0

Released 2026-08-27.

- Prepared the remediation release after passing the release-readiness gates.

## v0.3.0

Released 2026-08-27.

- Prepared the remediation release after passing the release-readiness gates.

## v0.2.0

Released 2026-08-27.

- Prepared the remediation release after passing the release-readiness gates.

## v0.1.0

Initial release of CareerOps Desktop.

### Features

- Native desktop application for macOS and Windows
- Full pipeline management with Kanban board view
- AI-powered job evaluation with provider auto-detection
- Job scanner with portal integration
- Interview preparation workflow (plan, practice, debrief)
- Progress analytics with funnel, score distribution, and activity charts
- Profile and settings management
- Configurable analysis and document language
- Background import from existing career-ops data
- Go sidecar for high-performance data operations

### Core Integration

- Built on CareerOps core v1.29.0
- All scoring, tracker, and pipeline logic delegated to upstream core
- Full language system support (analysis language + per-job document language)

### Distribution

- macOS: DMG installer + Homebrew cask
- Windows: NSIS installer
- Automatic update checking via Tauri updater
- Signed update verification
