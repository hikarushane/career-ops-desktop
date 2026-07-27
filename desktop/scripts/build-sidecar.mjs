// Builds the Go sidecar and names it the way Tauri expects: the binary
// declared in bundle.externalBin must exist as <name>-<target-triple>.
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '..');
const repoRoot = resolve(desktop, '..');
const goDir = join(repoRoot, 'dashboard');
const outDir = join(desktop, 'src-tauri', 'binaries');

function hostTriple() {
  const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  const match = out.match(/^host: (.+)$/m);
  if (!match) {
    throw new Error('could not read the host triple from `rustc -vV`');
  }
  return match[1].trim();
}

const triple = hostTriple();
const staged = join(goDir, 'career-data-build');

rmSync(staged, { force: true });
execFileSync('go', ['build', '-o', staged, './cmd/career-data'], {
  cwd: goDir,
  stdio: 'inherit',
});

mkdirSync(outDir, { recursive: true });
const target = join(outDir, `career-data-${triple}`);
copyFileSync(staged, target);
rmSync(staged, { force: true });

console.log(`sidecar: ${target}`);
