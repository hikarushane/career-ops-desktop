#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { externalBinaryFilename } from './sidecar-naming.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '..');
const manifest = JSON.parse(readFileSync(join(here, 'node-runtime.json'), 'utf8'));
const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  if (!args[index + 1]) throw new Error(`${name} requires a value`);
  return args[index + 1];
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJson(path, label) {
  assert(existsSync(path), `${label} is missing: ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid: ${error.message}`);
  }
}

function binaryArchitecture(path) {
  const bytes = readFileSync(path);
  assert(bytes.length >= 64, `runtime binary is too short: ${path}`);
  const magic = bytes.readUInt32BE(0);
  if (magic === 0xcffaedfe) {
    const cpu = bytes.readUInt32LE(4);
    return cpu === 0x0100000c ? 'arm64' : cpu === 0x01000007 ? 'x64' : `mach-${cpu.toString(16)}`;
  }
  if (bytes[0] === 0x7f && bytes.subarray(1, 4).toString() === 'ELF') {
    const machine = bytes.readUInt16LE(18);
    return machine === 183 ? 'arm64' : machine === 62 ? 'x64' : `elf-${machine}`;
  }
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
    const header = bytes.readUInt32LE(0x3c);
    assert(header + 6 <= bytes.length, `invalid PE header: ${path}`);
    const machine = bytes.readUInt16LE(header + 4);
    return machine === 0xaa64 ? 'arm64' : machine === 0x8664 ? 'x64' : `pe-${machine.toString(16)}`;
  }
  throw new Error(`unsupported runtime binary format: ${path}`);
}

function run(path, commandArgs, environment) {
  return execFileSync(path, commandArgs, {
    encoding: 'utf8',
    env: environment ? { ...process.env, ...environment } : process.env,
  }).trim();
}

function assertJitless(output, label) {
  const probe = JSON.parse(output);
  assert(probe.jitless === true, `${label} did not force --jitless`);
  assert(probe.eval === 2 && probe.fn === 3, `${label} disabled JavaScript eval/code generation`);
  assert(probe.wasm === 'undefined', `${label} unexpectedly enabled WebAssembly`);
}

function generatedInstalledLayout(target, launcher, runtime) {
  const windows = target.includes('windows');
  const macOS = target.includes('apple-darwin');
  if (!windows && !macOS) return undefined;
  const root = mkdtempSync(join(tmpdir(), 'careerops-generated-install-'));
  const installedLauncher = windows
    ? join(root, 'CareerOps', 'careerops-node.exe')
    : join(root, 'CareerOps.app', 'Contents', 'MacOS', 'careerops-node');
  const installedRuntime = windows
    ? join(root, 'CareerOps', 'runtime', 'careerops-node-runtime.exe')
    : join(root, 'CareerOps.app', 'Contents', 'Resources', 'runtime', 'careerops-node-runtime');
  mkdirSync(dirname(installedLauncher), { recursive: true });
  mkdirSync(dirname(installedRuntime), { recursive: true });
  copyFileSync(launcher, installedLauncher);
  copyFileSync(runtime, installedRuntime);
  if (!windows) {
    chmodSync(installedLauncher, 0o755);
    chmodSync(installedRuntime, 0o755);
  }
  return { root, launcher: installedLauncher };
}

function verifyMacRuntimeSignature(runtime) {
  execFileSync('codesign', ['--verify', '--strict', runtime], { stdio: 'pipe' });
  const result = spawnSync('codesign', ['-d', '--verbose=4', runtime], { encoding: 'utf8' });
  assert(result.status === 0, `could not inspect runtime signature: ${result.stderr}`);
  // `codesign -d` writes display output to stderr on macOS.
  const display = `${result.stdout}${result.stderr}`;
  assert(/Authority=.*Node\.js Foundation/i.test(display), 'runtime is not signed by the Node.js Foundation');
  assert(/Page size=4096/.test(display), 'runtime signature does not preserve the official 4096-byte page size');
}

async function verifyExecutable(path, label, windows) {
  assert(existsSync(path) && statSync(path).isFile(), `${label} is missing: ${path}`);
  if (!windows) await access(path, constants.X_OK);
}

async function verifyFiles({ target, runtime, launcher, launcherProbeFactory, dataService, license, metadata, seed, macApp, verifyAppSignature = true }) {
  const generated = parseJson(metadata, 'Node.js runtime metadata');
  const selectedTarget = target ?? generated.target;
  const artifact = manifest.artifacts[selectedTarget];
  assert(artifact, `no pinned runtime manifest entry for ${selectedTarget}`);

  // Check licensing before the rest so corrupt or mismatched licensing
  // produces precise guidance. The Windows archives ship LICENSE with CRLF
  // line endings, so an artifact may pin its own hash.
  const expectedLicenseHash = artifact.licenseSha256 ?? manifest.licenseSha256;
  assert(existsSync(license), `Node.js license is missing: ${license}`);
  const licenseHash = sha256(license);
  assert(licenseHash === expectedLicenseHash,
    `Node.js license checksum mismatch: expected ${expectedLicenseHash}, received ${licenseHash}`);
  assert(generated.schemaVersion === manifest.schemaVersion, 'runtime metadata schema mismatch');
  assert(generated.version === manifest.version, 'runtime metadata version mismatch');
  assert(generated.target === selectedTarget, `runtime target mismatch: expected ${selectedTarget}, received ${generated.target}`);
  assert(generated.architecture === artifact.architecture, 'runtime metadata architecture mismatch');
  assert(generated.archive === artifact.archive, 'runtime archive does not correspond to the target manifest');
  assert(generated.archiveSha256 === artifact.sha256, 'runtime archive checksum does not correspond to the target manifest');
  assert(generated.licenseSha256 === expectedLicenseHash, 'runtime metadata license checksum mismatch');
  assert(generated.jitless === true, 'runtime metadata does not require --jitless');

  const windows = selectedTarget.includes('windows');
  await verifyExecutable(runtime, 'managed Node.js runtime', windows);
  await verifyExecutable(launcher, 'careerops-node launcher', windows);
  assert(binaryArchitecture(runtime) === artifact.architecture,
    `runtime architecture mismatch for ${selectedTarget}: ${binaryArchitecture(runtime)}`);
  assert(sha256(runtime) === generated.runtimeSha256, 'runtime binary checksum does not match generated metadata');

  const expectedVersion = `v${manifest.version}`;
  assert(run(runtime, ['--jitless', '--version']) === expectedVersion, `runtime did not execute as ${expectedVersion}`);
  const probe = 'JSON.stringify({jitless:process.execArgv.includes("--jitless"),eval:eval("1+1"),fn:new Function("return 3")(),wasm:typeof WebAssembly})';
  const packagedLauncherSupported = windows || selectedTarget.includes('apple-darwin');
  const hostileEnvironment = {
    NODE_OPTIONS: '--no_jitless',
    CAREEROPS_RESOURCE_DIR: windows ? 'Z:\\attacker-controlled-runtime' : '/nonexistent/attacker-controlled-runtime',
  };
  if (packagedLauncherSupported) {
    const installedProbe = launcherProbeFactory?.();
    const launcherProbe = installedProbe?.launcher ?? launcher;
    try {
      const hostileCases = [
        { argument: undefined, nodeOptions: '--no_jitless' },
        { argument: '--no_jitless', nodeOptions: '--no_jitless' },
        { argument: '--no-jitless', nodeOptions: '--no-jitless' },
        { argument: '--nojitless', nodeOptions: '--nojitless' },
        { argument: '-nojitless', nodeOptions: '--nojitless' },
        { argument: '--jitless=false', nodeOptions: '--no_jitless' },
        { argument: '--jitless=0', nodeOptions: '--no_jitless' },
      ];
      for (const { argument, nodeOptions } of hostileCases) {
        const launcherArgs = argument ? [argument, '-p', probe] : ['-p', probe];
        assertJitless(
          run(launcherProbe, launcherArgs, { ...hostileEnvironment, NODE_OPTIONS: nodeOptions }),
          `careerops-node launcher (${argument ?? `NODE_OPTIONS=${nodeOptions}`})`,
        );
      }
      assert(existsSync(seed), `installed workspace seed is missing intake.mjs: ${seed}`);
      const selfTest = run(launcherProbe, [seed, '--self-test'], hostileEnvironment);
      assert(/self-test: \d+ passed, 0 failed/.test(selfTest), 'installed intake.mjs self-test failed');
    } finally {
      if (installedProbe) rmSync(installedProbe.root, { recursive: true, force: true });
    }
  } else {
    assertJitless(run(runtime, ['--jitless', '-p', probe]), 'managed Node.js runtime');
    const launcherFailure = spawnSync(launcher, ['-p', probe], { encoding: 'utf8', env: process.env });
    assert(launcherFailure.status !== 0, 'unsupported packaged launcher did not fail closed');
    assert(/managed JavaScript runtime unavailable/i.test(launcherFailure.stderr),
      'unsupported packaged launcher did not explain that the managed runtime is unavailable');
    assert(existsSync(seed), `installed workspace seed is missing intake.mjs: ${seed}`);
    const selfTest = run(runtime, ['--jitless', seed, '--self-test']);
    assert(/self-test: \d+ passed, 0 failed/.test(selfTest), 'installed intake.mjs self-test failed');
  }
  if (dataService) {
    await verifyExecutable(dataService, 'career-data sidecar', windows);
    const noPath = windows ? 'C:\\CareerOps-no-PATH' : '/nonexistent';
    const workspace = mkdtempSync(join(tmpdir(), 'careerops-installed-workspace-'));
    try {
      mkdirSync(join(workspace, 'config'));
      writeFileSync(join(workspace, 'config', 'profile.yml'), 'language:\n  analysis: de\n');
      const settings = JSON.parse(run(dataService, ['language-settings', '--path', workspace], {
        PATH: noPath,
        NODE_OPTIONS: '--no_jitless',
        CAREEROPS_RESOURCE_DIR: windows ? 'Z:\\attacker-controlled-runtime' : '/nonexistent/attacker-controlled-runtime',
      }));
      assert(settings.analysisLanguage === 'de', 'installed career-data could not run packaged scripts against an existing workspace without Node on PATH');
      assert(!existsSync(join(workspace, 'node_modules')), 'installed runtime smoke unexpectedly populated the user workspace');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }

  if (selectedTarget.includes('apple-darwin')) verifyMacRuntimeSignature(runtime);
  if (macApp && verifyAppSignature) execFileSync('codesign', ['--verify', '--deep', '--strict', macApp], { stdio: 'pipe' });
  console.log(`Verified packaged Node.js ${manifest.version} runtime, license, launcher, architecture, and intake seed for ${selectedTarget}.`);
}

async function main() {
  if (args.includes('--generated')) {
    const binaries = resolve(option('--binaries') ?? join(desktop, 'src-tauri', 'binaries'));
    const target = option('--target');
    const metadata = join(binaries, 'node-runtime.json');
    const generated = existsSync(metadata) ? parseJson(metadata, 'Node.js runtime metadata') : {};
    const selectedTarget = target ?? generated.target;
    assert(selectedTarget, '--target is required when generated metadata is unavailable');
    const windows = selectedTarget.includes('windows');
    const runtime = join(binaries, 'runtime', `careerops-node-runtime${windows ? '.exe' : ''}`);
    const launcher = join(binaries, externalBinaryFilename('careerops-node', selectedTarget));
    await verifyFiles({
      target: selectedTarget,
      runtime,
      launcher,
      launcherProbeFactory: () => generatedInstalledLayout(selectedTarget, launcher, runtime),
      license: join(binaries, 'node-LICENSE'),
      metadata,
      seed: join(binaries, 'workspace-seed', 'intake.mjs'),
    });
    return;
  }

  const app = option('--app');
  if (app) {
    const appPath = resolve(app);
    await verifyFiles({
      runtime: join(appPath, 'Contents', 'Resources', 'runtime', 'careerops-node-runtime'),
      launcher: join(appPath, 'Contents', 'MacOS', 'careerops-node'),
      dataService: join(appPath, 'Contents', 'MacOS', 'career-data'),
      license: join(appPath, 'Contents', 'Resources', 'licenses', 'Node.js-LICENSE.txt'),
      metadata: join(appPath, 'Contents', 'Resources', 'runtime', 'node-runtime.json'),
      seed: join(appPath, 'Contents', 'Resources', 'workspace-seed', 'intake.mjs'),
      macApp: appPath,
      verifyAppSignature: !args.includes('--allow-unsigned-app'),
    });
    return;
  }

  const installDir = option('--install-dir');
  if (installDir) {
    const root = resolve(installDir);
    await verifyFiles({
      runtime: join(root, 'runtime', 'careerops-node-runtime.exe'),
      launcher: join(root, 'careerops-node.exe'),
      dataService: join(root, 'career-data.exe'),
      license: join(root, 'licenses', 'Node.js-LICENSE.txt'),
      metadata: join(root, 'runtime', 'node-runtime.json'),
      seed: join(root, 'workspace-seed', 'intake.mjs'),
    });
    return;
  }
  throw new Error('usage: verify-packaged-runtime.mjs --generated | --app <path> | --install-dir <path>');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
