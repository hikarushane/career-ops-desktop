<p align="center">
  <img src="./docs/wordmark-light.svg" alt="CareerOps Desktop" width="250" />
</p>
<p align="center">
  <strong>AI-powered job search, without copy-pasting between endless tabs and AI.</strong>
</p>
<p align="center">
  <a href="./README.md">繁體中文</a>
</p>

# CareerOps Desktop

A desktop app built on top of [santifer/career-ops](https://github.com/santifer/career-ops). It keeps the upstream job-search engine, tracker, reports, scanner, batch processing, interview tools, and document generation, then adds a native Tauri interface for people who do not want to operate the system through a coding-agent terminal.

## Project scope and upstream

This repository is an unofficial downstream fork of [santifer/career-ops](https://github.com/santifer/career-ops). The upstream project remains the source of truth for CareerOps domain logic and core workflows; this fork maintains the desktop product layer, compatibility work, and user-facing integration around it.

CareerOps Desktop is not affiliated with, sponsored by, or endorsed by the upstream maintainer. Upstream work remains credited to its original authors and contributors.

The desktop architecture intentionally avoids reimplementing CareerOps business logic. The app orchestrates the existing core, while the Go sidecar and upstream scripts remain responsible for canonical tracker, report, status, scanner, batch, and document behavior.

## Installation

Prebuilt desktop releases are the intended installation path.

### macOS

Download the latest macOS build from [GitHub Releases](https://github.com/hikarushane/career-ops-desktop/releases).

Homebrew distribution is planned as part of the desktop release pipeline.

### Windows

Download the latest Windows installer from [GitHub Releases](https://github.com/hikarushane/career-ops-desktop/releases).

> Until signed public releases are available, macOS or Windows may show the operating system's standard warning for unsigned applications.

## What it adds

| Area | CareerOps Desktop |
| --- | --- |
| **Onboarding** | Import background documents, configure AI, choose analysis language, and get ready without editing YAML by hand. |
| **AI provider** | Detect and use supported local AI CLIs such as Codex through a provider abstraction instead of hard-coding one agent. |
| **Job evaluation** | Paste a job URL and run the CareerOps evaluation flow from the app. |
| **Job discovery** | Run scanner and batch workflows with visible progress, deduplication, failures, and ranked results. |
| **Applications** | Browse the existing CareerOps pipeline, reports, statuses, PDFs, and progress in a native interface. |
| **Interview** | Use Prep Planner, Practice, and Debrief workflows from the desktop app. |
| **Language system** | Choose the language used to read analysis while CVs, cover letters, and interview materials follow each job description's language. |
| **Help and settings** | Manage profile, sources, AI provider, language, and help content inside the app. |
| **Human in the loop** | CareerOps can evaluate, draft, and recommend, but the user keeps the final decision and submission step. The desktop layer never submits an application or sends outreach on your behalf. <!-- hitl: absolute guarantee. Do not add "automatically", "by itself", "without your permission" or any other hedge when translating this row. --> |

## Language behavior

CareerOps Desktop separates the language you use to read analysis from the language of documents produced for a job.

- **Analysis Language** controls dashboard and report prose.
- **Job Language** is resolved per job description and is used for CVs, cover letters, and interview material.
- **Market mode** remains independent and controls market-specific vocabulary and rules.

For example, you can read the analysis in Traditional Chinese while producing a German CV and German interview material for a German-language job description.

The desktop app keeps only English and Traditional Chinese README documentation. Other upstream README translations are not maintained as part of this fork.

## How the desktop app works

The main flow is:

```text
Onboarding
  ↓
Home
  ├─ Analyze one job
  └─ Find jobs
       ↓
Evaluate / Scanner / Batch
       ↓
Applications
       ↓
Interview / Progress
```

The app exposes CareerOps through a native UI instead of requiring users to open a coding-agent session and manually navigate Markdown, YAML, or command modes.

AI-powered tasks still run through a configured local AI provider. The desktop app does not turn CareerOps into a hosted service and does not require a separate CareerOps backend.

## Architecture

```text
desktop/ (React + Tauri UI)
        │
        │ typed Tauri invoke
        ▼
desktop/src-tauri/ (Rust)
        │
        │ controlled process execution
        ▼
career-data sidecar (Go)
        │
        ▼
dashboard/internal/data + upstream CareerOps files
```

The Go sidecar reuses the existing CareerOps data layer and emits structured JSON. Rust handles the desktop bridge and controlled process execution. TypeScript renders the product interface and should not become a second implementation of CareerOps domain rules.

AI tasks follow a similar boundary:

```text
Desktop UI
   ↓
AgentRunner
   ↓
AgentProvider
   ↓
Codex / another supported local AI CLI
   ↓
CareerOps modes and canonical files
```

## Data and safety

CareerOps Desktop keeps the upstream human-in-the-loop model.

- Source career documents remain under the user's control.
- Tracker and report formats remain upstream-compatible.
- Status changes use guarded write paths rather than arbitrary Markdown rewriting.
- The desktop layer does not submit job applications or send outreach automatically.
- AI provider credentials are handled by the provider's own local CLI authentication where supported.
- CareerOps core files remain the canonical source instead of being duplicated into a separate desktop database.

## For developers

The old `desktop/README.md` has been consolidated into this file. There should be no second README under `desktop/`.

### Codex users

CareerOps supports Codex as an AI provider. See [CODEX.md](./CODEX.md) for setup. In headless mode, run `codex exec "prompt"` from the repository root. Slash commands are not guaranteed in Codex; use plain language prompts instead.

### Requirements

Use the versions required by the repository's current manifests and CI. The desktop stack includes:

- Node.js
- Go
- Rust
- Tauri system prerequisites
- Xcode Command Line Tools on macOS
- Windows build prerequisites when building the Windows package

### Run the desktop app

```bash
cd desktop
npm install
npm run tauri:dev
```

`tauri:dev` builds the Go `career-data` sidecar before launching the app.

For UI development with synthetic data, use the fixture mechanism already provided by the repository rather than editing real CareerOps user data.

### Build

```bash
cd desktop
npm run tauri:build
```

Release builds should ultimately be produced by the repository's release workflow on native macOS and Windows runners.

## Validation

Run the repository's current test scripts rather than relying on README examples as the source of truth. Typical checks include:

```bash
node test-all.mjs

cd dashboard
go test ./...

cd ../desktop
npm test
npm run build
npm run build:sidecar

cd src-tauri
cargo check
cargo test
```

Also run:

```bash
git diff --check
```

The exact supported commands may evolve with upstream CareerOps.

## Upstream updates

Upstream changes come from [santifer/career-ops](https://github.com/santifer/career-ops). They should be integrated through a compatibility/stabilization flow instead of replacing downstream-owned desktop files wholesale.

In particular:

- upstream domain logic should normally win;
- desktop UX and orchestration should remain downstream-owned;
- the root README is maintained for CareerOps Desktop;
- upstream documentation may be mirrored separately when needed;
- language, updater, packaging, and desktop contracts must be regression-tested after upstream syncs.

## License and attribution

This fork is based on [santifer/career-ops](https://github.com/santifer/career-ops) and retains the repository's existing license and attribution requirements. Original CareerOps design and upstream contributions belong to their respective authors and contributors.

Desktop-specific additions, integration work, and documentation in this fork are maintained separately. See [LICENSE](./LICENSE) and any upstream trademark or attribution files included in the repository.
