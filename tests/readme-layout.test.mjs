import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pass, fail, ROOT } from './helpers.mjs';
import { reconcileReadmeLayout } from '../update-system.mjs';

console.log('\nREADME layout — two-language fork layout (zh-TW root + en)');

function check(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

// 1. Root has only README.md (zh-TW) and README.en.md
check(existsSync(join(ROOT, 'README.md')), 'README.md exists at root');
check(existsSync(join(ROOT, 'README.en.md')), 'README.en.md exists at root');

const rootTranslations = readdirSync(ROOT).filter(
  (name) => /^README\.[A-Za-z-]+\.md$/.test(name) && name !== 'README.en.md',
);
check(rootTranslations.length === 0, 'no other translated READMEs at root besides English');

// 2. desktop/README.md does not exist
check(!existsSync(join(ROOT, 'desktop', 'README.md')), 'desktop/README.md does not exist');

// 3. docs/readme-translations/ does not contain README translations
const translationDir = join(ROOT, 'docs', 'readme-translations');
if (existsSync(translationDir)) {
  const translationFiles = readdirSync(translationDir).filter(
    (name) => /^README[\w.-]*\.md$/.test(name),
  );
  check(translationFiles.length === 0, 'docs/readme-translations/ has no README files');
} else {
  pass('docs/readme-translations/ directory does not exist');
}

// 4. Cross-links between zh-TW and en are correct
const zhContent = readFileSync(join(ROOT, 'README.md'), 'utf-8');
const enContent = readFileSync(join(ROOT, 'README.en.md'), 'utf-8');
check(zhContent.includes('README.en.md'), 'zh-TW README links to English');
check(enContent.includes('README.md'), 'English README links back to zh-TW');

// 5. No dead markdown links to old layout (prose mentions in backticks are OK)
const linkPattern = (target) => new RegExp(`\\]\\((?:[^)]*\\/)?${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[)#]`);
check(!linkPattern('desktop/README.md').test(enContent), 'English README has no link to desktop/README.md');
check(!linkPattern('docs/readme-translations').test(enContent), 'English README has no link to docs/readme-translations');
check(!linkPattern('desktop/README.md').test(zhContent), 'zh-TW README has no link to desktop/README.md');
check(!linkPattern('docs/readme-translations').test(zhContent), 'zh-TW README has no link to docs/readme-translations');

// 6. reconcileReadmeLayout deletes translations outside the fork's two files
const fixture = mkdtempSync(join(ROOT, '.tmp-readme-layout-'));
try {
  writeFileSync(join(fixture, 'README.md'), '# 繁體中文\n');
  writeFileSync(join(fixture, 'README.en.md'), '# English\n');
  writeFileSync(join(fixture, 'README.zh-TW.md'), '# 舊版繁體中文\n');
  writeFileSync(join(fixture, 'README.de.md'), '# Deutsch\n');
  writeFileSync(join(fixture, 'README.ja.md'), '# 日本語\n');

  const deleted = reconcileReadmeLayout(fixture);
  check(deleted.includes('README.de.md') && deleted.includes('README.ja.md'), 'reconciliation deletes non-English translations');
  check(deleted.includes('README.zh-TW.md'), 'reconciliation deletes the obsolete zh-TW filename');
  check(!deleted.includes('README.en.md'), 'reconciliation preserves README.en.md');
  check(existsSync(join(fixture, 'README.en.md')), 'README.en.md survives reconciliation');
  check(existsSync(join(fixture, 'README.md')), 'README.md survives reconciliation');
  check(!existsSync(join(fixture, 'README.de.md')), 'README.de.md is deleted by reconciliation');
  check(!existsSync(join(fixture, 'README.ja.md')), 'README.ja.md is deleted by reconciliation');
  check(reconcileReadmeLayout(fixture).length === 0, 'reconciliation is idempotent');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
