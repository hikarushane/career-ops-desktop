#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isMainModule } from '../../lib/is-main-module.mjs';

export function renderCask(source, { version, url, sha256 }) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('Homebrew cask requires a real SHA256');
  let rendered = source
    .replace(/^\s*version\s+"[^"]+"/m, `  version "${version}"`)
    .replace(/^\s*sha256\s+(?::no_check|"[^"]+")/m, `  sha256 "${sha256}"`)
    .replace(/^\s*url\s+"[^"]+"/m, `  url "${url}"`);
  const repositoryUrl = url.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)\/releases\//)?.[1];
  if (repositoryUrl) rendered = rendered.replace(/^\s*homepage\s+"[^"]+"/m, `  homepage "${repositoryUrl}"`);
  if (rendered === source) throw new Error('cask template did not contain replaceable release fields');
  return rendered;
}

if (isMainModule(import.meta.url)) {
  const value = (name) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
  };
  const file = resolve(value('--file'));
  const rendered = renderCask(readFileSync(file, 'utf8'), {
    version: value('--version'),
    url: value('--url'),
    sha256: value('--sha256'),
  });
  writeFileSync(file, rendered);
  console.log(`updated ${file}`);
}
