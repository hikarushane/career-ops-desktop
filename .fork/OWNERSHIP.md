# Fork Ownership

This repository is a downstream fork of [santifer/career-ops](https://github.com/santifer/career-ops) that adds a native desktop application (CareerOps Desktop).

## Relationship

```
santifer/career-ops          (upstream — domain logic, CLI modes, scripts)
        ↓
fork repo                    (this repo — Desktop app, distribution, auto-updater)
```

## Ownership boundaries

- **Upstream owns**: scoring, tracker rules, scan logic, batch rules, interview business logic, modes, templates, pipeline scripts.
- **Fork owns**: `desktop/`, `.fork/`, `packaging/`, release workflows, updater, distribution, root `README.md` and `README.en.md`, `docs/upstream/`.

## Version identity

- **Upstream version**: `VERSION` file (e.g. `1.29.0`), managed by release-please.
- **Fork version**: `desktop/package.json` → `version` field, synchronized to `desktop/src-tauri/tauri.conf.json` and `desktop/src-tauri/Cargo.toml`.

## Update sources

- **Desktop app updates**: fork's own GitHub Releases (never upstream).
- **CareerOps core updates**: biweekly upstream sync via CI (see `.github/workflows/upstream-maintenance.yml`).
- **CLI/AI session updates**: `update-system.mjs` remains available for non-Desktop users.

## Upstream sync policy

See `.fork/protected-paths.json` for paths that must not be overwritten by upstream merges.
