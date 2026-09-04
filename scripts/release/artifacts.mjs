#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../../lib/is-main-module.mjs';
import { releaseNotesSection } from './release-lib.mjs';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function one(files, predicate, label) {
  const matches = files.filter(predicate);
  if (matches.length !== 1) throw new Error(`expected one ${label}, found ${matches.length}`);
  return matches[0];
}

export function updaterPlatformFromTriple(triple) {
  if (/^aarch64-apple-darwin$/.test(triple)) return 'darwin-aarch64';
  if (/^x86_64-apple-darwin$/.test(triple)) return 'darwin-x86_64';
  if (/^x86_64-pc-windows-msvc$/.test(triple)) return 'windows-x86_64';
  if (/^aarch64-pc-windows-msvc$/.test(triple)) return 'windows-aarch64';
  throw new Error(`unsupported updater target triple: ${triple}`);
}

export function checksumLines(dir, filenames) {
  return [...filenames].sort().map((filename) => {
    const digest = createHash('sha256').update(readFileSync(join(dir, filename))).digest('hex');
    return `${digest}  ${filename}`;
  }).join('\n') + '\n';
}

export function collectArtifacts({ platform, bundleDir, outputDir, version, targetTriple }) {
  mkdirSync(outputDir, { recursive: true });
  const files = walk(bundleDir);
  const copied = [];
  const copy = (source, destination) => {
    copyFileSync(source, join(outputDir, destination));
    copied.push(destination);
  };

  if (platform === 'macos') {
    copy(one(files, (path) => path.endsWith('.dmg'), 'DMG'), `CareerOps_${version}_macOS.dmg`);
    const archive = one(files, (path) => path.endsWith('.app.tar.gz'), 'macOS updater archive');
    copy(archive, `CareerOps_${version}_macOS.app.tar.gz`);
    copy(one(files, (path) => path === `${archive}.sig` || path.endsWith('.app.tar.gz.sig'), 'macOS updater signature'), `CareerOps_${version}_macOS.app.tar.gz.sig`);
  } else if (platform === 'windows') {
    copy(one(files, (path) => path.endsWith('.exe'), 'NSIS installer'), `CareerOps_${version}_Windows.exe`);
    const archive = one(files, (path) => path.endsWith('.nsis.zip'), 'Windows updater archive');
    copy(archive, `CareerOps_${version}_Windows.nsis.zip`);
    copy(one(files, (path) => path === `${archive}.sig` || path.endsWith('.nsis.zip.sig'), 'Windows updater signature'), `CareerOps_${version}_Windows.nsis.zip.sig`);
  } else {
    throw new Error(`unknown platform: ${platform}`);
  }
  writeFileSync(join(outputDir, `${platform}-target.json`), `${JSON.stringify({ platform: updaterPlatformFromTriple(targetTriple) })}\n`);
  return copied;
}

/**
 * Assembles the public release set from the collected platform artifacts.
 * macOS is required. Windows is optional: when the Windows build is not
 * part of the release (0.5.0 ships macOS only), its files are simply absent
 * and latest.json / provenance / SHA256SUMS list the macOS platform alone. A
 * partial Windows set (some files but not all) is an error, never a silent
 * macOS-only release.
 */
export function finalizeArtifacts({ root, assetsDir, version, repository, gitSha, upstreamSha }) {
  const macDmg = `CareerOps_${version}_macOS.dmg`;
  const winExe = `CareerOps_${version}_Windows.exe`;
  const macArchive = `CareerOps_${version}_macOS.app.tar.gz`;
  const winArchive = `CareerOps_${version}_Windows.nsis.zip`;
  const macSignature = `${macArchive}.sig`;
  const winSignature = `${winArchive}.sig`;
  for (const filename of [macDmg, macArchive, macSignature, 'macos-target.json']) {
    if (!existsSync(join(assetsDir, filename))) throw new Error(`required release artifact missing: ${filename}`);
  }
  const windowsFiles = [winExe, winArchive, winSignature, 'windows-target.json'];
  const windowsPresent = windowsFiles.filter((filename) => existsSync(join(assetsDir, filename)));
  if (windowsPresent.length > 0 && windowsPresent.length < windowsFiles.length) {
    const missing = windowsFiles.filter((filename) => !windowsPresent.includes(filename));
    throw new Error(`incomplete Windows release artifacts, missing: ${missing.join(', ')}`);
  }
  const withWindows = windowsPresent.length === windowsFiles.length;

  const macZip = `CareerOps-macOS-${version}.zip`;
  const winZip = `CareerOps-Windows-${version}.zip`;
  execFileSync('zip', ['-jq', macZip, macDmg], { cwd: assetsDir });
  if (withWindows) execFileSync('zip', ['-jq', winZip, winExe], { cwd: assetsDir });

  const section = releaseNotesSection(root, version) ?? '';
  const base = `https://github.com/${repository}/releases/download/desktop-v${version}`;
  const macPlatform = JSON.parse(readFileSync(join(assetsDir, 'macos-target.json'), 'utf8')).platform;
  const platforms = {
    [macPlatform]: { signature: readFileSync(join(assetsDir, macSignature), 'utf8').trim(), url: `${base}/${macArchive}` },
  };
  const buildPlatforms = [macPlatform];
  if (withWindows) {
    const winPlatform = JSON.parse(readFileSync(join(assetsDir, 'windows-target.json'), 'utf8')).platform;
    platforms[winPlatform] = { signature: readFileSync(join(assetsDir, winSignature), 'utf8').trim(), url: `${base}/${winArchive}` };
    buildPlatforms.push(winPlatform);
  }
  const latest = { version, notes: section, pub_date: new Date().toISOString(), platforms };
  writeFileSync(join(assetsDir, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`);
  const provenance = { version, gitSha, upstreamSha, buildPlatforms };
  writeFileSync(join(assetsDir, 'release-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  writeFileSync(join(assetsDir, 'CURRENT_RELEASE_NOTES.md'), `${section}\n`);

  const publicFiles = [
    macDmg, macArchive, macZip,
    ...(withWindows ? [winExe, winArchive, winZip] : []),
    'latest.json', 'release-provenance.json',
  ];
  writeFileSync(join(assetsDir, 'SHA256SUMS.txt'), checksumLines(assetsDir, publicFiles));
  return publicFiles;
}

if (isMainModule(import.meta.url)) {
  const command = process.argv[2];
  if (command === 'collect') {
    const copied = collectArtifacts({
      platform: arg('--platform'),
      bundleDir: resolve(arg('--bundle-dir')),
      outputDir: resolve(arg('--output')),
      version: arg('--version'),
      targetTriple: arg('--target'),
    });
    console.log(copied.join('\n'));
  } else if (command === 'finalize') {
    finalizeArtifacts({
      root: resolve(import.meta.dirname, '../..'),
      assetsDir: resolve(arg('--assets-dir')),
      version: arg('--version'),
      repository: arg('--repository'),
      gitSha: arg('--git-sha'),
      upstreamSha: arg('--upstream-sha'),
    });
    console.log('release assets finalized');
  } else {
    console.error('usage: artifacts.mjs collect|finalize ...');
    process.exit(2);
  }
}
