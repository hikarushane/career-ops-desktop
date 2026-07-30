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
