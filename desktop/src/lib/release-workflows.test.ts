import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
      'CareerOps_1.2.3_Windows.nsis.zip',
    ]) write(assets, name, `artifact:${name}`);
    write(assets, 'CareerOps_1.2.3_macOS.app.tar.gz.sig', 'mac-signature');
    write(assets, 'CareerOps_1.2.3_Windows.nsis.zip.sig', 'win-signature');
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
      'CareerOps_1.2.3_Windows.nsis.zip',
      'latest.json',
      'release-provenance.json',
    ]) expect(sums).toContain(name);
    expect(JSON.parse(readFileSync(join(assets, 'release-provenance.json'), 'utf8'))).toEqual({
      version: '1.2.3',
      gitSha: 'b'.repeat(40),
      upstreamSha: 'a'.repeat(40),
      buildPlatforms: ['darwin-aarch64', 'windows-x86_64'],
    });
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
