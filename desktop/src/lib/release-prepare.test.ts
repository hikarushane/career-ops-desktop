import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');

describe('release preparation', () => {
  let repo: string;
  const write = (path: string, body: string) => {
    const target = join(repo, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'career-ops-release-prepare-'));
    mkdirSync(join(repo, 'scripts/release'), { recursive: true });
    for (const file of ['prepare.mjs', 'readiness.mjs', 'release-lib.mjs', 'version-consistency.mjs', 'validate-metadata.mjs']) {
      cpSync(join(ROOT, 'scripts/release', file), join(repo, 'scripts/release', file));
    }
    write('desktop/package.json', '{"version":"0.1.0"}\n');
    write('desktop/package-lock.json', '{"version":"0.1.0","packages":{"":{"version":"0.1.0"}}}\n');
    write('desktop/src-tauri/Cargo.toml', '[package]\nname = "desktop"\nversion = "0.1.0"\n');
    write('desktop/src-tauri/Cargo.lock', '[[package]]\nname = "desktop"\nversion = "0.1.0"\n');
    write('desktop/src-tauri/tauri.conf.json', JSON.stringify({
      version: '0.1.0',
      bundle: { createUpdaterArtifacts: true },
      plugins: { updater: { endpoints: ['https://example.invalid/latest.json'], pubkey: 'placeholder' } },
    }));
    write('.fork/release.json', '{"repository":null,"homebrewTap":null}\n');
    write('.fork/upstream.json', `{"lastIntegratedSha":"${'a'.repeat(40)}","lastIntegratedVersion":"1.0.0"}\n`);
    write('packaging/homebrew/career-ops.rb', 'cask "career-ops" do\n  version "0.1.0"\n  sha256 "RELEASE_SHA256_PLACEHOLDER"\nend\n');
    write('RELEASE_NOTES.md', '# Release Notes\n\n## v0.1.0\n\nInitial.\n');
    write('VERSION', '1.30.0\n');
    execFileSync('git', ['init', '-q', '-b', 'feature/test-release'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'Release Test'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'release-test@example.invalid'], { cwd: repo });
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo });
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('bumps every version, writes notes and metadata, and creates a preparation commit', () => {
    const result = spawnSync(process.execPath, ['scripts/release/prepare.mjs', '--non-interactive', '--reason', 'remediation'], {
      cwd: repo,
      env: { ...process.env, CAREER_OPS_RELEASE_TEST_MODE: '1' },
      encoding: 'utf8',
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(repo, 'desktop/package.json'), 'utf8')).version).toBe('0.2.0');
    expect(readFileSync(join(repo, 'desktop/src-tauri/Cargo.lock'), 'utf8')).toContain('version = "0.2.0"');
    expect(readFileSync(join(repo, 'RELEASE_NOTES.md'), 'utf8')).toContain('## v0.2.0');
    expect(JSON.parse(readFileSync(join(repo, 'release-prepared.json'), 'utf8'))).toMatchObject({ version: '0.2.0' });
    expect(execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd: repo, encoding: 'utf8' }).trim())
      .toBe('chore(release): prepare v0.2.0');
    expect(execFileSync('git', ['status', '--short'], { cwd: repo, encoding: 'utf8' }).trim()).toBe('');
  });
});
