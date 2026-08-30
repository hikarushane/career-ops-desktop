// Builds the Go sidecar and names it the way Tauri expects: the binary
// declared in bundle.externalBin must exist as <name>-<target-triple>.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, renameSync, rmSync, writeFileSync, writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { externalBinaryFilename, sidecarFilename } from './sidecar-naming.mjs';
import { prepareWorkspaceSeed } from './workspace-seed.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '..');
const repoRoot = resolve(desktop, '..');
const goDir = join(repoRoot, 'dashboard');
const outDir = join(desktop, 'src-tauri', 'binaries');
const runtimeManifest = JSON.parse(readFileSync(join(here, 'node-runtime.json'), 'utf8'));

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assertPinnedPath(path, label) {
  if (!path || typeof path !== 'string' || isAbsolute(path) || path.split(/[\\/]/).includes('..')) {
    throw new Error(`${label} must be a safe archive-relative path`);
  }
}

async function pinnedArchive(artifact) {
  const cacheDir = join(outDir, '.runtime-cache');
  const cached = join(cacheDir, artifact.archive);
  mkdirSync(cacheDir, { recursive: true });
  if (existsSync(cached) && sha256(cached) === artifact.sha256) return cached;
  rmSync(cached, { force: true });

  const staged = `${cached}.${process.pid}.tmp`;
  rmSync(staged, { force: true });
  const url = `${runtimeManifest.baseUrl}/${artifact.archive}`;
  let fd;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > runtimeManifest.maxArchiveBytes) {
      throw new Error(`archive exceeds ${runtimeManifest.maxArchiveBytes} bytes`);
    }

    fd = openSync(staged, 'wx');
    const digest = createHash('sha256');
    let received = 0;
    for await (const chunk of response.body) {
      received += chunk.length;
      if (received > runtimeManifest.maxArchiveBytes) {
        throw new Error(`archive exceeds ${runtimeManifest.maxArchiveBytes} bytes`);
      }
      digest.update(chunk);
      writeSync(fd, chunk);
    }
    closeSync(fd);
    fd = undefined;
    const actual = digest.digest('hex');
    if (actual !== artifact.sha256) {
      throw new Error(`archive checksum mismatch: expected ${artifact.sha256}, received ${actual}`);
    }
    renameSync(staged, cached);
    return cached;
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    rmSync(staged, { force: true });
    throw new Error(
      `could not materialize pinned Node.js ${runtimeManifest.version} archive ${artifact.archive}; `
      + `a verified cache at ${cached} permits offline builds: ${error.message}`,
    );
  }
}

function hostTriple() {
  const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  const match = out.match(/^host: (.+)$/m);
  if (!match) {
    throw new Error('could not read the host triple from `rustc -vV`');
  }
  return match[1].trim();
}

function installedLauncherLayout(launcher, runtimePath) {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return undefined;
  const root = mkdtempSync(join(tmpdir(), 'careerops-installed-launcher-'));
  const installedLauncher = process.platform === 'darwin'
    ? join(root, 'CareerOps.app', 'Contents', 'MacOS', 'careerops-node')
    : join(root, 'CareerOps', 'careerops-node.exe');
  const installedRuntime = process.platform === 'darwin'
    ? join(root, 'CareerOps.app', 'Contents', 'Resources', 'runtime', 'careerops-node-runtime')
    : join(root, 'CareerOps', 'runtime', 'careerops-node-runtime.exe');
  mkdirSync(dirname(installedLauncher), { recursive: true });
  mkdirSync(dirname(installedRuntime), { recursive: true });
  copyFileSync(launcher, installedLauncher);
  copyFileSync(runtimePath, installedRuntime);
  if (process.platform !== 'win32') {
    chmodSync(installedLauncher, 0o755);
    chmodSync(installedRuntime, 0o755);
  }
  return { root, launcher: installedLauncher };
}

const triple = hostTriple();
const artifact = runtimeManifest.artifacts[triple];
if (!artifact) throw new Error(`no pinned Node.js runtime for Rust target ${triple}`);
for (const [path, label] of [[artifact.archive, 'archive'], [artifact.binary, 'binary'], [artifact.license, 'license']]) {
  assertPinnedPath(path, label);
}
const filename = sidecarFilename(triple);
const staged = join(outDir, `.${filename}.${process.pid}.tmp`);
const target = join(outDir, filename);
const launcherFilename = externalBinaryFilename('careerops-node', triple);
const stagedLauncher = join(outDir, `.${launcherFilename}.${process.pid}.tmp`);
const launcherTarget = join(outDir, launcherFilename);
const runtimeFilename = process.platform === 'win32' ? 'careerops-node-runtime.exe' : 'careerops-node-runtime';
const runtimeDir = join(outDir, 'runtime');
const stagedRuntime = join(runtimeDir, `.${runtimeFilename}.${process.pid}.tmp`);
const runtimeTarget = join(runtimeDir, runtimeFilename);
const stagedLicense = join(outDir, `.node-LICENSE.${process.pid}.tmp`);
const licenseTarget = join(outDir, 'node-LICENSE');
const stagedMetadata = join(outDir, `.node-runtime.json.${process.pid}.tmp`);
const metadataTarget = join(outDir, 'node-runtime.json');

const seed = prepareWorkspaceSeed();
console.log(`workspace seed: ${seed.output} (${seed.files} files)`);

mkdirSync(outDir, { recursive: true });
mkdirSync(runtimeDir, { recursive: true });
execFileSync('go', ['build', '-o', staged, './cmd/career-data'], {
  cwd: goDir,
  stdio: 'inherit',
});

rmSync(target, { force: true });
renameSync(staged, target);

console.log(`sidecar: ${target}`);

const archive = await pinnedArchive(artifact);
const extracted = mkdtempSync(join(tmpdir(), 'careerops-node-runtime-'));
try {
  execFileSync('tar', ['-xf', archive, '-C', extracted, artifact.binary, artifact.license], {
    stdio: 'inherit',
  });
  copyFileSync(join(extracted, artifact.binary), stagedRuntime);
  copyFileSync(join(extracted, artifact.license), stagedLicense);
} finally {
  rmSync(extracted, { recursive: true, force: true });
}
if (process.platform !== 'win32') chmodSync(stagedRuntime, 0o755);
rmSync(runtimeTarget, { force: true });
renameSync(stagedRuntime, runtimeTarget);

const licenseHash = sha256(stagedLicense);
if (licenseHash !== runtimeManifest.licenseSha256) {
  throw new Error(`Node.js license checksum mismatch: expected ${runtimeManifest.licenseSha256}, received ${licenseHash}`);
}
rmSync(licenseTarget, { force: true });
renameSync(stagedLicense, licenseTarget);

const expectedVersion = `v${runtimeManifest.version}`;
const actualVersion = execFileSync(runtimeTarget, ['--jitless', '--version'], { encoding: 'utf8' }).trim();
if (actualVersion !== expectedVersion) {
  throw new Error(`Node.js runtime version mismatch: expected ${expectedVersion}, received ${actualVersion}`);
}
const compatibility = JSON.parse(execFileSync(runtimeTarget, [
  '--jitless',
  '-p',
  'JSON.stringify({jitless:process.execArgv.includes("--jitless"),eval:eval("1+1"),fn:new Function("return 3")(),wasm:typeof WebAssembly})',
], { encoding: 'utf8' }).trim());
if (!compatibility.jitless || compatibility.eval !== 2 || compatibility.fn !== 3 || compatibility.wasm !== 'undefined') {
  throw new Error(`Node.js --jitless compatibility probe failed: ${JSON.stringify(compatibility)}`);
}

execFileSync('go', ['build', '-trimpath', '-o', stagedLauncher, './cmd/careerops-node'], {
  cwd: goDir,
  stdio: 'inherit',
});
rmSync(launcherTarget, { force: true });
renameSync(stagedLauncher, launcherTarget);

const metadata = {
  schemaVersion: runtimeManifest.schemaVersion,
  version: runtimeManifest.version,
  target: triple,
  architecture: artifact.architecture,
  archive: artifact.archive,
  archiveSha256: artifact.sha256,
  runtimeSha256: sha256(runtimeTarget),
  licenseSha256: licenseHash,
  jitless: true,
};
writeFileSync(stagedMetadata, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
rmSync(metadataTarget, { force: true });
renameSync(stagedMetadata, metadataTarget);

const installed = installedLauncherLayout(launcherTarget, runtimeTarget);
if (installed) {
  try {
    const expression = 'JSON.stringify({jitless:process.execArgv.includes("--jitless"),eval:eval("1+1"),fn:new Function("return 3")(),wasm:typeof WebAssembly})';
    for (const override of [undefined, '--no_jitless', '--no-jitless', '--jitless=false', '--jitless=0']) {
      const launcherArgs = override ? [override, '-p', expression] : ['-p', expression];
      const launcherProbe = JSON.parse(execFileSync(installed.launcher, launcherArgs, {
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_OPTIONS: '--no_jitless',
          CAREEROPS_RESOURCE_DIR: join(installed.root, 'attacker-controlled-runtime'),
        },
      }).trim());
      if (!launcherProbe.jitless || launcherProbe.eval !== 2 || launcherProbe.fn !== 3 || launcherProbe.wasm !== 'undefined') {
        throw new Error(`careerops-node launcher did not enforce --jitless against ${override ?? 'ambient NODE_OPTIONS'}: ${JSON.stringify(launcherProbe)}`);
      }
    }
  } finally {
    rmSync(installed.root, { recursive: true, force: true });
  }
}

console.log(`managed JavaScript runtime: ${runtimeTarget} (${actualVersion}, pinned ${artifact.archive})`);
console.log(`managed JavaScript launcher: ${launcherTarget} (--jitless enforced)`);
