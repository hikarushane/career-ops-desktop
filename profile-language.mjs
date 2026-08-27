import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import * as yaml from 'js-yaml';
import { isMainModule } from './lib/is-main-module.mjs';

export const DEFAULT_ANALYSIS_LANGUAGE = 'en';

const README_FILENAME_ALIASES = {
  cn: 'zh-CN',
  ua: 'uk',
};

function normalizedLanguage(value) {
  if (typeof value !== 'string') return null;
  const language = value.trim();
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)) return null;
  return language;
}

/** Parse the analysis language, accepting legacy language.output on read only. */
export function parseAnalysisLanguage(profileYaml) {
  try {
    const profile = yaml.load(String(profileYaml ?? '')) || {};
    return normalizedLanguage(profile?.language?.analysis)
      ?? normalizedLanguage(profile?.language?.output)
      ?? DEFAULT_ANALYSIS_LANGUAGE;
  } catch {
    return DEFAULT_ANALYSIS_LANGUAGE;
  }
}

/**
 * Build the analysis-only prompt rule injected into evaluation workers.
 * Artifact tasks receive their own JD-derived instruction from job-language.mjs.
 */
export function analysisLanguageInstruction(language) {
  const analysisLanguage = normalizedLanguage(language) ?? DEFAULT_ANALYSIS_LANGUAGE;
  return [
    `Write evaluation reports, dashboard-facing explanations, report headings, and`,
    `machine-summary free-text values in ${analysisLanguage}, regardless of the`,
    `language of these instructions or the job description. Keep machine-readable`,
    `keys stable and preserve market-specific terms when relevant. This analysis`,
    `language does not control a tailored CV, cover letter, or interview material:`,
    `those artifacts must use the separately resolved job-description language.`,
  ].join(' ');
}

/** @deprecated Use parseAnalysisLanguage. Kept as a non-writing compatibility alias. */
export const parseOutputLanguage = parseAnalysisLanguage;
/** @deprecated Use analysisLanguageInstruction. Kept for third-party callers. */
export const outputLanguageInstruction = analysisLanguageInstruction;

function readmeLanguageFromFilename(filename) {
  const match = filename.match(/^README\.([A-Za-z-]+)\.md$/);
  if (!match) return null;
  return README_FILENAME_ALIASES[match[1]] ?? match[1];
}

function languageName(code) {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Discover language choices from market mode directories. */
export function analysisLanguageOptions(root = process.cwd()) {
  const options = new Set([DEFAULT_ANALYSIS_LANGUAGE]);

  // The Desktop fork keeps Traditional Chinese at README.md and English at
  // README.en.md. Only advertise zh-TW when that two-language layout exists.
  if (existsSync(join(root, 'README.md')) && existsSync(join(root, 'README.en.md'))) options.add('zh-TW');

  const modesDir = join(root, 'modes');
  if (existsSync(modesDir)) {
    for (const entry of readdirSync(modesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const language = entry.name === 'zh' ? 'zh-CN' : normalizedLanguage(entry.name);
      if (language) options.add(language);
    }
  }

  return [...options]
    .map((code) => ({ code, name: languageName(code) }))
    .sort((left, right) => left.code.localeCompare(right.code));
}

export function resolveHelpReadme(root, language) {
  const requestedLanguage = normalizedLanguage(language) ?? DEFAULT_ANALYSIS_LANGUAGE;
  // Help documentation only supports zh-TW and English fallback.
  if (requestedLanguage.toLowerCase() === 'zh-tw') {
    const zhTW = join(root, 'README.md');
    if (existsSync(zhTW)) {
      return {
        language: 'zh-TW',
        path: 'README.md',
        fallback: false,
        markdown: readFileSync(zhTW, 'utf-8'),
      };
    }
  }
  const englishName = existsSync(join(root, 'README.en.md')) ? 'README.en.md' : 'README.md';
  const english = join(root, englishName);
  return {
    language: DEFAULT_ANALYSIS_LANGUAGE,
    path: englishName,
    fallback: requestedLanguage.toLowerCase() !== 'en',
    markdown: readFileSync(english, 'utf-8'),
  };
}

/** Update only the language block, preserving the rest of a user-owned profile. */
export function setAnalysisLanguageInProfile(profileYaml, language) {
  const analysisLanguage = normalizedLanguage(language);
  if (!analysisLanguage) throw new Error('analysis language must be an ISO language tag');

  const source = String(profileYaml ?? '');
  const languageBlock = /^language:[^\r\n]*(?:\r?\n(?:[ \t].*|[ \t]*))*/m;
  const match = source.match(languageBlock);

  if (!match) {
    const separator = source && !source.endsWith('\n') ? '\n' : '';
    return `${source}${separator}\nlanguage:\n  analysis: ${analysisLanguage}\n`;
  }

  const block = match[0];
  const analysisLine = /^(\s*)analysis:\s*.*$/m;
  const legacyOutputLine = /^(\s*)output:\s*.*$/m;
  const updatedBlock = analysisLine.test(block)
    ? block.replace(analysisLine, `$1analysis: ${analysisLanguage}`)
    : legacyOutputLine.test(block)
      // A write is the deterministic, non-competitive migration point: do not
      // leave language.output and language.analysis to disagree afterwards.
      ? block.replace(legacyOutputLine, `$1analysis: ${analysisLanguage}`)
      : block.replace(/^language:[^\r\n]*(\r?\n)?/, (header, newline = '\n') => `${header}${newline}  analysis: ${analysisLanguage}\n`);

  return `${source.slice(0, match.index)}${updatedBlock}${source.slice(match.index + block.length)}`;
}

export function languageSettings(root = process.cwd()) {
  const profilePath = join(root, 'config', 'profile.yml');
  const profileYaml = existsSync(profilePath) ? readFileSync(profilePath, 'utf-8') : '';
  return {
    analysisLanguage: parseAnalysisLanguage(profileYaml),
    options: analysisLanguageOptions(root),
  };
}

export function writeAnalysisLanguage(root, language) {
  const profilePath = join(root, 'config', 'profile.yml');
  const current = existsSync(profilePath) ? readFileSync(profilePath, 'utf-8') : '';
  mkdirSync(dirname(profilePath), { recursive: true });
  writeFileSync(profilePath, setAnalysisLanguageInProfile(current, language), 'utf-8');
  return languageSettings(root);
}

if (isMainModule(import.meta.url)) {
  const [command, value] = process.argv.slice(2);
  try {
    if (command === '--settings') {
      console.log(JSON.stringify(languageSettings()));
    } else if (command === '--set-analysis') {
      console.log(JSON.stringify(writeAnalysisLanguage(process.cwd(), value)));
    } else if (command === '--help-readme') {
      console.log(JSON.stringify(resolveHelpReadme(process.cwd(), value)));
    } else {
      throw new Error('usage: profile-language.mjs --settings | --set-analysis <ISO code> | --help-readme <ISO code>');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
