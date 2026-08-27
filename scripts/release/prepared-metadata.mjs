#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPreparedMetadata, validatePreparedMetadata } from './release-lib.mjs';

const root = resolve(import.meta.dirname, '../..');
const [command, ...args] = process.argv.slice(2);

if (command === 'create') {
  const baseIndex = args.indexOf('--base');
  const base = baseIndex >= 0 ? args[baseIndex + 1] : null;
  if (!base) throw new Error('create requires --base <full-sha>');
  const metadata = buildPreparedMetadata(root, base);
  writeFileSync(resolve(root, 'release-prepared.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`release-prepared.json created for v${metadata.version}`);
} else if (command === 'validate') {
  const result = validatePreparedMetadata(root);
  if (!result.ok) {
    for (const error of result.errors) console.error(`RELEASE ERROR: ${error}`);
    process.exit(1);
  }
  console.log(`release preparation valid for v${result.marker.version}`);
} else {
  console.error('usage: prepared-metadata.mjs create --base <sha> | validate');
  process.exit(2);
}
