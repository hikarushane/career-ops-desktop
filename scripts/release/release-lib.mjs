import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const RELEASE_INPUTS = [
  'desktop/package.json',
  'desktop/package-lock.json',
  'desktop/src-tauri/tauri.conf.json',
  'desktop/src-tauri/Cargo.toml',
  'desktop/src-tauri/Cargo.lock',
  '.fork/release.json',
  '.fork/upstream.json',
  'RELEASE_NOTES.md',
  'packaging/homebrew/career-ops.rb',
];

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256File(path) {
  return sha256(readFileSync(path));
}

export function nonEmptyArtifacts(directory, suffix) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(suffix))
    .map((name) => ({ name, size: statSync(join(directory, name)).size }))
    .filter(({ size }) => size > 0);
}

export function versionSources(root) {
  const pkg = readJson(join(root, 'desktop/package.json')).version;
  const npmLock = readJson(join(root, 'desktop/package-lock.json')).version;
  const conf = readJson(join(root, 'desktop/src-tauri/tauri.conf.json')).version;
  const cargo = readFileSync(join(root, 'desktop/src-tauri/Cargo.toml'), 'utf8')
    .match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const lock = readFileSync(join(root, 'desktop/src-tauri/Cargo.lock'), 'utf8')
    .match(/\[\[package\]\]\s+name = "desktop"\s+version = "([^"]+)"/m)?.[1];
  const cask = readFileSync(join(root, 'packaging/homebrew/career-ops.rb'), 'utf8')
    .match(/^\s*version\s+"([^"]+)"/m)?.[1];
  return {
    'desktop/package.json': pkg,
    'desktop/package-lock.json': npmLock,
    'desktop/src-tauri/tauri.conf.json': conf,
    'desktop/src-tauri/Cargo.toml': cargo,
    'desktop/src-tauri/Cargo.lock': lock,
    'packaging/homebrew/career-ops.rb': cask,
  };
}

export function consistentVersion(root) {
  const sources = versionSources(root);
  const versions = Object.values(sources);
  const version = versions[0];
  const errors = versions.every((candidate) => candidate === version)
    ? []
    : [`version mismatch: ${Object.entries(sources).map(([path, value]) => `${path}=${value ?? 'missing'}`).join(', ')}`];
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) errors.push(`invalid desktop version: ${version ?? 'missing'}`);
  return { version, sources, errors };
}

export function releaseNotesSection(root, version) {
  const notes = readFileSync(join(root, 'RELEASE_NOTES.md'), 'utf8');
  const escaped = version.replace(/\./g, '\\.');
  const header = new RegExp(`^## v${escaped}\\s*$`, 'm').exec(notes);
  if (!header) return null;
  const nextHeader = notes.indexOf('\n## v', header.index + header[0].length);
  return notes.slice(header.index, nextHeader < 0 ? notes.length : nextHeader).trim();
}

export function releaseMetadataHash(root) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((path) => path && path !== 'release-prepared.json')
    .sort();
  const manifest = tracked.map((path) => {
    const full = join(root, path);
    if (!existsSync(full)) throw new Error(`tracked release source missing: ${path}`);
    return `${path}\0${sha256File(full)}`;
  }).join('\n');
  return sha256(manifest);
}

export function buildPreparedMetadata(root, preparedCommit) {
  const { version, errors } = consistentVersion(root);
  if (errors.length) throw new Error(errors.join('\n'));
  const notes = releaseNotesSection(root, version);
  if (!notes) throw new Error(`RELEASE_NOTES.md has no section for v${version}`);
  if (!/^[0-9a-f]{40}$/.test(preparedCommit)) throw new Error('preparedCommit must be a full Git SHA');
  return {
    schemaVersion: 1,
    version,
    preparedCommit,
    releaseNotesHash: sha256(notes),
    metadataHash: releaseMetadataHash(root),
  };
}

export function validatePreparedMetadata(root) {
  const markerPath = join(root, 'release-prepared.json');
  if (!existsSync(markerPath)) return { ok: false, errors: ['release-prepared.json is missing; run npm run release:prepare'] };
  let marker;
  try {
    marker = readJson(markerPath);
  } catch (error) {
    return { ok: false, errors: [`release-prepared.json is invalid JSON: ${error.message}`] };
  }
  const errors = [];
  let expected;
  try {
    expected = buildPreparedMetadata(root, marker.preparedCommit);
  } catch (error) {
    errors.push(error.message);
  }
  if (expected) {
    for (const field of ['schemaVersion', 'version', 'preparedCommit', 'releaseNotesHash', 'metadataHash']) {
      if (marker[field] !== expected[field]) errors.push(`release-prepared.json ${field} is stale`);
    }
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', marker.preparedCommit, 'HEAD'], { cwd: root, stdio: 'ignore' });
  } catch {
    errors.push('release-prepared.json preparedCommit is not an ancestor of HEAD');
  }
  return { ok: errors.length === 0, errors, marker };
}

function isPlaceholder(value) {
  return !value || /placeholder|example|unset|fork_owner|\{\{|santifer\/career-ops/i.test(String(value));
}

export function validateReleaseConfiguration(root, { production = false } = {}) {
  const errors = [];
  const release = readJson(join(root, '.fork/release.json'));
  const conf = readJson(join(root, 'desktop/src-tauri/tauri.conf.json'));
  const repository = release.repository;
  const updater = conf.plugins?.updater;

  if (conf.bundle?.createUpdaterArtifacts !== true) {
    errors.push('bundle.createUpdaterArtifacts must be true');
  }
  if (!updater?.endpoints?.length) errors.push('updater endpoint is missing');
  if (!updater?.pubkey) errors.push('updater public key is missing');

  if (production) {
    if (isPlaceholder(repository) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
      errors.push('.fork/release.json repository is unset, upstream, or placeholder');
    }
    for (const endpoint of updater?.endpoints ?? []) {
      if (isPlaceholder(endpoint) || (repository && !endpoint.includes(`github.com/${repository}/`))) {
        errors.push(`updater endpoint is not production-ready: ${endpoint}`);
      }
    }
    if (isPlaceholder(updater?.pubkey) || String(updater?.pubkey ?? '').length < 32) {
      errors.push('updater public key is unset or placeholder');
    }
  }
  return { ok: errors.length === 0, errors, repository, homebrewTap: release.homebrewTap };
}
