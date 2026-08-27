#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isMainModule } from '../../lib/is-main-module.mjs';

export function isProtectedPath(path, protectedPaths) {
  return protectedPaths.some((entry) => entry.endsWith('/')
    ? path.startsWith(entry)
    : path === entry || path.startsWith(entry));
}

export function protectedChanges(root, base, head = 'HEAD') {
  const config = JSON.parse(readFileSync(resolve(root, '.fork/protected-paths.json'), 'utf8'));
  const output = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], {
    cwd: root,
    encoding: 'utf8',
  });
  return output.split('\n').filter(Boolean).filter((path) => isProtectedPath(path, config.protected));
}

if (isMainModule(import.meta.url)) {
  const root = resolve(import.meta.dirname, '../..');
  const baseIndex = process.argv.indexOf('--base');
  const headIndex = process.argv.indexOf('--head');
  const base = baseIndex >= 0 ? process.argv[baseIndex + 1] : null;
  const head = headIndex >= 0 ? process.argv[headIndex + 1] : 'HEAD';
  if (!base) {
    console.error('usage: protected-paths.mjs --base <sha> [--head <sha>] [--check]');
    process.exit(2);
  }
  const hits = protectedChanges(root, base, head);
  console.log(JSON.stringify(hits));
  if (process.argv.includes('--check') && hits.length) process.exit(1);
}
