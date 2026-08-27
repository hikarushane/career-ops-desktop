# Branch Protection — Recommended Settings

Configure these on the fork's `main` branch in Settings → Branches → Branch protection rules.

## Required status checks

Enable "Require status checks to pass before merging" with these checks:

| Check | Workflow | Purpose |
|-------|----------|---------|
| `tests` | release-readiness.yml | Go, Node, TypeScript, Vitest, version consistency |
| `cargo-check` | release-readiness.yml | Rust compilation and tests |
| `package-macos` | release-readiness.yml | macOS DMG build (unsigned smoke) |
| `package-windows` | release-readiness.yml | Windows NSIS EXE build (unsigned smoke) |
| `updater-config` | release-readiness.yml | Updater endpoint and pubkey validation |

## Other settings

| Setting | Value | Reason |
|---------|-------|--------|
| Require a pull request before merging | Yes | All changes through PR |
| Require approvals | 1 (or 0 for solo maintainer) | Review gate |
| Dismiss stale reviews | Yes | Re-review after force push |
| Require branches to be up to date | Yes | Ensure CI ran on final merge state |
| Do not allow bypassing | No (allow admin bypass) | Maintainer escape hatch |
| Allow force pushes | No | Prevent history rewriting |
| Allow deletions | No | Protect the branch |

## Auto-merge

Enable in repo settings: Settings → General → Pull Requests → Allow auto-merge.

The upstream maintenance workflow enables auto-merge on clean sync PRs (no conflicts, no protected path changes, all checks pass). Manual PRs require explicit merge.

## Release tags

Tag protection rules: protect `desktop-v*` tags. Only the release workflow should create them.
