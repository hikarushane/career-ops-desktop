import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../../lib/is-main-module.mjs';
import { extractArrayFromSource } from '../../update-system.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '..');
const repoRoot = resolve(desktop, '..');
const defaultOutput = join(desktop, 'src-tauri', 'binaries', 'workspace-seed');
const normalizedTimestamp = new Date('2000-01-01T00:00:00.000Z');
const packagedDependencies = {
  'js-yaml': '5.4.1',
  argparse: '2.0.1',
};

const excludedPrefixes = [
  '.fork/',
  '.github/',
  '.githooks/',
  'dashboard/',
  'desktop/',
  'docs/',
  'examples/',
  'evals/',
  'packaging/',
  'scaffolder/',
  'scripts/release/',
  'test-fixtures/',
  'tests/',
];

const excludedFiles = new Set([
  '.all-contributorsrc',
  '.dockerignore',
  'Dockerfile',
  'docker-compose.yml',
  'playwright.cv.config.mjs',
  'release-prepared.json',
  'test-all.mjs',
  'upgrade-tests.mjs',
]);

function normalized(path) {
  return path.split(sep).join('/').replace(/^\.\//, '');
}

function isRuntimePath(path) {
  const value = normalized(path);
  if (!value || excludedFiles.has(value)) return false;
  if (excludedPrefixes.some((prefix) => value === prefix.slice(0, -1) || value.startsWith(prefix))) {
    return false;
  }
  const name = value.slice(value.lastIndexOf('/') + 1);
  return !(
    name.endsWith('.test.mjs')
    || name.endsWith('-tests.mjs')
    || name.startsWith('test-')
  );
}

function collectFiles(source, repoRelative, files) {
  if (!isRuntimePath(repoRelative) || !existsSync(source)) return;
  const stat = statSync(source);
  if (stat.isFile()) {
    files.set(normalized(repoRelative), { source, mode: stat.mode });
    return;
  }
  if (!stat.isDirectory()) return;

  for (const name of readdirSync(source).sort()) {
    collectFiles(join(source, name), join(repoRelative, name), files);
  }
}

function updaterSystemPaths() {
  const source = readFileSync(join(repoRoot, 'update-system.mjs'), 'utf8');
  const paths = extractArrayFromSource(source, 'SYSTEM_PATHS');
  if (paths.length === 0) throw new Error('could not read SYSTEM_PATHS from update-system.mjs');
  return paths;
}

export function prepareWorkspaceSeed() {
  const target = defaultOutput;
  const staging = join(dirname(target), `.${target.slice(target.lastIndexOf(sep) + 1)}.${process.pid}.tmp`);
  const files = new Map();
  for (const path of updaterSystemPaths()) {
    const clean = normalized(path).replace(/\/$/, '');
    collectFiles(join(repoRoot, clean), clean, files);
  }
  for (const [name, version] of Object.entries(packagedDependencies)) {
    const source = join(repoRoot, 'node_modules', name);
    if (!existsSync(source)) {
      throw new Error(`workspace runtime dependency ${name}@${version} is missing; run npm ci --ignore-scripts in the repository root before the release build`);
    }
    const packageJson = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    if (packageJson.version !== version || !existsSync(join(source, 'LICENSE'))) {
      throw new Error(`workspace runtime dependency ${name} must be the licensed pinned version ${version}`);
    }
    collectFiles(source, join('node_modules', name), files);
  }

  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  writeFileSync(join(staging, '.gitkeep'), '');
  const directories = new Set([staging]);
  for (const [path, file] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const destination = join(staging, path);
    mkdirSync(dirname(destination), { recursive: true });
    directories.add(dirname(destination));
    copyFileSync(file.source, destination);
    chmodSync(destination, file.mode);
    utimesSync(destination, normalizedTimestamp, normalizedTimestamp);
  }
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
    utimesSync(directory, normalizedTimestamp, normalizedTimestamp);
  }

  rmSync(target, { recursive: true, force: true });
  renameSync(staging, target);
  return { output: target, files: files.size };
}

if (isMainModule(import.meta.url)) {
  if (process.argv.length > 2) {
    throw new Error('workspace seed output is fixed; output overrides and arguments are not supported');
  }
  const result = prepareWorkspaceSeed();
  console.log(`workspace seed: ${relative(desktop, result.output)} (${result.files} files)`);
}
