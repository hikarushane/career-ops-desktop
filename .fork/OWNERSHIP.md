# Fork Ownership

This repository is a downstream fork of [career-ops-hq/career-ops](https://github.com/career-ops-hq/career-ops) (formerly `santifer/career-ops`) that adds a native desktop application (CareerOps Desktop).

## Relationship

```
career-ops-hq/career-ops     (upstream — domain logic, CLI modes, scripts)
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

## Upstream files deliberately absent

The fork keeps only `README.md` (Traditional Chinese) and `README.en.md` at the root. These upstream files are removed on purpose and stay removed on every sync — resolve a modify/delete conflict on them by keeping the deletion:

- `README.*.md` — the 16 upstream translations (`update-system.mjs` `reconcileReadmeLayout` enforces the same layout after a CLI update)
- `tests/readme-i18n-drift.test.mjs` — asserts that 16-translation layout
