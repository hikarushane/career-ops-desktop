#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const desktop = join(root, 'desktop');
const tauri = join(desktop, 'src-tauri');
const skipRootTests = process.argv.includes('--skip-root-tests');
const skipPackage = process.argv.includes('--skip-package');

function run(command, args, cwd = root) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

if (!skipRootTests) run(process.execPath, ['test-all.mjs']);
run('go', ['test', './...'], join(root, 'dashboard'));
run('npm', ['run', 'build'], desktop);
run('npm', ['test'], desktop);
run('npm', ['run', 'build:sidecar'], desktop);
run('cargo', ['check', '--locked'], tauri);
run('cargo', ['test', '--locked'], tauri);
run(process.execPath, ['scripts/release/version-consistency.mjs']);
run(process.execPath, ['scripts/release/validate-metadata.mjs']);
run('git', ['diff', '--check']);

if (!skipPackage && process.platform === 'darwin') {
  run('npx', [
    'tauri', 'build', '--ci', '--bundles', 'dmg',
    '--config', 'src-tauri/tauri.unsigned.conf.json',
  ], desktop);
  const bundle = join(tauri, 'target', 'release', 'bundle', 'dmg');
  if (!existsSync(bundle)) throw new Error('macOS DMG output directory was not created');
} else if (!skipPackage) {
  console.log('Packaging runtime deferred to macos-latest/windows-latest; static readiness passed.');
}
