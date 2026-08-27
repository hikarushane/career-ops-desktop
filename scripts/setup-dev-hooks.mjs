#!/usr/bin/env node
// Sets up the project's tracked Git hooks from .githooks/.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const HOOKS_DIR = join(ROOT, '.githooks');

if (!existsSync(HOOKS_DIR)) {
  console.error('.githooks/ directory not found');
  process.exit(1);
}

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
  cwd: ROOT,
  stdio: 'inherit',
});

for (const f of readdirSync(HOOKS_DIR)) {
  const p = join(HOOKS_DIR, f);
  try { chmodSync(p, 0o755); } catch { /* ignore on Windows */ }
}

console.log('Git hooks configured: core.hooksPath = .githooks');
console.log('Hooks:', readdirSync(HOOKS_DIR).join(', '));
