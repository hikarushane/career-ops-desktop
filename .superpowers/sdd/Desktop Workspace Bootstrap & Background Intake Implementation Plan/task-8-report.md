# Task 8 Report — Packaged Workspace and Intake Runtime Dependencies

## Status

Fix round 1 is implemented from clean base `c831c0a`, the original Task 8
commit based on `d9377f16d608c57a725a329cfb50c05ab97c1e81`.

The macOS release architecture now has direct generated-input, installed-app,
post-sign, and mounted-DMG proof for its managed JavaScript runtime. Installed
users do not need Git, Homebrew, Node/npm, Rust/Cargo, Go, or Xcode tools for
app launch, workspace creation/staging/open/switch, or deterministic Desktop
operations exercised here.

Reviewed intake remains deliberately fail-closed on Windows and on Linux
without external `bwrap`. Those are unresolved acceptance limitations; this
change does not weaken pre-confirmation isolation or the canonical write
allowlist to make either platform appear complete.

## Correction to the original report

The original report incorrectly called the build-host `process.execPath`
runtime an unmodified, package-compatible macOS external binary. Tauri copies
every `externalBin` into `Contents/MacOS` and includes it in the app signing
set. Re-signing official Node stripped its V8/JIT entitlements and changed the
signature page size from 4096 to 16384 on this host. The re-signed runtime then
exited 133 during ordinary execution.

That prior macOS acceptance claim was false and is superseded here. Node is no
longer an `externalBin`, and no permissive entitlement was added to the app.

## Runtime and signing architecture

### Exact official runtime

`desktop/scripts/node-runtime.json` pins Node.js `22.23.2` and official target
archives instead of the build host's mutable `process.execPath`:

| Rust target | Official archive | SHA-256 |
|---|---|---|
| `aarch64-apple-darwin` | `node-v22.23.2-darwin-arm64.tar.gz` | `61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6` |
| `x86_64-apple-darwin` | `node-v22.23.2-darwin-x64.tar.gz` | `58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026` |
| `aarch64-unknown-linux-gnu` | `node-v22.23.2-linux-arm64.tar.gz` | `013b59cfd2819703a6f4a14ab891fc46fc2a4e3f5bcd92de3fb4929b43e35b30` |
| `x86_64-unknown-linux-gnu` | `node-v22.23.2-linux-x64.tar.gz` | `b294a556e639d64338823920e5866c21c02741742d2e1529ee1a225c1ec9252a` |
| `aarch64-pc-windows-msvc` | `node-v22.23.2-win-arm64.zip` | `fec025a6da31757e3b6af84c5a1628e9d38442ca99a2161091d78f2fcfa35ef3` |
| `x86_64-pc-windows-msvc` | `node-v22.23.2-win-x64.zip` | `1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97` |

`LICENSE` is extracted from that same verified archive. Its required SHA-256
is `c738ae413cf561f174e34f6961f8ca458aae2369a73640dda6234c629b98bcc4`.
There is no independent mutable license fetch.

The downloader is bounded to 128 MiB and 120 seconds, uses only the exact
versioned Node distribution URL, verifies the target archive hash before
extraction, validates archive-relative members, and records target,
architecture, archive, runtime, and license hashes. A verified cache permits
later offline builds. A first offline build without the cache fails explicitly
and never falls back to a host runtime.

Official evidence used:

- [Node.js v22.23.2 official checksums](https://nodejs.org/dist/v22.23.2/SHASUMS256.txt)
- [Node.js `--jitless` documentation](https://nodejs.org/download/release/v22.23.2/docs/api/cli.html#--jitless)
- [Tauri sidecar documentation](https://v2.tauri.app/develop/sidecar/)
- [Tauri platform configuration overrides](https://v2.tauri.app/develop/configuration-files/)

### Resource plus launcher

Official Node is now a Tauri resource:

```text
macOS:  Contents/Resources/runtime/careerops-node-runtime
Windows: <install>/runtime/careerops-node-runtime.exe
```

Resources are sealed by the app/package but are not part of Tauri's
external-binary re-signing set. macOS therefore preserves the official Node.js
Foundation signature and its 4096-byte page size.

`careerops-node` is a small Go `externalBin` launcher. It resolves only the
package resource layout, removes conflicting JIT-less overrides, replaces
inherited `NODE_OPTIONS`, and starts the pinned runtime with `--jitless`. It
preserves stdio and child exit status. A missing runtime gives reinstall/update
guidance.

The JIT-less probe proves `eval("1+1") == 2`,
`new Function("return 3")() == 3`, and `typeof WebAssembly == "undefined"`.
`intake.mjs` does not use WebAssembly and its packaged self-test passes. The
expected V8 warning about disabling WebAssembly is diagnostic stderr only.

### Deterministic sidecar operations

The expanded spawn audit found that `career-data` previously called bare
`node` for `profile-language.mjs` and `job-language.mjs`. It now resolves the
colocated installed launcher and canonical scripts in the packaged workspace
seed by absolute path, while keeping the selected user workspace as `cwd`.
That works for existing workspaces without copying dependencies into them.
Successful runtime stderr is kept separate from JSON stdout, so the JIT-less
warning cannot corrupt data.

The seed includes exact lockfile-resolved runtime packages and licenses:

```text
node_modules/js-yaml@5.4.1
node_modules/argparse@2.0.1
```

Native release jobs run root `npm ci --ignore-scripts` at build time. The seed
builder rejects a missing, differently versioned, or unlicensed input. The
installed user never runs npm.

## Generated and installed verification

`desktop/scripts/verify-packaged-runtime.mjs` performs executable checks, not
source assertions alone. Its generated/app/installed modes verify:

- exact manifest/metadata target, archive, architecture, and hashes;
- exact license checksum and target/runtime correspondence;
- runtime/launcher existence and Unix executable bits;
- Mach-O, ELF, or PE architecture where inspectable;
- runtime SHA and exact `v22.23.2` execution;
- launcher-enforced JIT-less compatibility;
- installed workspace seed and `intake.mjs --self-test`;
- deterministic `career-data language-settings` against a temporary existing
  workspace with no scripts or `node_modules`, using an unusable `PATH`;
- macOS Node.js Foundation signature and `Page size=4096`;
- deep/strict app signature in signed-app mode.

macOS readiness builds app and DMG, ad-hoc re-signs the app executables and app
with hardened runtime, runs the strict post-sign verifier, mounts the actual
DMG read-only, and repeats the installed-layout smoke. Production release runs
the strict verifier after `tauri-action` performs Developer ID signing and
notarization.

Windows readiness/release verify generated inputs, build NSIS, silently install
to a temporary directory, run the installed verifier, and require a valid
`Node.js Foundation` Authenticode signature. These Windows jobs could not run
on this macOS host, so Windows success is CI-enforced but **not claimed as
locally executed**.

### Actual macOS artifact evidence

On macOS 26.5.1 arm64 with Xcode 26.5:

1. Built a real Tauri `CareerOps.app` with the platform resource override.
2. Re-signed all `Contents/MacOS` executables and the app with hardened runtime
   and 4096-byte signing page size.
3. Passed `codesign --verify --deep --strict` on the post-sign app.
4. Verified Node still reported Node.js Foundation authority and page size 4096.
5. Executed launcher compatibility, packaged intake self-test, and deterministic
   `career-data language-settings` without Node on `PATH`.
6. Built and mounted the actual Tauri DMG read-only and repeated runtime,
   license, architecture, launcher, intake, and language smokes from it.

The readiness DMG is intentionally unsigned, so mounted-DMG mode does not claim
an app signature. Production CI uses strict verification on the signed app.
All local runtime executions passed.

## Missing `career-data` behavior

Tauri sidecar construction failure and asynchronous `.output()` spawn failure
now share this mapping:

```text
CareerOps data service failed to start: ... Reinstall or update CareerOps Desktop.
```

The regression creates an actually missing executable with
`std::process::Command`, captures its spawn error, and verifies reinstall/update
guidance with no npm/build instruction.

## PDF and security carryover

- PDFs still stage; extraction is clearly unavailable without a bundled
  extractor, with no Homebrew/apt/Poppler prompt.
- Semantic intake remains upstream `intake.mjs` plus `modes/intake.md`, not React.
- Preview/apply retain the disposable dereferenced workspace.
- Review fingerprints remain verified before promotion.
- The write allowlist remains exactly `cv.md`, `config/profile.yml`, and
  `modes/_profile.md`.
- Selection/source validation, provider quiescence, exact-path commit, rollback,
  and recovery artifacts remain intact.
- macOS retains deny-default `/usr/bin/sandbox-exec` isolation.
- Windows returns `INTAKE_ISOLATION_UNAVAILABLE` before provider start.
- Linux refuses reviewed intake without `bwrap`; there is no fallback.

## Platform matrix

| Platform | Launch/workspace/deterministic operations | Managed `.mjs` runtime | Reviewed intake isolation | PDF | Acceptance |
|---|---|---|---|---|---|
| macOS | Bundled app, seed, data service, runtime and JS packages; installed/package smoke passed without developer PATH tools | Pinned official Node resource via JIT-less launcher; post-sign and DMG smoke passed | Built-in Seatbelt profile; security regressions pass | Stages; extraction unavailable | **Satisfied for current release path** |
| Windows | NSIS workflow checks exact inputs, installed paths, execution and Authenticode; not run locally | Pinned official Node resource via `.exe` launcher | No package-local restricted-token/AppContainer boundary; fails closed | Stages; extraction unavailable | Package proof awaits native CI; **reviewed intake unresolved** |
| Linux | No supported native Desktop release job/config exists | Linux archives are pinned, but no package is claimed | External PATH `bwrap`; absence fails closed | Code path stages; extraction unavailable | **Self-contained/supported package unresolved** |

No defensible Windows sandbox or self-contained Linux isolation runtime was
established. A Windows token/AppContainer helper needs separate design/review.
Bundled `bwrap` needs a supported target, kernel/user-namespace compatibility,
portable dependencies, and redistribution/source-offer review. The limitation
is reported instead of weakening isolation.

## Runtime command/spawn audit

Required audit:

```text
rg -n "Command::new|execFile|spawn|node |npm |npx |pdftotext|git " \
  desktop/src-tauri desktop/src desktop/scripts
```

It produced 103 matches. A supplemental Go audit covered both sidecars.

| Match/group | Classification | Finding |
|---|---|---|
| `build-sidecar.mjs`: `rustc`, Go builds, `tar`, runtime/launcher probes | build-time only | Release/dev build machinery; absent after install. |
| `verify-packaged-runtime.mjs`: executables and `codesign` | build/test-time only | Artifact release gate; not an installed dependency. |
| Tauri npm hooks; workflow/test npm/npx/Git/Bash commands | build/test-time only | Maintainer CI and hermetic test fixtures. |
| `careerops-node/main.go:64` | bundled runtime | Absolute package resource execution with forced JIT-less settings. |
| `career-data/language.go` | bundled runtime | Absolute colocated packaged launcher; former bare `node` removed. |
| `career-data/providers.go:79` | external AI Provider | Detects/version-checks user-selected AI CLIs, not deterministic operations. |
| `sidecar.rs` `.sidecar("career-data")`/`.output()` | bundled runtime | Tauri packaged sidecar with reinstall/update missing-file handling. |
| `runner.rs:1335` trusted commit | bundled runtime | Verified launcher plus package resource directory. |
| `runner.rs:1628` `/usr/bin/sandbox-exec` | bundled OS runtime | macOS built-in isolation, not a developer tool. |
| `runner.rs:1662` Linux `bwrap` | external runtime, fail-closed limitation | Missing runtime stops before provider/canonical writes. |
| `runner.rs:1915,1926` provider command/spawn | external AI Provider | Starts selected provider only after isolation construction. |
| `runner.rs:1944,1961,1979` thread spawns | bundled runtime | In-process threads, no external executable. |
| `runner.rs:2090` `kill` | bundled OS runtime/provider control | Existing Unix AI-task cancellation, not deterministic workspace work. |
| Rust/Go/TS fixtures using Node, Git, Bash, fake commands or spawn | build/test-time only | Test-only code absent from release execution. |
| React local variable `node`; prompt/assertion/comment strings | text-only false positive | No subprocess. |

No accidental installed-user Git/Homebrew/Node/npm/Rust/Go/Xcode dependency
remains in supported macOS/Windows deterministic Desktop paths. Linux `bwrap`
is the sole external isolation dependency and remains fail-closed/unresolved.

## TDD evidence

Focused RED evidence preceded each implementation:

```text
release-pipeline.test.ts
→ 3 failures: platform resources, pinned manifest, verifier absent

go test ./cmd/careerops-node
→ packagedRuntimePath/runtimeArgs undefined

cargo test ...missing_sidecar...
→ data_service_spawn_error undefined

release-workflows.test.ts
→ generated/installed smoke commands absent

go test ./cmd/career-data
→ managedNodePath undefined

go test ./cmd/career-data -run TestNodeJSONResult
→ nodeJSONResult undefined

release-pipeline.test.ts workspace seed
→ licensed js-yaml/argparse inputs absent
```

The first mounted-DMG run also failed because isolated `js-yaml` was absent.
After pinning both lockfile packages, the same artifact test passed.

## Verification results

```text
cd desktop
npm test -- --run src/lib/pre-push.test.ts src/lib/release-pipeline.test.ts \
  src/lib/release-prepare.test.ts src/lib/release-workflows.test.ts
→ 4 files, 67 tests passed

npm test
→ 17 files, 166 tests passed

npm run build
→ passed; 925 modules transformed
→ existing non-failing >500 kB advisory remains

npm run build:sidecar
→ workspace seed: 547 files
→ Node v22.23.2 runtime/license/metadata, career-data and launcher staged/probed

node scripts/verify-packaged-runtime.mjs --generated
→ passed for aarch64-apple-darwin

cd ../dashboard && go test ./...
→ passed

cd ../desktop/src-tauri
cargo check --locked
→ passed
cargo test --locked
→ 52 passed
cargo fmt --check
→ passed
git diff --check
→ passed
```

Native artifacts:

```text
npx tauri build --ci --bundles app --config src-tauri/tauri.unsigned.conf.json
codesign --force --sign - --options runtime --pagesize 4096 <executables/app>
node scripts/verify-packaged-runtime.mjs --app CareerOps.app
→ passed after signing

npx tauri build --ci --bundles dmg --config src-tauri/tauri.unsigned.conf.json
hdiutil attach ... -readonly
node scripts/verify-packaged-runtime.mjs --app <mount>/CareerOps.app --allow-unsigned-app
→ passed from mounted Tauri DMG
```

Integrated readiness:

```text
node scripts/release/readiness.mjs --skip-package
→ root: 5699 passed, 1 failed, 6 warnings
→ sole failure: already tracked task-8-report.md is not registered in
  update-system.mjs SYSTEM_PATHS/USER_PATHS

node scripts/release/readiness.mjs --skip-root-tests --skip-package
→ Go, Desktop build, 166 Vitest tests, sidecar/runtime verifier, Cargo check,
  52 Cargo tests, version consistency, metadata, and diff check passed
```

The updater coverage failure is reported, not suppressed. Registering the SDD
report in product updater policy would broaden Task 8 and was not done.

## Files changed in fix round 1

- `.github/workflows/desktop-release.yml`
- `.github/workflows/release-readiness.yml`
- `dashboard/cmd/career-data/language.go`
- `dashboard/cmd/career-data/language_test.go`
- `dashboard/cmd/careerops-node/main.go`
- `dashboard/cmd/careerops-node/main_test.go`
- `desktop/scripts/build-sidecar.mjs`
- `desktop/scripts/node-runtime.json`
- `desktop/scripts/verify-packaged-runtime.mjs`
- `desktop/scripts/workspace-seed.mjs`
- `desktop/src-tauri/src/runner.rs`
- `desktop/src-tauri/src/sidecar.rs`
- `desktop/src-tauri/tauri.conf.json`
- `desktop/src-tauri/tauri.macos.conf.json`
- `desktop/src-tauri/tauri.windows.conf.json`
- `desktop/src/lib/release-pipeline.test.ts`
- `desktop/src/lib/release-workflows.test.ts`
- `scripts/release/readiness.mjs`
- `.superpowers/sdd/Desktop Workspace Bootstrap & Background Intake Implementation Plan/task-8-report.md`

No README/localized README, product docs, user data, protected branch, or
unrelated updater behavior was changed.

## README consistency gate / Task 9 follow-up

Task 9 still needs the identified README synchronization: Desktop uses bundled
managed JavaScript/runtime dependencies; missing assets are repaired by
reinstall/update rather than installing Node/npm; PDFs stage when extraction is
unavailable. Task 8 intentionally does not edit those docs.

## Commit

Focused fix commit message:

```text
fix(release): preserve signed managed runtime
```
