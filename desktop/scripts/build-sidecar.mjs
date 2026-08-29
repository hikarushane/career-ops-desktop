// Builds the Go sidecar and names it the way Tauri expects: the binary
// declared in bundle.externalBin must exist as <name>-<target-triple>.
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { externalBinaryFilename, sidecarFilename } from './sidecar-naming.mjs';
import { prepareWorkspaceSeed } from './workspace-seed.mjs';

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
const filename = sidecarFilename(triple);
const staged = join(outDir, `.${filename}.${process.pid}.tmp`);
const target = join(outDir, filename);
const runtimeFilename = externalBinaryFilename('careerops-node', triple);
const stagedRuntime = join(outDir, `.${runtimeFilename}.${process.pid}.tmp`);
const runtimeTarget = join(outDir, runtimeFilename);
const stagedLicense = join(outDir, `.node-LICENSE.${process.pid}.tmp`);
const licenseTarget = join(outDir, 'node-LICENSE');

const seed = prepareWorkspaceSeed();
console.log(`workspace seed: ${seed.output} (${seed.files} files)`);

mkdirSync(outDir, { recursive: true });
execFileSync('go', ['build', '-o', staged, './cmd/career-data'], {
  cwd: goDir,
  stdio: 'inherit',
});

rmSync(target, { force: true });
renameSync(staged, target);

console.log(`sidecar: ${target}`);

copyFileSync(process.execPath, stagedRuntime);
if (process.platform !== 'win32') chmodSync(stagedRuntime, 0o755);
rmSync(runtimeTarget, { force: true });
renameSync(stagedRuntime, runtimeTarget);

const nodeVersion = process.versions.node;
const licenseUrl = `https://raw.githubusercontent.com/nodejs/node/v${nodeVersion}/LICENSE`;
const licenseResponse = await fetch(licenseUrl);
if (!licenseResponse.ok) {
  throw new Error(`could not retrieve the Node.js ${nodeVersion} license: HTTP ${licenseResponse.status}`);
}
const nodeLicense = await licenseResponse.text();
if (nodeLicense.length < 10_000 || !nodeLicense.includes('Node.js contributors')) {
  throw new Error(`Node.js ${nodeVersion} returned an invalid license document`);
}
writeFileSync(stagedLicense, nodeLicense, 'utf8');
rmSync(licenseTarget, { force: true });
renameSync(stagedLicense, licenseTarget);

console.log(`managed JavaScript runtime: ${runtimeTarget} (${process.version})`);
