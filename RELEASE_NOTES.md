# Release Notes

## v0.5.2

Released 2026-09-14.

- **First Windows installer.** `CareerOps_0.5.2_Windows.exe` (NSIS, x64); the in-app updater downloads that same installer and checks it against `CareerOps_0.5.2_Windows.exe.sig`. The installer and the executables it installs are code-signed: free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org) (the publisher shown by Windows is "SignPath Foundation"). SmartScreen may still show "Windows protected your PC" until the publisher earns reputation: choose *More info* → *Run anyway*. The code signing policy is in the README.
- Set up AI › **Install** opens a visible terminal window that runs the provider's official install script and then its sign-in command (`claude auth login`, `codex login`, `agy`); the card turns Ready on its own once the CLI is detected, and shows the exact command line as a copyable fallback.
- Settings › My Background › **Regenerate profile** now shows the same document import step as onboarding before generating, so documents can be added after skipping it during setup.
- The hidden `npm install -g` provider install path in the sidecar is gone; installs only ever happen in a terminal the user can read.
- Creating a workspace at the default path on Windows no longer fails with os error 32 and no longer leaves a `.careerops-workspace-stage-*` folder behind: the staged copy releases its directory handles before the atomic install and verifies the installed directory's identity afterwards.
- AI tasks on Windows no longer flash an empty console window; Cancel now terminates the whole task process tree (`taskkill /T`) instead of calling a `kill` that does not exist there.
- Settings › Workspace *Open Folder* and Settings › My Background *Open raw files* work for a workspace on any local drive (the opener scope was limited to the home directory).
- Reload re-reads the tracker again (the header button was passing its click event as the path), and an evaluation that finishes while another screen is open now refreshes the board on its own.
- Check for Updates reports the outcome even when it joins the background poll, and every update request is bounded by a 30 s timeout instead of spinning forever.
- The header task chip lists every running task in a menu when more than one is running; a row in Home's recent activity opens the report drawer in place instead of switching to Jobs; the status pill draws its own chevron so it looks the same on WebView2 and WebKit.
- `go test ./...` passes on Windows (test expectations were macOS-specific).
- Upstream Maintenance runs on a Claude subscription via `anthropics/claude-code-action` instead of an API key.

## v0.5.1

Released 2026-09-06.

- Integrated CareerOps core 1.32.0 at fe06051ba57c78934b89355bebe2c67f3a5cdb14.
- Evaluations from that core rate how much each requirement matters to the posting, and whether that weight is stated by the JD, implied by its structure, or inferred; every report archives the job description verbatim; tracker additions carry a header row, so a score can never land in the status column.
- Zero-token scanning gains Collage HR, Telegram channels, Feishu Jobs and MokaHR. CLI users also get `audit-portals.mjs`, `fetch-jd.mjs`, and an external data directory (`CAREER_OPS_ROOT`).
- A workspace keeps the core it was created with; updating the app does not replace it. New workspaces start from 1.32.0 (see the README).
- Upstream moved to career-ops-hq/career-ops; the Help screen links there.
- Cover letters named `{company}-{role}-cover.pdf` keep resolving in the dashboard under the core's stricter company matching.
- macOS only, like 0.5.0. The Windows installer follows once the workspace-initialization tests pass on Windows.

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
- macOS only. The Windows installer follows in 0.5.1, once the workspace-initialization tests pass on Windows.

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
