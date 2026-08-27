# Release Notes

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
