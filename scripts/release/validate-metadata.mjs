#!/usr/bin/env node
import { resolve } from 'node:path';
import { consistentVersion, validatePreparedMetadata, validateReleaseConfiguration } from './release-lib.mjs';

const root = resolve(import.meta.dirname, '../..');
const production = process.argv.includes('--production');
const prepared = process.argv.includes('--prepared');
const json = process.argv.includes('--json');
const version = consistentVersion(root);
const config = validateReleaseConfiguration(root, { production });
const preparation = prepared ? validatePreparedMetadata(root) : { ok: true, errors: [] };
const errors = [...version.errors, ...config.errors, ...preparation.errors];
const result = { ok: errors.length === 0, version: version.version, production, prepared, errors };

if (json) console.log(JSON.stringify(result));
else if (result.ok) console.log(`release metadata valid for v${result.version}`);
else for (const error of errors) console.error(`RELEASE ERROR: ${error}`);
if (!result.ok) process.exit(1);
