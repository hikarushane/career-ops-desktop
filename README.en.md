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

Download the latest DMG or `CareerOps-macOS-<version>.zip` from [GitHub Releases](https://github.com/hikarushane/career-ops-desktop/releases). Open the DMG, drag CareerOps into Applications, and launch it from Applications.

If you already use the configured Homebrew tap, the cask is an optional alternative installation method—not an onboarding or managed-runtime prerequisite:

```bash
brew install --cask <owner>/<tap>/career-ops
```

`<owner>/<tap>` must match the tap repository configured by the fork operator. For a repository named `homebrew-career-ops`, the tap token is normally `career-ops`. The release workflow computes the actual DMG SHA256 and publishes a versioned cask; it never uses `sha256 :no_check`.

### Windows

Download `CareerOps_<version>_Windows.exe` or `CareerOps-Windows-<version>.zip` from [GitHub Releases](https://github.com/hikarushane/career-ops-desktop/releases), then run the NSIS installer.

> Until signed public releases are available, macOS or Windows may show the operating system's standard warning for unsigned applications.

Every release also publishes `SHA256SUMS.txt`, `release-provenance.json`, signed updater archives, and `latest.json`. Verify downloads against the checksum manifest when installing outside the app.

## First launch

The installed app, your workspace, and your profile are deliberately separate things:

- **App installation** is the CareerOps Desktop application you download and update.
- **Workspace** is your private CareerOps folder: it holds your job-search files and can be backed up or opened independently of the app.
- **App technical state** is whether the installed package and its managed components are intact; it is not a second copy of your profile.
- **Background evidence** is the source material you add during import.
- **Canonical profile** is the reviewed CareerOps data that the app uses for your search.

On first launch, CareerOps offers a workspace in your operating system's normal Documents location:

| Platform | Default workspace |
| --- | --- |
| macOS | `~/Documents/CareerOps` |
| Windows | `Documents\CareerOps` |

You can choose a custom location instead, or select an existing CareerOps workspace. Existing `cv.md`, profile, tracker, reports, and output stay in that workspace.

1. Create the default workspace or choose a custom location.
2. Complete the profile prompts so evaluation uses your targets rather than shipped examples.
3. Open **Settings → AI Provider** and select an available local provider. Sign in through that provider's own CLI; the Desktop app does not store a provider password.
4. Use **Background Import** to add evidence and review any proposed profile changes.
5. Paste a job URL or run the scanner from Home.

### Manage the workspace

In **Settings → Workspace**, you will see:

```text
Workspace
<path>

Open Folder    Change Location
```

**Open Folder** opens the active workspace in your file manager. **Change Location** switches which workspace the app uses. It does not move the previous workspace or any of its files.

### Background Import and the canonical profile

Background Import accepts these evidence categories:

- CV / Resume
- Work records
- Publications / Research
- Degrees / Transcripts
- LinkedIn
- References
- Certificates
- Portfolio / Projects

Drag files in (or use **Add files**), check the category for each file, and continue. CareerOps copies the selected files to these exact workspace locations:

| Evidence category | Storage path |
| --- | --- |
| CV / Resume | `documents/cv/` |
| Work records | `documents/work/` |
| Publications / Research | `documents/research/` |
| Degrees / Transcripts | `documents/diplomas/` |
| LinkedIn | `documents/linkedin/` |
| References | `documents/references/` |
| Certificates | `documents/certificates/` |
| Portfolio / Projects | `documents/portfolio/` |

The onboarding flow then reviews all new or changed evidence in one consolidated intake session, creates source-annotated proposals, and shows any conflicts.

These files are **evidence**, not separate profile databases. The canonical profile remains the reviewed content in:

- `cv.md`
- `config/profile.yml`
- `modes/_profile.md`

Staging copies evidence only. **Apply selected changes** writes only the proposals you explicitly approve to the canonical files and records the completed intake. **Skip for now** discards the review session, leaves the staged documents in place, and commits neither intake fingerprints nor canonical-profile changes. PDFs are still staged, but this build cannot extract PDF text; add a `.md`, `.txt`, or `.tex` companion when you need its contents considered for profile extraction.

Background Import is part of onboarding in the current Desktop UI; it does not promise a separate post-onboarding import route.

Reviewed AI intake is supported in the current macOS release. On Windows and self-contained Linux packages, the reviewed-intake phase fails closed when secure provider isolation is unavailable: staged evidence remains untouched and no canonical profile files are changed. Updating to a supported package is the next step.

### App technical state

The packaged app includes its managed JavaScript runtime and required CareerOps assets. Normal Desktop use does not require installing Git, Homebrew, Node, npm, Rust, or Go. If the app reports missing packaged assets or its managed runtime, reinstall or update CareerOps Desktop; do not try to repair the installation with developer commands. This technical state is separate from the readiness and authentication of the AI provider you choose.

## Desktop updater

CareerOps Desktop checks the fork's signed Tauri update feed in the background. When an update is available, the header keeps the version badge visible until you choose **Later** or **Update Now**. Update installation is signature-verified and relaunches the app after the archive installs. A temporary network failure does not erase an update the app already found.

Release publishing fails closed until the fork repository, updater endpoint, public key, and signing credentials are configured. Apple notarization and Windows Authenticode are separate production credentials from Tauri updater signing.

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

### Advanced / CLI usage

The complete upstream CLI remains available for maintainers and users who prefer agent-driven workflows. From the repository root:

```bash
node doctor.mjs --json
node scan.mjs
node tracker.mjs
codex exec "Run career-ops pipeline mode for data/pipeline.md"
```

See the preserved [upstream README](./docs/upstream/README.md) for the full mode and CLI reference. CLI-only installations may still use `node update-system.mjs check`; normal Desktop users should use the in-app updater so they do not receive two update notification streams.

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
