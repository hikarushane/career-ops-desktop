import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pass, fail, ROOT } from './helpers.mjs';
import {
  analysisLanguageOptions,
  languageSettings,
  parseAnalysisLanguage,
  resolveHelpReadme,
  setAnalysisLanguageInProfile,
  writeAnalysisLanguage,
} from '../profile-language.mjs';

console.log('\nlanguage system — analysis preference and Help selection');

function check(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

check(parseAnalysisLanguage('language:\n  analysis: de\n  output: zh-TW\n') === 'de', 'analysis key wins over legacy output');
check(parseAnalysisLanguage('language:\n  output: zh-TW\n') === 'zh-TW', 'legacy output is a read-only compatibility fallback');

const migrated = setAnalysisLanguageInProfile('candidate:\n  full_name: Test\nlanguage:\n  output: de\ntarget_roles: {}\n', 'zh-TW');
check(migrated.includes('analysis: zh-TW') && !migrated.includes('output:'), 'saving migrates legacy output without competing keys');
check(migrated.includes('candidate:\n  full_name: Test') && migrated.includes('target_roles: {}'), 'saving changes only the language block');

const fixture = mkdtempSync(join(ROOT, '.tmp-language-system-'));
try {
  mkdirSync(join(fixture, 'docs', 'readme-translations'), { recursive: true });
  mkdirSync(join(fixture, 'modes', 'id'), { recursive: true });
  writeFileSync(join(fixture, 'README.md'), '# English\n');
  writeFileSync(join(fixture, 'docs', 'readme-translations', 'README.de.md'), '# Deutsch\n');
  writeFileSync(join(fixture, 'docs', 'readme-translations', 'README.zh-TW.md'), '# 繁體中文\n');

  const options = analysisLanguageOptions(fixture);
  check(options.some((option) => option.code === 'de') && options.some((option) => option.code === 'id'), 'options are discovered from translations and modes rather than a React list');

  const germanHelp = resolveHelpReadme(fixture, 'de');
  check(germanHelp.path === 'docs/readme-translations/README.de.md' && !germanHelp.fallback, 'Help selects the configured translation');
  const missingHelp = resolveHelpReadme(fixture, 'id');
  check(missingHelp.path === 'README.md' && missingHelp.fallback, 'Help falls back to English without changing analysis language');

  const written = writeAnalysisLanguage(fixture, 'zh-TW');
  check(written.analysisLanguage === 'zh-TW' && languageSettings(fixture).analysisLanguage === 'zh-TW', 'onboarding/settings writer persists only the analysis language');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
