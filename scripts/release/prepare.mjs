#!/usr/bin/env node
// Release preparation script for CareerOps Desktop fork.
// Usage: node scripts/release/prepare.mjs [--non-interactive] [--reason <reason>]
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const DESKTOP = join(ROOT, 'desktop');

const args = process.argv.slice(2);
const nonInteractive = args.includes('--non-interactive');
const reasonIdx = args.indexOf('--reason');
const reason = reasonIdx >= 0 ? args[reasonIdx + 1] || 'manual' : 'manual';

function die(msg) { console.error(`RELEASE ERROR: ${msg}`); process.exit(1); }
function info(msg) { console.log(`  ${msg}`); }
function heading(msg) { console.log(`\n=== ${msg} ===`); }

function git(...a) {
  return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
function writeJson(p, obj) { writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }

heading('1. Verify branch and working tree');
const branch = git('branch', '--show-current');
info(`Branch: ${branch}`);

const status = git('status', '--short');
if (status) die(`Working tree is dirty:\n${status}`);
info('Working tree clean.');

heading('2. Read current versions');
const desktopPkg = readJson(join(DESKTOP, 'package.json'));
const tauriConf = readJson(join(DESKTOP, 'src-tauri', 'tauri.conf.json'));
const cargoToml = readFileSync(join(DESKTOP, 'src-tauri', 'Cargo.toml'), 'utf8');
const upstreamVersion = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim().replace(/\s*#.*/, '');

info(`Desktop package.json: ${desktopPkg.version}`);
info(`Tauri conf: ${tauriConf.version}`);
const cargoMatch = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
const cargoVersion = cargoMatch ? cargoMatch[1] : 'unknown';
info(`Cargo.toml: ${cargoVersion}`);
info(`Upstream VERSION: ${upstreamVersion}`);

heading('3. Version consistency check');
const versions = [desktopPkg.version, tauriConf.version, cargoVersion];
const unique = [...new Set(versions)];
if (unique.length > 1) {
  die(`Version mismatch: package.json=${desktopPkg.version}, tauri.conf=${tauriConf.version}, Cargo.toml=${cargoVersion}`);
}
const currentVersion = unique[0];
info(`Current fork version: ${currentVersion} (consistent)`);

heading('4. Determine next version');
const [major, minor, patch] = currentVersion.split('.').map(Number);
let nextVersion;
if (reason === 'upstream-sync') {
  nextVersion = `${major}.${minor}.${patch + 1}`;
} else {
  nextVersion = `${major}.${minor + 1}.0`;
}
info(`Next version: ${nextVersion} (reason: ${reason})`);

heading('5. Check release notes');
const releaseNotesPath = join(ROOT, 'RELEASE_NOTES.md');
if (!existsSync(releaseNotesPath)) die('RELEASE_NOTES.md not found');
const releaseNotes = readFileSync(releaseNotesPath, 'utf8');
if (!releaseNotes.includes(`## v${nextVersion}`) && !releaseNotes.includes(`## v${currentVersion}`)) {
  info(`Warning: RELEASE_NOTES.md has no section for v${nextVersion}. Adding placeholder.`);
  const datestamp = new Date().toISOString().split('T')[0];
  const placeholder = `## v${nextVersion}\n\nReleased ${datestamp}.\n\n- ${reason === 'upstream-sync' ? `Updated CareerOps core to upstream v${upstreamVersion}` : 'Release preparation'}\n\n`;
  writeFileSync(releaseNotesPath, releaseNotes.replace(/^(# Release Notes\n+)/m, `$1${placeholder}`));
  info('Placeholder release notes added.');
}

heading('6. Update version sources');
desktopPkg.version = nextVersion;
writeJson(join(DESKTOP, 'package.json'), desktopPkg);
info(`Updated desktop/package.json → ${nextVersion}`);

tauriConf.version = nextVersion;
writeJson(join(DESKTOP, 'src-tauri', 'tauri.conf.json'), tauriConf);
info(`Updated desktop/src-tauri/tauri.conf.json → ${nextVersion}`);

const updatedCargo = cargoToml.replace(
  /^(version\s*=\s*")[^"]+(")/m,
  `$1${nextVersion}$2`,
);
writeFileSync(join(DESKTOP, 'src-tauri', 'Cargo.toml'), updatedCargo);
info(`Updated desktop/src-tauri/Cargo.toml → ${nextVersion}`);

heading('7. Update fork upstream metadata');
const forkUpstream = join(ROOT, '.fork', 'upstream.json');
if (existsSync(forkUpstream)) {
  const upstream = readJson(forkUpstream);
  upstream.lastIntegratedVersion = upstreamVersion;
  writeJson(forkUpstream, upstream);
  info(`Updated .fork/upstream.json lastIntegratedVersion → ${upstreamVersion}`);
}

heading('8. Validate');
const node = process.execPath;
try {
  execFileSync(node, [join(ROOT, 'scripts', 'release', 'version-consistency.mjs')], {
    cwd: ROOT, stdio: 'inherit',
  });
} catch {
  die('Version consistency check failed after update');
}

heading('9. Create release-preparation commit');
const filesToStage = [
  'desktop/package.json',
  'desktop/src-tauri/tauri.conf.json',
  'desktop/src-tauri/Cargo.toml',
  'RELEASE_NOTES.md',
  '.fork/upstream.json',
];
for (const f of filesToStage) {
  const full = join(ROOT, f);
  if (existsSync(full)) git('add', f);
}
git('commit', '-m', `chore(release): prepare v${nextVersion}\n\nReason: ${reason}\nUpstream: v${upstreamVersion}`);
info(`Committed: chore(release): prepare v${nextVersion}`);

heading('Done');
info(`Release v${nextVersion} is prepared on branch "${branch}".`);
info('Next: push the branch, open a PR to main, and let CI verify.');
info('DO NOT push directly to main.');
