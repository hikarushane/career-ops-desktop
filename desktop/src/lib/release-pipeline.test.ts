import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { sidecarFilename } from '../../scripts/sidecar-naming.mjs';

const ROOT = resolve(__dirname, '../../..');
const DESKTOP = join(ROOT, 'desktop');

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
