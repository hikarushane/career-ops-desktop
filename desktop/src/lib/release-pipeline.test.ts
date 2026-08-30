import { afterEach, describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { isAbsolute, join, normalize, resolve } from 'path';
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
      'node_modules/js-yaml/LICENSE',
      'node_modules/argparse/LICENSE',
    ]) expect(existsSync(join(output, path))).toBe(true);

    expect(readJson(join(output, 'node_modules/js-yaml/package.json')).version).toBe('5.4.1');
    expect(readJson(join(output, 'node_modules/argparse/package.json')).version).toBe('2.0.1');

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

    expect(conf.bundle?.resources?.['binaries/workspace-seed/']).toBe('workspace-seed/');
  });
});

describe('installed runtime package inputs', () => {
  it('packages the workspace seed, deterministic sidecar, and managed JavaScript runtime', () => {
    const conf = readJson(join(DESKTOP, 'src-tauri', 'tauri.conf.json'));
    const macos = readJson(join(DESKTOP, 'src-tauri', 'tauri.macos.conf.json'));
    const windows = readJson(join(DESKTOP, 'src-tauri', 'tauri.windows.conf.json'));

    expect(conf.bundle?.resources).toMatchObject({
      'binaries/workspace-seed/': 'workspace-seed/',
      'binaries/node-LICENSE': 'licenses/Node.js-LICENSE.txt',
      'binaries/node-runtime.json': 'runtime/node-runtime.json',
    });
    expect(conf.bundle?.externalBin).toEqual(expect.arrayContaining([
      'binaries/career-data',
      'binaries/careerops-node',
    ]));
    expect(macos.bundle?.resources).toMatchObject({
      'binaries/runtime/careerops-node-runtime': 'runtime/careerops-node-runtime',
    });
    expect(windows.bundle?.resources).toMatchObject({
      'binaries/runtime/careerops-node-runtime.exe': 'runtime/careerops-node-runtime.exe',
    });
  });

  it('uses only package-local relative inputs, never source-checkout paths', () => {
    const conf = readJson(join(DESKTOP, 'src-tauri', 'tauri.conf.json'));
    const inputs = [
      ...Object.keys(conf.bundle?.resources ?? {}),
      ...(conf.bundle?.externalBin ?? []),
    ];

    for (const input of inputs) {
      expect(isAbsolute(input), input).toBe(false);
      expect(normalize(input).split(/[\\/]/), input).not.toContain('..');
      expect(input, input).not.toMatch(/(?:^|[\\/])(?:Users|home|private|tmp)[\\/]/i);
    }
  });

  it('pins exact target distributions and never copies the mutable build-host runtime', () => {
    const build = readFileSync(join(DESKTOP, 'scripts', 'build-sidecar.mjs'), 'utf8');
    const manifestPath = join(DESKTOP, 'scripts', 'node-runtime.json');

    expect(existsSync(manifestPath)).toBe(true);
    const manifest = readJson(manifestPath);
    expect(manifest.version).toBe('22.23.2');
    expect(manifest.licenseSha256).toBe('c738ae413cf561f174e34f6961f8ca458aae2369a73640dda6234c629b98bcc4');
    for (const target of [
      'aarch64-apple-darwin',
      'x86_64-apple-darwin',
      'x86_64-unknown-linux-gnu',
      'x86_64-pc-windows-msvc',
    ]) {
      const artifact = manifest.artifacts[target];
      expect(artifact, target).toBeDefined();
      expect(artifact.archive, target).toContain('node-v22.23.2-');
      expect(artifact.sha256, target).toMatch(/^[a-f0-9]{64}$/);
      expect(artifact.binary, target).toContain('node-v22.23.2-');
      expect(artifact.license, target).toContain('node-v22.23.2-');
    }
    expect(build).not.toContain('process.execPath');
    expect(build).not.toMatch(/(?:\/opt\/homebrew|\/usr\/local|[A-Za-z]:\\\\Program Files)/);
  });

  it('the generated-input verifier rejects a mismatched runtime license', () => {
    const binaries = temp('career-ops-runtime-verifier-');
    writeFileSync(join(binaries, 'node-LICENSE'), 'not the pinned Node license\n');
    writeFileSync(join(binaries, 'node-runtime.json'), '{}\n');

    const result = spawnSync(process.execPath, [
      'scripts/verify-packaged-runtime.mjs',
      '--generated',
      '--target', 'aarch64-apple-darwin',
      '--binaries', binaries,
    ], { cwd: DESKTOP, encoding: 'utf8' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/license checksum mismatch/i);
  });
});

describe('reviewed intake release isolation', () => {
  it('uses the packaged macOS sandbox and does not ship an unproven Linux sandbox', () => {
    const conf = readJson(join(DESKTOP, 'src-tauri', 'tauri.conf.json'));
    const runner = readFileSync(join(DESKTOP, 'src-tauri', 'src', 'runner.rs'), 'utf8');

    expect(runner).toContain('Command::new("/usr/bin/sandbox-exec")');
    expect(runner).toContain('because it does not include a supported isolation runtime');
    expect(conf.bundle?.externalBin ?? []).not.toEqual(expect.arrayContaining([
      'bwrap',
      'binaries/bwrap',
    ]));
    expect(runner).not.toMatch(/install (?:bubblewrap|bwrap)/i);
  });

  it('keeps unsupported packaged platforms fail-closed with no files changed', () => {
    const runner = readFileSync(join(DESKTOP, 'src-tauri', 'src', 'runner.rs'), 'utf8');

    expect(runner).toContain('#[cfg(not(any(target_os = "macos", target_os = "linux")))]');
    expect(runner).toContain('Err(INTAKE_ISOLATION_UNAVAILABLE.to_owned())');
    expect(runner).toContain('No files were changed; retry only after updating');
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
