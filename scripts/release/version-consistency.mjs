#!/usr/bin/env node
// Validates that all fork version sources are in sync.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const DESKTOP = join(ROOT, 'desktop');

function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }

const sources = {};

const pkg = readJson(join(DESKTOP, 'package.json'));
sources['desktop/package.json'] = pkg.version;

const conf = readJson(join(DESKTOP, 'src-tauri', 'tauri.conf.json'));
sources['desktop/src-tauri/tauri.conf.json'] = conf.version;

const cargo = readFileSync(join(DESKTOP, 'src-tauri', 'Cargo.toml'), 'utf8');
const m = cargo.match(/^version\s*=\s*"([^"]+)"/m);
sources['desktop/src-tauri/Cargo.toml'] = m ? m[1] : 'PARSE_ERROR';

const versions = Object.values(sources);
const unique = [...new Set(versions)];
const ok = unique.length === 1;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok, version: ok ? unique[0] : null, sources }));
} else {
  for (const [file, ver] of Object.entries(sources)) {
    console.log(`  ${ok ? 'OK' : 'MISMATCH'}  ${ver}  ${file}`);
  }
}

if (!ok) {
  console.error('Version mismatch detected!');
  process.exit(1);
}
