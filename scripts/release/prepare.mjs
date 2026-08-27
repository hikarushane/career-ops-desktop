#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildPreparedMetadata, consistentVersion, readJson, validateReleaseConfiguration } from './release-lib.mjs';

const root = resolve(import.meta.dirname, '../..');
const desktop = join(root, 'desktop');
const args = process.argv.slice(2);
const nonInteractive = args.includes('--non-interactive');
const reasonIndex = args.indexOf('--reason');
const reason = reasonIndex >= 0 ? args[reasonIndex + 1] : 'manual';
const skipHeavyTests = process.env.CAREER_OPS_RELEASE_TEST_MODE === '1';

function die(message) {
  console.error(`RELEASE ERROR: ${message}`);
  process.exit(1);
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8' }).trim();
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceVersion(path, pattern, replacement) {
  const source = readFileSync(path, 'utf8');
  const updated = source.replace(pattern, replacement);
  if (updated === source) die(`could not update version in ${path}`);
  writeFileSync(path, updated);
}

if (!reason) die('--reason requires a value');
if (nonInteractive) console.log('Release preparation: non-interactive mode');

const branch = git('branch', '--show-current');
if (!branch || branch === 'main') die(`release preparation must run on a feature, release, integration, or automation branch (found ${branch || 'detached HEAD'})`);
if (!/^(feature|release|integration|automation|codex)\//.test(branch)) {
  die(`unexpected release preparation branch: ${branch}`);
}
const dirty = git('status', '--short');
if (dirty) die(`working tree is dirty:\n${dirty}`);
const baseCommit = git('rev-parse', 'HEAD');

const current = consistentVersion(root);
if (current.errors.length) die(current.errors.join('\n'));
const [major, minor, patch] = current.version.split('.').map(Number);
const nextVersion = reason === 'upstream-sync'
  ? `${major}.${minor}.${patch + 1}`
  : `${major}.${minor + 1}.0`;
console.log(`Preparing v${nextVersion} from v${current.version} (${reason})`);

const packagePath = join(desktop, 'package.json');
const packageJson = readJson(packagePath);
packageJson.version = nextVersion;
writeJson(packagePath, packageJson);

const packageLockPath = join(desktop, 'package-lock.json');
if (existsSync(packageLockPath)) {
  const lock = readJson(packageLockPath);
  lock.version = nextVersion;
  if (lock.packages?.['']) lock.packages[''].version = nextVersion;
  writeJson(packageLockPath, lock);
}

const tauriPath = join(desktop, 'src-tauri', 'tauri.conf.json');
const tauri = readJson(tauriPath);
tauri.version = nextVersion;
writeJson(tauriPath, tauri);

replaceVersion(
  join(desktop, 'src-tauri', 'Cargo.toml'),
  /^(version\s*=\s*")[^"]+("\s*)$/m,
  `$1${nextVersion}$2`,
);
replaceVersion(
  join(desktop, 'src-tauri', 'Cargo.lock'),
  /(\[\[package\]\]\s+name = "desktop"\s+version = ")[^"]+("\s*)/m,
  `$1${nextVersion}$2`,
);
replaceVersion(
  join(root, 'packaging', 'homebrew', 'career-ops.rb'),
  /^(\s*version\s+")[^"]+("\s*)$/m,
  `$1${nextVersion}$2`,
);

const upstreamVersion = readFileSync(join(root, 'VERSION'), 'utf8').trim().replace(/\s*#.*/, '');
const upstreamPath = join(root, '.fork', 'upstream.json');
const upstream = readJson(upstreamPath);
upstream.lastIntegratedVersion = upstreamVersion;
if (reason === 'upstream-sync') {
  const upstreamSha = process.env.UPSTREAM_SHA;
  if (!/^[0-9a-f]{40}$/.test(upstreamSha ?? '')) die('UPSTREAM_SHA must be a full SHA for --reason upstream-sync');
  upstream.lastIntegratedSha = upstreamSha;
}
writeJson(upstreamPath, upstream);

const notesPath = join(root, 'RELEASE_NOTES.md');
const notes = readFileSync(notesPath, 'utf8');
if (notes.includes(`## v${nextVersion}`)) die(`RELEASE_NOTES.md already contains v${nextVersion}`);
const date = new Date().toISOString().slice(0, 10);
const summary = reason === 'upstream-sync'
  ? `Integrated CareerOps core ${upstreamVersion} at ${upstream.lastIntegratedSha}.`
  : `Prepared the ${reason} release after passing the release-readiness gates.`;
const section = `## v${nextVersion}\n\nReleased ${date}.\n\n- ${summary}\n\n`;
writeFileSync(notesPath, notes.replace(/^(# Release Notes\s*\n+)/, `$1${section}`));

const afterUpdate = consistentVersion(root);
if (afterUpdate.errors.length) die(afterUpdate.errors.join('\n'));
if (!readFileSync(notesPath, 'utf8').includes(`## v${nextVersion}`)) die('current-version release notes were not generated');
const staticConfig = validateReleaseConfiguration(root);
if (!staticConfig.ok) die(staticConfig.errors.join('\n'));

if (!skipHeavyTests) {
  execFileSync(process.execPath, ['scripts/release/readiness.mjs'], { cwd: root, stdio: 'inherit' });
} else {
  console.log('Release test mode: heavy readiness commands skipped by test harness.');
}

const marker = buildPreparedMetadata(root, baseCommit);
writeJson(join(root, 'release-prepared.json'), marker);

const files = [
  'desktop/package.json',
  'desktop/src-tauri/tauri.conf.json',
  'desktop/src-tauri/Cargo.toml',
  'desktop/src-tauri/Cargo.lock',
  'packaging/homebrew/career-ops.rb',
  '.fork/upstream.json',
  'RELEASE_NOTES.md',
  'release-prepared.json',
];
if (existsSync(packageLockPath)) files.splice(1, 0, 'desktop/package-lock.json');
git('add', '--', ...files);
git('diff', '--cached', '--check');
git('commit', '-m', `chore(release): prepare v${nextVersion}`, '-m', `Reason: ${reason}\nUpstream: ${upstream.lastIntegratedSha}`);
console.log(`Release v${nextVersion} prepared and committed on ${branch}.`);
