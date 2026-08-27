import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const ZERO_SHA = '0'.repeat(40);

describe('pre-push hook behavior', () => {
  let repo: string;

  const write = (path: string, body: string) => {
    const target = join(repo, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
  };

  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

  const runHook = (remoteRef: string) => {
    const head = git('rev-parse', 'HEAD');
    return spawnSync('bash', ['.githooks/pre-push'], {
      cwd: repo,
      input: `refs/heads/local ${head} ${remoteRef} ${ZERO_SHA}\n`,
      encoding: 'utf8',
    });
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'career-ops-pre-push-'));
    for (const path of [
      '.githooks/pre-push',
      'scripts/release/release-lib.mjs',
      'scripts/release/prepared-metadata.mjs',
      'scripts/release/validate-metadata.mjs',
    ]) {
      const target = join(repo, path);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(ROOT, path), target);
    }
    write('desktop/package.json', '{"version":"0.1.0"}\n');
    write('desktop/src/main.ts', 'export const releaseSource = true;\n');
    write('desktop/package-lock.json', '{"version":"0.1.0","packages":{"":{"version":"0.1.0"}}}\n');
    write('desktop/src-tauri/Cargo.toml', '[package]\nname = "desktop"\nversion = "0.1.0"\n');
    write('desktop/src-tauri/Cargo.lock', '[[package]]\nname = "desktop"\nversion = "0.1.0"\n');
    write('desktop/src-tauri/tauri.conf.json', JSON.stringify({
      version: '0.1.0',
      bundle: { createUpdaterArtifacts: true },
      plugins: { updater: {
        endpoints: ['https://github.com/acme/career-ops/releases/latest/download/latest.json'],
        pubkey: 'dGVzdC1wdWJsaWMta2V5LXRoYXQtaXMtbG9uZy1lbm91Z2g=',
      } },
    }));
    write('.fork/release.json', '{"repository":"acme/career-ops","homebrewTap":"acme/homebrew-career-ops"}\n');
    write('.fork/upstream.json', `{"lastIntegratedSha":"${'a'.repeat(40)}"}\n`);
    write('RELEASE_NOTES.md', '# Release Notes\n\n## v0.1.0\n\nPrepared.\n');
    write('packaging/homebrew/career-ops.rb', 'cask "career-ops" do\n  version "0.1.0"\nend\n');
    execFileSync('git', ['init', '-q'], { cwd: repo });
    git('config', 'user.name', 'Release Test');
    git('config', 'user.email', 'release-test@example.invalid');
    git('add', '.');
    git('commit', '-qm', 'fixture');
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('allows ordinary feature pushes without running release gates', () => {
    expect(runHook('refs/heads/feature/demo').status).toBe(0);
  });

  it('blocks an unprepared main push', () => {
    const result = runHook('refs/heads/main');
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('release-prepared.json');
  });

  it('blocks an unprepared desktop release tag', () => {
    expect(runHook('refs/tags/desktop-v0.1.0').status).not.toBe(0);
  });

  it('allows a prepared main push through the local gate', () => {
    const base = git('rev-parse', 'HEAD');
    execFileSync(process.execPath, ['scripts/release/prepared-metadata.mjs', 'create', '--base', base], {
      cwd: repo,
      stdio: 'pipe',
    });
    git('add', 'release-prepared.json');
    git('commit', '-qm', 'chore(release): prepare v0.1.0');
    expect(runHook('refs/heads/main').status).toBe(0);
  });

  it('blocks main when tracked source changes after preparation', () => {
    const base = git('rev-parse', 'HEAD');
    execFileSync(process.execPath, ['scripts/release/prepared-metadata.mjs', 'create', '--base', base], {
      cwd: repo,
      stdio: 'pipe',
    });
    git('add', 'release-prepared.json');
    git('commit', '-qm', 'chore(release): prepare v0.1.0');
    write('desktop/src/main.ts', 'export const releaseSource = false;\n');
    git('add', 'desktop/src/main.ts');
    git('commit', '-qm', 'feat(desktop): change packaged source');

    const result = runHook('refs/heads/main');
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('metadataHash is stale');
  });
});
