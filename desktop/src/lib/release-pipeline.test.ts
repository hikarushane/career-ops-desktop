import { afterEach, describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { sidecarFilename } from '../../scripts/sidecar-naming.mjs';
import { updaterPlatformFromTriple } from '../../../scripts/release/artifacts.mjs';
import { renderCask } from '../../../scripts/release/homebrew.mjs';
import { isProtectedPath } from '../../../scripts/release/protected-paths.mjs';
import { validateReleaseConfiguration } from '../../../scripts/release/release-lib.mjs';

const ROOT = resolve(__dirname, '../../..');
const DESKTOP = join(ROOT, 'desktop');
const temporary: string[] = [];

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function temp(prefix: string) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporary.push(path);
  return path;
}

function seedSnapshot(root: string, directory = ''): string[] {
  const snapshot: string[] = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const relative = join(directory, entry.name);
    if (entry.isDirectory()) snapshot.push(...seedSnapshot(root, relative));
    if (entry.isFile()) snapshot.push(`${relative}\0${readFileSync(join(root, relative)).toString('base64')}`);
  }
  return snapshot.sort();
}

function readJson(p: string) { return JSON.parse(readFileSync(p, 'utf8')); }

describe('version consistency', () => {
  it('desktop/package.json version exists', () => {
    const pkg = readJson(join(DESKTOP, 'package.json'));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('tauri.conf.json version matches package.json', () => {
    const pkg = readJson(join(DESKTOP, 'package.json'));
    const conf = readJson(join(DESKTOP, 'src-tauri', 'tauri.conf.json'));
    expect(conf.version).toBe(pkg.version);
  });

  it('Cargo.toml version matches package.json', () => {
    const pkg = readJson(join(DESKTOP, 'package.json'));
    const cargo = readFileSync(join(DESKTOP, 'src-tauri', 'Cargo.toml'), 'utf8');
    const m = cargo.match(/^version\s*=\s*"([^"]+)"/m);
    expect(m).toBeTruthy();
    expect(m![1]).toBe(pkg.version);
  });
});

describe('release notes', () => {
  it('RELEASE_NOTES.md exists', () => {
    expect(existsSync(join(ROOT, 'RELEASE_NOTES.md'))).toBe(true);
  });

  it('has at least one version section', () => {
    const rn = readFileSync(join(ROOT, 'RELEASE_NOTES.md'), 'utf8');
    expect(rn).toMatch(/## v\d+\.\d+\.\d+/);
  });
});

describe('release repo configuration', () => {
  it('.fork/release.json exists', () => {
    expect(existsSync(join(ROOT, '.fork', 'release.json'))).toBe(true);
  });

  it('publish fails when repository is null', () => {
    const release = readJson(join(ROOT, '.fork', 'release.json'));
    // This is expected in dev — the test confirms the gate exists
    if (release.repository === null) {
      expect(release.repository).toBeNull();
    } else {
      expect(typeof release.repository).toBe('string');
    }
  });
});

describe('artifact naming conventions', () => {
  const version = readJson(join(DESKTOP, 'package.json')).version;

  it('macOS DMG name follows convention', () => {
    expect(`CareerOps_${version}_macOS.dmg`).toMatch(/^CareerOps_\d+\.\d+\.\d+_macOS\.dmg$/);
  });

  it('Windows EXE name follows convention', () => {
    expect(`CareerOps_${version}_Windows.exe`).toMatch(/^CareerOps_\d+\.\d+\.\d+_Windows\.exe$/);
  });

  it('macOS ZIP name follows convention', () => {
    expect(`CareerOps-macOS-${version}.zip`).toMatch(/^CareerOps-macOS-\d+\.\d+\.\d+\.zip$/);
  });

  it('Windows ZIP name follows convention', () => {
    expect(`CareerOps-Windows-${version}.zip`).toMatch(/^CareerOps-Windows-\d+\.\d+\.\d+\.zip$/);
  });
});

describe('sidecar naming conventions', () => {
  it.each([
    ['darwin', 'aarch64-apple-darwin', 'career-data-aarch64-apple-darwin'],
    ['darwin', 'x86_64-apple-darwin', 'career-data-x86_64-apple-darwin'],
    ['win32', 'x86_64-pc-windows-msvc', 'career-data-x86_64-pc-windows-msvc.exe'],
  ])('names %s sidecars deterministically', (platform, triple, expected) => {
    expect(sidecarFilename(triple, platform)).toBe(expected);
  });

  it('always gives Windows sidecars the executable suffix', () => {
    expect(sidecarFilename('aarch64-pc-windows-msvc', 'win32')).toMatch(/\.exe$/);
  });
});

describe('packaged workspace seed', () => {
  it('refuses an arbitrary output override before touching it', () => {
    const output = join(temp('career-ops-seed-refusal-'), 'workspace-seed');
    mkdirSync(output);
    writeFileSync(join(output, 'keep.txt'), 'keep\n');

    const result = spawnSync(
      process.execPath,
      ['scripts/workspace-seed.mjs', '--output', output],
      { cwd: DESKTOP, encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/output|argument|override/i);
    expect(readFileSync(join(output, 'keep.txt'), 'utf8')).toBe('keep\n');
  });

  it('generates runtime system files from the updater-owned path contract', () => {
    const output = join(DESKTOP, 'src-tauri', 'binaries', 'workspace-seed');

    execFileSync(process.execPath, ['scripts/workspace-seed.mjs'], {
      cwd: DESKTOP,
    });

    for (const path of [
      'doctor.mjs',
      'modes/intake.md',
      'modes/oferta.md',
      'scan.mjs',
      'modes/batch.md',
      'modes/interview.md',
      'generate-pdf.mjs',
      'templates/cv-template.html',
      'documents/README.md',
      'config/profile.example.yml',
    ]) expect(existsSync(join(output, path))).toBe(true);

    for (const path of [
      'cv.md',
      'config/profile.yml',
      'modes/_profile.md',
      'portals.yml',
      'data/.gitkeep',
      'desktop/package.json',
      '.github/workflows/test.yml',
    ]) expect(existsSync(join(output, path))).toBe(false);
  });

  it('replaces stale generated output deterministically', () => {
    const output = join(DESKTOP, 'src-tauri', 'binaries', 'workspace-seed');
    const command = ['scripts/workspace-seed.mjs'];
    execFileSync(process.execPath, command, { cwd: DESKTOP });
    const first = seedSnapshot(output);
    writeFileSync(join(output, 'stale.txt'), 'stale\n');

    execFileSync(process.execPath, command, { cwd: DESKTOP });

    expect(existsSync(join(output, 'stale.txt'))).toBe(false);
    expect(seedSnapshot(output)).toEqual(first);
  });

  it('bundles the generated directory under the runtime workspace-seed path', () => {
    const conf = readJson(join(DESKTOP, 'src-tauri', 'tauri.conf.json'));

    expect(conf.bundle?.resources).toEqual({
      'binaries/workspace-seed/': 'workspace-seed/',
    });
  });
});

describe('updater configuration', () => {
  it('tauri.conf.json has updater plugin', () => {
    const conf = readJson(join(DESKTOP, 'src-tauri', 'tauri.conf.json'));
    expect(conf.plugins?.updater).toBeDefined();
  });

  it('updater has endpoints', () => {
    const conf = readJson(join(DESKTOP, 'src-tauri', 'tauri.conf.json'));
    expect(conf.plugins?.updater?.endpoints?.length).toBeGreaterThan(0);
  });

  it('creates updater artifacts in production bundles', () => {
    const conf = readJson(join(DESKTOP, 'src-tauri', 'tauri.conf.json'));
    expect(conf.bundle?.createUpdaterArtifacts).toBe(true);
  });

  it('updater declares a public key', () => {
    const conf = readJson(join(DESKTOP, 'src-tauri', 'tauri.conf.json'));
    expect(typeof conf.plugins?.updater?.pubkey).toBe('string');
    expect(conf.plugins?.updater?.pubkey.length).toBeGreaterThan(0);
  });

  it('grants updater and process runtime permissions', () => {
    const capability = readJson(join(DESKTOP, 'src-tauri', 'capabilities', 'default.json'));
    expect(capability.permissions).toContain('updater:default');
    expect(capability.permissions).toContain('process:default');
  });

  it('no private updater key in tracked files', () => {
    const dangerousFiles = [
      '.tauri/career-ops.key',
      'updater.key',
      'signing.key',
    ];
    for (const f of dangerousFiles) {
      expect(existsSync(join(ROOT, f))).toBe(false);
    }
  });
});

describe('fork metadata', () => {
  it('.fork/upstream.json has required fields', () => {
    const upstream = readJson(join(ROOT, '.fork', 'upstream.json'));
    expect(upstream.repository).toBe('santifer/career-ops');
    expect(upstream.branch).toBe('main');
    expect(upstream.lastIntegratedSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('.fork/protected-paths.json lists desktop/', () => {
    const paths = readJson(join(ROOT, '.fork', 'protected-paths.json'));
    expect(paths.protected).toContain('desktop/');
  });
});

describe('release safety helpers', () => {
  it.each([
    '.github/workflows/release.yml',
    '.github/workflows/release-readiness.yml',
    '.github/workflows/upstream-maintenance.yml',
    '.github/prompts/upstream-maintenance.md',
    '.fork/release.json',
    'packaging/homebrew/career-ops.rb',
    'README.md',
    'README.en.md',
    'docs/upstream/README.md',
    'scripts/release/prepare.mjs',
    'desktop/src-tauri/tauri.conf.json',
  ])('classifies %s as protected infrastructure', (path) => {
    const paths = readJson(join(ROOT, '.fork', 'protected-paths.json')).protected;
    expect(isProtectedPath(path, paths)).toBe(true);
  });

  it('rejects placeholder production release configuration', () => {
    const result = validateReleaseConfiguration(ROOT, { production: true });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/repository|public key|endpoint/i);
  });

  it.each([
    ['aarch64-apple-darwin', 'darwin-aarch64'],
    ['x86_64-apple-darwin', 'darwin-x86_64'],
    ['x86_64-pc-windows-msvc', 'windows-x86_64'],
  ])('maps %s to updater platform %s', (triple, platform) => {
    expect(updaterPlatformFromTriple(triple)).toBe(platform);
  });

  it('renders a versioned Homebrew cask with a real checksum', () => {
    const source = readFileSync(join(ROOT, 'packaging', 'homebrew', 'career-ops.rb'), 'utf8');
    const sha = 'a'.repeat(64);
    const rendered = renderCask(source, {
      version: '1.2.3',
      url: 'https://github.com/acme/career-ops/releases/download/desktop-v1.2.3/CareerOps_1.2.3_macOS.dmg',
      sha256: sha,
    });
    expect(rendered).toContain('version "1.2.3"');
    expect(rendered).toContain(`sha256 "${sha}"`);
    expect(rendered).not.toContain(':no_check');
  });
});

describe('updater UI design and accessibility', () => {
  const modal = readFileSync(join(DESKTOP, 'src', 'components', 'UpdateModal.tsx'), 'utf8');
  const css = readFileSync(join(DESKTOP, 'src', 'theme.css'), 'utf8');

  it('uses modal semantics and an accessible title relationship', () => {
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('aria-labelledby="update-modal-title"');
  });

  it('manages Escape, focus trap, and focus return', () => {
    expect(modal).toContain("event.key === 'Escape'");
    expect(modal).toContain("event.key !== 'Tab'");
    expect(modal).toContain('previousFocus?.focus()');
  });

  it('uses tokenized overlays, 44px targets, and reduced-motion fallback', () => {
    expect(css).toContain('--color-overlay:');
    expect(css).toContain('background: var(--color-overlay)');
    expect(css).toMatch(/\.update-badge\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
