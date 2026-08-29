# Task 8 Report — Packaged Workspace and Intake Runtime Dependencies

## Status

Implemented and verified from exact base
`d9377f16d608c57a725a329cfb50c05ab97c1e81`.

The installed-user developer-prerequisite contract is satisfied for app launch,
workspace create/stage/open/switch, the bundled `career-data` operations, and
the deterministic `intake.mjs` scan/commit route. The Desktop package now
contains:

- the generated workspace seed;
- the `career-data` Go sidecar;
- a managed JavaScript runtime staged from the release build's exact Node
  executable; and
- that runtime version's full Node.js license as a package resource.

Reviewed intake isolation is fully resolved for the current macOS release path.
It remains an explicit acceptance limitation on Windows and on a self-contained
Linux package. Those platforms continue to fail closed before the provider is
started or any canonical file is changed. No isolation or write allowlist was
weakened to make the package appear portable.

## Architecture and package proof

Tauri's documented sidecar contract requires each `externalBin` input to exist
at build time as `<name>-<target-triple>[.exe]`, while the installed executable
is exposed under the unsuffixed name. The build now stages both:

```text
binaries/career-data-<target-triple>[.exe]
binaries/careerops-node-<target-triple>[.exe]
```

The runtime resolver uses only the installed application executable directory:

```text
<installed executable directory>/careerops-node[.exe]
```

It never refers to `src-tauri/binaries`, the repository root, a user home, a
Homebrew prefix, or another source-checkout path. If the packaged runtime is
missing, the user is told to reinstall or update CareerOps Desktop; they are
not told to install Node or run a developer build.

`tauri.conf.json` release inputs are all package-local relative paths:

```text
resources:
  binaries/workspace-seed/ -> workspace-seed/
  binaries/node-LICENSE    -> licenses/Node.js-LICENSE.txt

externalBin:
  binaries/career-data
  binaries/careerops-node
```

Release regressions verify these inputs, reject absolute/parent/source-checkout
paths, and verify that the release script takes the runtime from
`process.execPath` rather than a developer-machine installation prefix.

The managed runtime is an unmodified official Node binary. The build retrieves
and validates the matching `v<process.versions.node>/LICENSE` document and
packages it. On the verification host the binary is a Node.js Foundation-signed
universal Mach-O whose dynamic dependencies are Apple system libraries only.
This is package-compatible for the macOS release architecture; it does not ask
the installed user for Homebrew, Node/npm, Xcode tools, or another runtime.

## Intake behavior

- Preview and apply receive `CAREEROPS_JS_RUNTIME` pointing to the packaged
  runtime. The provider prompt must use that path and explicitly forbids `node`
  from `PATH`.
- The trusted, post-confirmation selective commit uses the same resolved
  runtime directly for `intake.mjs --commit <validated paths>`.
- The semantic intake workflow remains upstream `intake.mjs` plus
  `modes/intake.md`; it was not reimplemented in React.
- Normal CLI intake retains its existing optional Poppler hint. Desktop sets
  `CAREEROPS_DESKTOP_PDF_EXTRACTION=unavailable`, so it never probes or invokes
  a host `pdftotext` and never suggests Homebrew/apt/Poppler.
- A PDF is still copied into the selected `documents/*` category. The UI then
  states that extraction is unavailable in this build and suggests an
  `.md`, `.txt`, or `.tex` companion for text extraction.
- Missing `career-data` or managed runtime assets now produce reinstall/update
  guidance, not `npm run build:sidecar` or other developer instructions.

## Security carryover from Task 6

The Task 6 trusted boundary remains load-bearing and unchanged in meaning:

- preview and apply run in a disposable, dereferenced workspace;
- canonical review fingerprints are verified before promotion;
- only `cv.md`, `config/profile.yml`, and `modes/_profile.md` can be promoted;
- selected proposal IDs/items and explicit merged-source paths are revalidated;
- provider process groups are quiesced before any promotion;
- post-confirmation commit is path-explicit and never forms `--commit --all`;
- rollback and recovery-artifact behavior remains intact.

The macOS provider still runs under `/usr/bin/sandbox-exec` with a deny-default
profile and the Task 6 write allowlist. Windows still returns
`INTAKE_ISOLATION_UNAVAILABLE`. Linux still requires `bwrap`; absence returns a
package-limitation error with “No files were changed.” There is no unsandboxed
fallback.

## Supported-platform matrix

| Platform | Launch/workspace/deterministic operations | Packaged `.mjs` runtime | Reviewed intake isolation | PDF behavior | Acceptance |
|---|---|---|---|---|---|
| macOS | Bundled Rust app + `career-data`; no developer tools | Bundled `careerops-node` | Built-in `/usr/bin/sandbox-exec`, fail closed on setup error | Stages; extraction explicitly unavailable | Satisfied for current release architecture |
| Windows | Bundled Rust app + `career-data`; no developer tools | Bundled `careerops-node.exe` | No supported package-local restricted-token/AppContainer implementation exists in this branch; fails closed before provider start | Stages; extraction explicitly unavailable | **Unresolved acceptance failure for reviewed intake** |
| Linux | Code paths for bundled app/data/runtime; no current Linux release job | Build can stage `careerops-node` | External `bwrap` from `PATH`; missing runtime fails closed | Stages; extraction explicitly unavailable | **Unresolved acceptance failure for a self-contained package** |

### Precise isolation limitation

No Windows filesystem sandbox equivalent to the macOS Seatbelt profile is
implemented in the release architecture. Shipping a token/AppContainer helper
would require a separate designed and reviewed boundary, not a command-line
substitution.

Linux `bwrap` was not silently added to `externalBin`. A defensible bundle would
need a supported Linux release target, kernel/user-namespace compatibility,
portable runtime dependencies, and complete GPL redistribution/source-offer
handling. None is established by the current release architecture. Therefore
the existing external `bwrap` branch remains fail-closed and is reported as a
limitation, not claimed as installed-user support.

## Runtime command/spawn audit

Audit command required by the brief:

```text
rg -n "Command::new|execFile|spawn|node |npm |npx |pdftotext|git " \
  desktop/src-tauri desktop/src desktop/scripts
```

Every match is classified below. Line numbers are those at final verification.

| Match(es) | Classification | Finding |
|---|---|---|
| `desktop/scripts/build-sidecar.mjs:3,17,39` | build-time only | Imports child-process helpers, asks build-host `rustc` for its target triple, and compiles the Go sidecar. These run in release/dev build, never in the installed app. |
| `desktop/src-tauri/src/sidecar.rs:1` | bundled runtime | Comment match only. The separately audited `.sidecar("career-data")` call at line 15 invokes the packaged external binary. |
| `desktop/src-tauri/src/runner.rs:109` | bundled runtime | Prompt text requires `CAREEROPS_JS_RUNTIME` and explicitly rejects Node from `PATH`. |
| `runner.rs:1335` | bundled runtime | Trusted selective commit invokes the resolved packaged JS executable. |
| `runner.rs:1603` | bundled/OS runtime | macOS built-in `/usr/bin/sandbox-exec`; no user install or developer tool. |
| `runner.rs:1636` | accidental external runtime dependency, fail-closed limitation | Linux `bwrap` remains external. Missing `bwrap` stops reviewed intake before provider start; no install prompt or fallback. |
| `runner.rs:1888,1899,1902` | external AI Provider | Constructs and spawns the user-selected provider; the error string reports a secure spawn failure. Reviewed intake reaches this only after isolation construction succeeds. |
| `runner.rs:1917,1934,1952` | bundled runtime | Rust in-process reader/wait threads; these are not external commands. |
| `runner.rs:2063` | bundled/OS runtime | Existing Unix `kill` cancellation command for an external AI task. It is not a developer prerequisite and is outside deterministic workspace operations. |
| `runner.rs:2172,2195,2744,2747,2750` | build/test-time only | Rust test fixtures use host Node/fake provider processes and a negative prompt assertion. They are behind `#[cfg(test)]` and absent from release runtime. |
| `desktop/src/lib/release-pipeline.test.ts:2,126,140,171,175,230` | build/test-time only | Release tests spawn fixture seed commands or inspect command text. |
| `desktop/src-tauri/tauri.conf.json:7,9` | build-time only | Tauri `beforeDevCommand`/`beforeBuildCommand` npm hooks; neither is executed by an installed app. |
| `desktop/src/lib/pre-push.test.ts:2,19,23,62,87,98,122,131,132` | build/test-time only | Hermetic Git/pre-push release test fixtures. |
| `desktop/src/lib/release-prepare.test.ts:2,37-41,47,57,59` | build/test-time only | Temporary Git repositories and release-prepare tests. |
| `desktop/src/lib/release-workflows.test.ts:2,35-44,110-123` | build/test-time only | Temporary Git repositories and static CI workflow assertions, including npm/npx strings. |
| `AnalysisLanguageField.test.ts:50-51`; `WorkspaceSettings.test.ts:73,75`; `BackgroundImport.test.ts:48-50,61-62`; `WorkspaceSetup.test.ts:90,92`; `IntakeReview.test.ts:104-105,114-116`; `Onboarding.test.ts:41-43,54-55` | build/test-time false positives | Local React test variable named `node`; no executable or subprocess. |

Additional spawn API audit beyond the required regex:

- `desktop/src-tauri/src/sidecar.rs:15` calls Tauri
  `.sidecar("career-data")`: **bundled runtime**.
- No production Desktop path invokes Git, Homebrew, npm/npx, Cargo/Rust, Go, or
  Xcode tools for launch, workspace creation, staging, folder opening,
  workspace switching, or deterministic non-AI data operations.

The only unresolved installed-user command dependency in reviewed intake is
Linux `bwrap`, and it is explicitly fail-closed and recorded above.

## TDD evidence

Initial focused RED runs failed as intended:

```text
cd desktop
npm test -- --run src/lib/release-pipeline.test.ts src/screens/BackgroundImport.test.ts
→ 3 failures: managed runtime/license package inputs and PDF capability UI absent

cd desktop/src-tauri
cargo test packaged_runtime...
→ compile failure: packaged runtime resolver did not exist

node test-all.mjs --only intake.test.mjs
→ 24 passed, 1 failed: Desktop mode still probed host pdftotext
```

After the minimal runtime/resource, resolver, and PDF capability changes:

```text
npm test -- --run src/lib/release-pipeline.test.ts src/screens/BackgroundImport.test.ts
→ 2 files, 53 tests passed

cargo test unsupported_isolation_error_is_explicit_retryable_and_fail_closed
cargo test packaged_runtime_resolves_beside_the_installed_application
→ 1 passed each

node test-all.mjs --only intake.test.mjs
→ 25 passed, 0 failed
```

## Final verification

Actual release regression tests:

```text
cd desktop
npm test -- --run \
  src/lib/pre-push.test.ts \
  src/lib/release-pipeline.test.ts \
  src/lib/release-prepare.test.ts \
  src/lib/release-workflows.test.ts
→ 4 files, 65 tests passed
```

Required component commands:

```text
cd desktop
npm test
→ 17 files, 164 tests passed

npm run build
→ passed; 925 modules transformed
→ existing non-failing >500 kB Vite chunk advisory remains

npm run build:sidecar
→ workspace seed: 527 files
→ career-data-aarch64-apple-darwin staged
→ careerops-node-aarch64-apple-darwin staged (v26.3.0)

env PATH=/nonexistent CAREEROPS_DESKTOP_PDF_EXTRACTION=unavailable \
  desktop/src-tauri/binaries/careerops-node-aarch64-apple-darwin \
  desktop/src-tauri/binaries/workspace-seed/intake.mjs --self-test
→ 19 passed, 0 failed

env PATH=/nonexistent \
  desktop/src-tauri/binaries/careerops-node-aarch64-apple-darwin --version
→ v26.3.0

cd src-tauri
cargo check
→ passed

cargo test
→ 51 passed, 0 failed

cargo fmt --check
→ passed

git diff --check
→ passed
```

Integrated release entrypoint:

```text
node scripts/release/readiness.mjs --skip-package
→ root suite: 5700 passed, 0 failed, 6 pre-existing fixture/data warnings
→ Go suite: passed
→ Desktop production build: passed
→ Desktop Vitest: 164 passed
→ workspace seed + career-data + managed JS runtime staging: passed
→ cargo check --locked: passed
→ cargo test --locked: 51 passed
→ version consistency: 0.4.0 across all release metadata
→ release metadata validation: passed
→ git diff --check: passed
```

Native DMG/NSIS packaging was deliberately not run locally. The integrated
entrypoint used `--skip-package`; native package construction remains the Task
10/CI platform job. Task 8 verifies its package inputs and runtime placement
contract, and both existing macOS and Windows package jobs run
`npm run build:sidecar` before Tauri builds.

## Files changed

- `desktop/scripts/build-sidecar.mjs`
- `desktop/scripts/sidecar-naming.d.mts`
- `desktop/scripts/sidecar-naming.mjs`
- `desktop/src-tauri/src/runner.rs`
- `desktop/src-tauri/src/sidecar.rs`
- `desktop/src-tauri/tauri.conf.json`
- `desktop/src/components/ReportPane.tsx`
- `desktop/src/lib/release-pipeline.test.ts`
- `desktop/src/screens/BackgroundImport.test.ts`
- `desktop/src/screens/BackgroundImport.tsx`
- `desktop/src/screens/Help.tsx`
- `intake.mjs`
- `tests/intake.test.mjs`
- `.superpowers/sdd/Desktop Workspace Bootstrap & Background Intake Implementation Plan/task-8-report.md`

No README, localized README, release documentation, user-layer profile data,
protected branch, workflow, or unrelated release infrastructure was edited.

## README consistency gate / Task 9 follow-up

Task 9 should synchronize the README languages to say:

- Desktop uses its bundled managed JavaScript runtime; users do not install
  Node/npm for intake;
- missing packaged services are repaired by reinstall/update, not by running
  maintainer build commands; and
- PDFs remain staged when extraction is unavailable, with no Homebrew/Poppler
  requirement.

This report records the needed documentation change, but Task 8 intentionally
does not edit README or release docs.

## Commit

`test(release): guard workspace runtime dependencies`

This is the single commit containing the implementation, tests, and this
report.
