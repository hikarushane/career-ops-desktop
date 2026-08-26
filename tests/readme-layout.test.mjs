import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pass, fail, ROOT } from './helpers.mjs';
import { reconcileReadmeLayout } from '../update-system.mjs';

console.log('\nREADME layout — canonical translation archive');

function check(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

const translationDir = join(ROOT, 'docs', 'readme-translations');
const rootTranslations = readdirSync(ROOT).filter((name) => /^README\.[A-Za-z-]+\.md$/.test(name));
const translations = readdirSync(translationDir).filter((name) => /^README\.[A-Za-z-]+\.md$/.test(name));
check(rootTranslations.length === 0 && existsSync(join(ROOT, 'README.md')), 'fresh tracked layout keeps only README.md at repository root');
check(translations.length >= 16, 'all translated READMEs live in the canonical translation directory');
check(readFileSync(join(ROOT, 'README.md'), 'utf-8').includes('docs/readme-translations/README.de.md'), 'root README navigation points to canonical translations');

for (const filename of translations) {
  const path = join(translationDir, filename);
  const content = readFileSync(path, 'utf-8');
  check(content.includes('](../../README.md)'), `${filename} links back to the root README`);
  const markdownTargets = [...content.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/g)].map((match) => match[1]);
  const htmlTargets = [...content.matchAll(/\b(?:href|src|srcset)="([^"#?]+)(?:[?#][^"]*)?"/g)].map((match) => match[1]);
  for (const target of [...markdownTargets, ...htmlTargets]) {
    if (/^(?:https?:|mailto:)/.test(target)) continue;
    check(existsSync(resolve(dirname(path), target)), `${filename} keeps relative link ${target} valid`);
  }
}

const fixture = mkdtempSync(join(ROOT, '.tmp-readme-layout-'));
try {
  mkdirSync(join(fixture, 'docs', 'readme-translations'), { recursive: true });
  writeFileSync(join(fixture, 'README.md'), '# English\n');
  writeFileSync(join(fixture, 'README.de.md'), '# New Deutsch\n');
  writeFileSync(join(fixture, 'docs', 'readme-translations', 'README.de.md'), '# Old Deutsch\n');

  const first = reconcileReadmeLayout(fixture);
  check(first.includes('README.de.md') && first.includes('docs/readme-translations/README.de.md'), 'updater migration moves old root translations to the canonical destination');
  check(!existsSync(join(fixture, 'README.de.md')) && readFileSync(join(fixture, 'docs', 'readme-translations', 'README.de.md'), 'utf-8') === '# New Deutsch\n', 'migration removes duplicate root file and retains fetched translation');
  check(reconcileReadmeLayout(fixture).length === 0, 'README reconciliation is idempotent');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
