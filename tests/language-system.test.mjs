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
  mkdirSync(join(fixture, 'modes', 'id'), { recursive: true });
  writeFileSync(join(fixture, 'README.md'), '# 繁體中文\n');
  writeFileSync(join(fixture, 'README.en.md'), '# English\n');

  const options = analysisLanguageOptions(fixture);
  check(options.some((option) => option.code === 'zh-TW'), 'options include zh-TW from root README.md');
  check(options.some((option) => option.code === 'id'), 'options are discovered from market mode directories');
  check(!options.some((option) => option.code === 'de'), 'options do not include languages without a mode directory');

  const zhTWHelp = resolveHelpReadme(fixture, 'zh-TW');
  check(zhTWHelp.path === 'README.md' && !zhTWHelp.fallback, 'Help selects zh-TW README at root');

  const germanHelp = resolveHelpReadme(fixture, 'de');
  check(germanHelp.path === 'README.en.md' && germanHelp.fallback, 'Help falls back to English for unsupported languages');

  const japaneseHelp = resolveHelpReadme(fixture, 'ja');
  check(japaneseHelp.path === 'README.en.md' && japaneseHelp.fallback, 'Help falls back to English for ja');

  const englishHelp = resolveHelpReadme(fixture, 'en');
  check(englishHelp.path === 'README.en.md' && !englishHelp.fallback, 'Help returns English README for en');

  const written = writeAnalysisLanguage(fixture, 'zh-TW');
  check(written.analysisLanguage === 'zh-TW' && languageSettings(fixture).analysisLanguage === 'zh-TW', 'onboarding/settings writer persists only the analysis language');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
