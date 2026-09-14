import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { finalizeArtifacts } from '../../../scripts/release/artifacts.mjs';
import { protectedChanges } from '../../../scripts/release/protected-paths.mjs';
import { nonEmptyArtifacts } from '../../../scripts/release/release-lib.mjs';

const ROOT = resolve(__dirname, '../../..');
const temporary: string[] = [];

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function temp(prefix: string) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporary.push(path);
  return path;
}

function write(root: string, path: string, body: string | Buffer) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body);
}

describe('protected infrastructure range gate', () => {
  it('detects committed protected changes from BASE_SHA through HEAD', () => {
    const repo = temp('career-ops-protected-');
    write(repo, '.fork/protected-paths.json', '{"protected":["README.md","scripts/release/"]}\n');
    write(repo, 'README.md', 'base\n');
    write(repo, 'src.txt', 'base\n');
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'Gate Test'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'gate@example.invalid'], { cwd: repo });
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'base'], { cwd: repo });
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    write(repo, 'README.md', 'changed\n');
    write(repo, 'src.txt', 'changed\n');
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'change'], { cwd: repo });
    expect(protectedChanges(repo, base)).toEqual(['README.md']);
  });
});

describe('release artifact finalization', () => {
  it('accepts only non-empty artifacts with the requested suffix', () => {
    const root = temp('career-ops-non-empty-artifacts-');
    write(root, 'valid.dmg', 'disk-image');
    write(root, 'empty.dmg', '');
    write(root, 'other.zip', 'archive');
    expect(nonEmptyArtifacts(root, '.dmg')).toEqual([{ name: 'valid.dmg', size: 10 }]);
  });

  it('creates ZIPs before a complete checksum manifest and emits provenance', () => {
    const root = temp('career-ops-artifacts-');
    const assets = join(root, 'assets');
    mkdirSync(assets);
    write(root, 'RELEASE_NOTES.md', '# Release Notes\n\n## v1.2.3\n\nReady.\n');
    for (const name of [
      'CareerOps_1.2.3_macOS.dmg',
      'CareerOps_1.2.3_Windows.exe',
      'CareerOps_1.2.3_macOS.app.tar.gz',
    ]) write(assets, name, `artifact:${name}`);
    write(assets, 'CareerOps_1.2.3_macOS.app.tar.gz.sig', 'mac-signature');
    // Tauri 2's v2 updater format reuses the NSIS installer itself, so the
    // Windows updater signature sits next to the .exe; no .nsis.zip is built.
    write(assets, 'CareerOps_1.2.3_Windows.exe.sig', 'win-signature');
    write(assets, 'macos-target.json', '{"platform":"darwin-aarch64"}\n');
    write(assets, 'windows-target.json', '{"platform":"windows-x86_64"}\n');

    finalizeArtifacts({
      root,
      assetsDir: assets,
      version: '1.2.3',
      repository: 'acme/career-ops',
      gitSha: 'b'.repeat(40),
      upstreamSha: 'a'.repeat(40),
    });

    const sums = readFileSync(join(assets, 'SHA256SUMS.txt'), 'utf8');
    for (const name of [
      'CareerOps_1.2.3_macOS.dmg',
      'CareerOps_1.2.3_Windows.exe',
      'CareerOps-macOS-1.2.3.zip',
      'CareerOps-Windows-1.2.3.zip',
      'CareerOps_1.2.3_macOS.app.tar.gz',
      'latest.json',
      'release-provenance.json',
    ]) expect(sums).toContain(name);
    expect(sums).not.toContain('.nsis.zip');
    // The Windows updater downloads the installer itself, so latest.json has to
    // point at the .exe -- a url naming an archive nobody builds is a silently
    // broken updater, not a failed release.
    const latest = JSON.parse(readFileSync(join(assets, 'latest.json'), 'utf8'));
    expect(latest.platforms['windows-x86_64']).toEqual({
      signature: 'win-signature',
      url: 'https://github.com/acme/career-ops/releases/download/desktop-v1.2.3/CareerOps_1.2.3_Windows.exe',
    });
    expect(JSON.parse(readFileSync(join(assets, 'release-provenance.json'), 'utf8'))).toEqual({
      version: '1.2.3',
      gitSha: 'b'.repeat(40),
      upstreamSha: 'a'.repeat(40),
      buildPlatforms: ['darwin-aarch64', 'windows-x86_64'],
    });
  });
});

describe('macOS-only release finalization', () => {
  function macAssets(root: string) {
    const assets = join(root, 'assets');
    mkdirSync(assets);
    write(root, 'RELEASE_NOTES.md', '# Release Notes\n\n## v1.2.3\n\nReady.\n');
    write(assets, 'CareerOps_1.2.3_macOS.dmg', 'dmg');
    write(assets, 'CareerOps_1.2.3_macOS.app.tar.gz', 'archive');
    write(assets, 'CareerOps_1.2.3_macOS.app.tar.gz.sig', 'mac-signature');
    write(assets, 'macos-target.json', '{"platform":"darwin-aarch64"}\n');
    return assets;
  }
  const args = { version: '1.2.3', repository: 'acme/career-ops', gitSha: 'b'.repeat(40), upstreamSha: 'a'.repeat(40) };

  it('publishes the macOS set alone when no Windows artifacts were built', () => {
    const root = temp('career-ops-mac-only-');
    const assets = macAssets(root);
    const files = finalizeArtifacts({ root, assetsDir: assets, ...args });
    expect(files).toEqual([
      'CareerOps_1.2.3_macOS.dmg', 'CareerOps_1.2.3_macOS.app.tar.gz', 'CareerOps-macOS-1.2.3.zip',
      'latest.json', 'release-provenance.json',
    ]);
    const sums = readFileSync(join(assets, 'SHA256SUMS.txt'), 'utf8');
    expect(sums).not.toContain('Windows');
    const latest = JSON.parse(readFileSync(join(assets, 'latest.json'), 'utf8'));
    expect(Object.keys(latest.platforms)).toEqual(['darwin-aarch64']);
    expect(JSON.parse(readFileSync(join(assets, 'release-provenance.json'), 'utf8')).buildPlatforms).toEqual(['darwin-aarch64']);
    expect(existsSync(join(assets, 'CareerOps-Windows-1.2.3.zip'))).toBe(false);
  });

  it('refuses a partial Windows set instead of silently dropping it', () => {
    const root = temp('career-ops-partial-win-');
    const assets = macAssets(root);
    write(assets, 'CareerOps_1.2.3_Windows.exe', 'exe');
    expect(() => finalizeArtifacts({ root, assetsDir: assets, ...args })).toThrow(/incomplete Windows release artifacts/);
  });

  it('still requires the macOS set', () => {
    const root = temp('career-ops-no-mac-');
    const assets = join(root, 'assets');
    mkdirSync(assets);
    write(root, 'RELEASE_NOTES.md', '# Release Notes\n\n## v1.2.3\n\nReady.\n');
    expect(() => finalizeArtifacts({ root, assetsDir: assets, ...args })).toThrow(/required release artifact missing: CareerOps_1.2.3_macOS.dmg/);
  });
});

describe('workflow enforcement', () => {
  const readiness = readFileSync(join(ROOT, '.github/workflows/release-readiness.yml'), 'utf8');
  const maintenance = readFileSync(join(ROOT, '.github/workflows/upstream-maintenance.yml'), 'utf8');
  const release = readFileSync(join(ROOT, '.github/workflows/desktop-release.yml'), 'utf8');

  it('does not suppress critical failures', () => {
    expect(readiness).not.toContain('|| true');
    expect(maintenance).not.toContain('git diff --check || true');
    expect(readiness).toContain('node test-all.mjs');
    expect(maintenance).toContain('scripts/release/readiness.mjs --skip-package');
  });

  it('records BASE_SHA and checks the full committed range', () => {
    expect(maintenance).toContain('BASE_SHA=$(git rev-parse HEAD)');
    expect(maintenance).toContain('protected-paths.mjs --base "$BASE_SHA" --head HEAD');
    expect(maintenance).not.toContain("git diff --name-only HEAD'");
  });

  it('installs real dependencies and builds the sidecar before Cargo', () => {
    expect(readiness).toContain('npm install --ignore-scripts');
    expect(readiness).toContain('npm ci');
    expect(readiness.indexOf('Build sidecar before Cargo')).toBeLessThan(readiness.indexOf('Cargo check'));
  });

  it('executes generated and installed runtime smoke checks on release platforms', () => {
    expect(readiness).toContain('verify-packaged-runtime.mjs --generated');
    expect(readiness).toContain('verify-packaged-runtime.mjs --app');
    expect(readiness).toContain('verify-packaged-runtime.mjs --install-dir');
    expect(readiness).toContain('Get-AuthenticodeSignature');
    expect(release).toContain('verify-packaged-runtime.mjs --app');
    expect(release).toContain('verify-packaged-runtime.mjs --install-dir');
    expect(release).toContain('Get-AuthenticodeSignature');
  });

  it('uses the verified action major convention and job-scoped write permission', () => {
    expect(release).toContain('actions/checkout@v7');
    expect(release).toContain('actions/setup-node@v7');
    expect(release).toContain('actions/setup-go@v7');
    expect(release).toContain('actions/upload-artifact@v7');
    expect(release).toContain('actions/download-artifact@v8');
    expect(release).toContain('tauri-apps/tauri-action@v1');
    expect(release).toMatch(/permissions:\n  contents: read/);
    expect(release).toMatch(/publish-release:[\s\S]*?permissions:\n      contents: write/);
  });
});

describe('Windows release signing', () => {
  const release = readFileSync(join(ROOT, '.github/workflows/desktop-release.yml'), 'utf8');
  // The build-windows job body, so an assertion about "the job" cannot be
  // satisfied by a coincidental match inside build-macos or publish-release.
  const buildWindows = release.slice(
    release.indexOf('\n  build-windows:'),
    release.indexOf('\n  publish-release:'),
  );

  /** Position of a named step inside build-windows, asserted to exist. */
  function stepIndex(name: string) {
    const index = buildWindows.indexOf(`- name: ${name}`);
    expect(index, `build-windows has a step named "${name}"`).toBeGreaterThan(-1);
    return index;
  }

  /** One step's YAML, from its `- name:` up to the next step at the same indent. */
  function stepBody(name: string) {
    const start = stepIndex(name);
    const next = buildWindows.indexOf('\n      - ', start);
    return buildWindows.slice(start, next === -1 ? undefined : next);
  }

  it('offers a dispatch dry run with a test-signing default', () => {
    expect(release).toMatch(/^on:\n(?:.*\n)*?  workflow_dispatch:\n    inputs:\n/m);
    expect(release).toMatch(
      /signing_policy:\n(?:.*\n)*?        type: choice\n(?:.*\n)*?          - test-signing\n          - release-signing\n/,
    );
    expect(release).toMatch(/signing_policy:\n(?:.*\n)*?        default: test-signing\n/);
    expect(release).toMatch(/expected_signer:\n(?:.*\n)*?        type: string\n/);
    expect(release).toMatch(/expected_signer:\n(?:.*\n)*?        default: SignPath\n/);
  });

  it('builds Windows for a real release or an explicit dispatch, never otherwise', () => {
    expect(buildWindows).toContain(
      "if: github.event_name == 'workflow_dispatch' || needs.detect-release.outputs.should_release == 'true'",
    );
    expect(buildWindows).not.toContain('if: ${{ false }}');
  });

  it('confines the signing secret to the release-signing environment and read-only permissions', () => {
    expect(buildWindows).toContain('environment: release-signing');
    expect(buildWindows).toMatch(/permissions:\n      contents: read\n      actions: read\n/);
    expect(buildWindows).not.toContain('contents: write');
    // The API token is only ever read from the environment secret, never inlined.
    expect(buildWindows).toContain('${{ secrets.SIGNPATH_API_TOKEN }}');
  });

  it('submits two signing requests, both gated on SignPath being configured', () => {
    const submits = buildWindows.match(/SignPath\/github-action-submit-signing-request@v1/g) ?? [];
    expect(submits).toHaveLength(2);
    expect(buildWindows).toContain('artifact-configuration-slug: windows-binaries');
    expect(buildWindows).toContain('artifact-configuration-slug: windows-installer');
    // Every SignPath-dependent step is skipped when the org id is unset, so the
    // unconfigured path still produces today's unsigned artifact set.
    const gates = buildWindows.match(/steps\.signpath\.outputs\.configured == 'true'/g) ?? [];
    expect(gates.length).toBeGreaterThanOrEqual(2);
    expect(buildWindows).toContain("vars.SIGNPATH_ORGANIZATION_ID != ''");
    expect(buildWindows).toContain('wait-for-completion: true');
    expect(buildWindows).toContain('wait-for-completion-timeout-in-seconds: 7200');
  });

  it('chooses the policy and the expected signer from the trigger, never blank on a push', () => {
    expect(buildWindows).toContain(
      "${{ github.event_name == 'workflow_dispatch' && inputs.signing_policy || 'release-signing' }}",
    );
    expect(buildWindows).toContain(
      "${{ github.event_name == 'workflow_dispatch' && inputs.expected_signer || 'SignPath Foundation' }}",
    );
  });

  it('re-signs the signed installer for the updater, in that order', () => {
    // The whole point of phase 2: Tauri minisigned the UNSIGNED installer, so
    // that .sig must be destroyed after the signed installer replaces it and
    // before the signed installer is re-signed. There is no repack: with
    // createUpdaterArtifacts the updater artifact IS the installer.
    expect(buildWindows).not.toContain('- name: Repack the signed installer into the updater archive');
    expect(buildWindows).not.toContain('.nsis.zip');
    const signInstaller = stepIndex('Sign the Windows installer with SignPath');
    const replace = stepIndex('Replace the unsigned installer with the signed installer');
    const deleteStale = stepIndex('Delete the stale updater signature');
    const resign = stepIndex('Sign the installer with the Tauri updater key');
    expect(signInstaller).toBeLessThan(replace);
    expect(replace).toBeLessThan(deleteStale);
    expect(deleteStale).toBeLessThan(resign);
    // The stale signature is removed and its absence proved, never assumed.
    const remove = stepBody('Delete the stale updater signature');
    expect(remove).toMatch(/\*(-setup)?\.exe\.sig/);
    expect(remove).toContain('Remove-Item');
    expect(remove).toMatch(/throw "stale updater signature/);
    // The re-signing runs on the installer and proves the .sig it should write.
    const resignBody = stepBody('Sign the installer with the Tauri updater key');
    expect(resignBody).toContain('npx tauri signer sign');
    expect(resignBody).toMatch(/Test-Path "\$installerPath\.sig"/);
  });

  it('signs the updater artifact in both the configured and unconfigured paths', () => {
    // `tauri bundle` is the only producer of a -setup.exe.sig when SignPath is
    // not configured, so it must carry the updater key either way.
    expect(buildWindows).toContain('npx tauri bundle --ci --bundles nsis');
    const bundle = stepBody('Bundle the NSIS installer');
    expect(bundle).toContain('TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}');
    expect(bundle).toContain('TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}');
    // Unconditional: it is the only producer of a .sig on the unsigned path.
    expect(bundle).not.toContain('if: ');
  });

  it('proves the published installer and every installed PE before collecting', () => {
    // The installer is the published updater artifact, so Authenticode is
    // checked on the file itself -- nothing is unpacked first.
    const authenticode = stepBody('Verify the Authenticode signature of the packaged installer');
    expect(authenticode).not.toContain('Expand-Archive');
    expect(authenticode).toContain('Get-AuthenticodeSignature');
    // The updater signature is verified over the installer and its .sig, with a
    // tampered copy rejected in the same run: a verifier that accepts anything
    // would pass the positive check too.
    const minisign = stepBody('Verify the updater signature');
    expect(minisign).toMatch(/node scripts\/release\/verify-minisign\.mjs --pubkey "\$pubkey" --file \$installerPath --sig \$sigPath/);
    expect(minisign).toContain('$sigPath = "$installerPath.sig"');
    expect(minisign).toMatch(/--file \$tampered --sig \$sigPath/);
    expect(minisign).toMatch(/if \(\$LASTEXITCODE -eq 0\) \{ throw /);
    // The negative control is the last native command of the step and exits 1
    // on purpose; pwsh steps report the last native exit code, so it has to be
    // cleared afterwards or the step fails with every check green (run
    // 34886768002).
    const negativeControl = minisign.indexOf('if ($LASTEXITCODE -eq 0) { throw');
    const reset = minisign.indexOf('$global:LASTEXITCODE = 0');
    expect(reset).toBeGreaterThan(negativeControl);
    expect(buildWindows).toContain('plugins.updater.pubkey');
    // Allowlist: an unexpected PE in the install directory fails the build.
    expect(buildWindows).toContain('careerops-node-runtime.exe');
    expect(buildWindows).toContain('uninstall.exe');
    expect(buildWindows).toContain('career-data.exe');
    expect(buildWindows).toContain('NotSigned');
    expect(buildWindows).toMatch(/unexpected|not on the allowlist/i);
    // Post-conditions run on BOTH paths -- an unsigned build that silently
    // skipped a signing step otherwise reads exactly like a successful one.
    for (const step of [
      'Verify the Authenticode signature of the packaged installer',
      'Verify the updater signature',
      'Verify installed Windows runtime',
    ]) expect(stepBody(step), `${step} must not be gated`).not.toContain('if: ');
  });

  it('fails closed after every native command', () => {
    const throws = buildWindows.match(/if \(\$LASTEXITCODE -ne 0\) \{ throw /g) ?? [];
    expect(throws.length).toBeGreaterThanOrEqual(5);
  });

  it('leaves publishing on the push trigger only', () => {
    expect(release).toMatch(
      /publish-release:[\s\S]*?if: github\.event_name == 'push' && needs\.detect-release\.outputs\.should_release == 'true'/,
    );
  });

  it('publishes only after both platform builds, so a Windows set can never arrive late', () => {
    expect(release).toMatch(/publish-release:\n    needs: \[detect-release, build-macos, build-windows\]/);
  });

  it('uploads the plain executables so the GitHub artifact is one zip of PE files', () => {
    // SignPath receives the GitHub artifact, which GitHub already stores as a
    // ZIP; pre-zipping would nest a second archive the artifact configuration
    // would have to describe. Phase 2 uploads the installer the same way.
    const stage = stepBody('Stage the unsigned Windows executables');
    expect(stage).not.toContain('Compress-Archive');
    const upload = stepBody('Upload the unsigned Windows executables');
    expect(upload).toContain('signpath-binaries/*.exe');
    expect(upload).not.toContain('.zip');
  });

  it('leaves the macOS job on tauri-action', () => {
    const buildMacos = release.slice(release.indexOf('\n  build-macos:'), release.indexOf('\n  build-windows:'));
    expect(buildMacos).toContain('tauri-apps/tauri-action@v1');
  });
});
