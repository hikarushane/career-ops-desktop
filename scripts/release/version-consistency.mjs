#!/usr/bin/env node
// Validates that all fork version sources are in sync.
import { resolve } from 'node:path';
import { consistentVersion } from './release-lib.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const { sources, version, errors } = consistentVersion(ROOT);
const ok = errors.length === 0;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok, version: ok ? version : null, sources, errors }));
} else {
  for (const [file, ver] of Object.entries(sources)) {
    console.log(`  ${ok ? 'OK' : 'MISMATCH'}  ${ver}  ${file}`);
  }
}

if (!ok) {
  console.error('Version mismatch detected!');
  process.exit(1);
}
