import { isMainModule } from './lib/is-main-module.mjs';

const DEFAULT_JOB_LANGUAGE = 'en';
const MIN_TEXT_LENGTH = 80;
const LOW_CONFIDENCE = 0.75;

const LATIN_LANGUAGE_MARKERS = {
  de: ['und', 'der', 'die', 'das', 'mit', 'für', 'aufgaben', 'erfahrung', 'wir', 'eine'],
  en: ['the', 'and', 'with', 'for', 'you', 'your', 'role', 'experience', 'will', 'our'],
  fr: ['et', 'vous', 'avec', 'pour', 'une', 'dans', 'des', 'poste', 'expérience'],
  es: ['y', 'con', 'para', 'una', 'que', 'del', 'experiencia', 'puesto', 'equipo'],
  it: ['e', 'con', 'per', 'una', 'che', 'del', 'esperienza', 'ruolo', 'azienda'],
  pt: ['e', 'com', 'para', 'uma', 'que', 'dos', 'experiência', 'vaga', 'equipe'],
  nl: ['en', 'met', 'voor', 'een', 'van', 'je', 'ervaring', 'functie', 'team'],
  da: ['og', 'med', 'for', 'en', 'der', 'du', 'erfaring', 'stilling', 'team'],
  tr: ['ve', 'ile', 'için', 'bir', 'bu', 'olarak', 'deneyim', 'pozisyon', 'ekip'],
  pl: ['i', 'z', 'dla', 'w', 'na', 'doświadczenie', 'stanowisko', 'zespół'],
  id: ['dan', 'dengan', 'untuk', 'yang', 'kami', 'pengalaman', 'posisi', 'tim'],
};

function validLanguage(value) {
  if (typeof value !== 'string') return null;
  const language = value.trim();
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language) ? language : null;
}

function textFrom(context, keys) {
  for (const key of keys) {
    const value = context?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function scriptLanguage(text) {
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(text)) return 'ja';
  if (/\p{Script=Hangul}/u.test(text)) return 'ko';
  if (/\p{Script=Arabic}/u.test(text)) return 'ar';
  if (/\p{Script=Devanagari}/u.test(text)) return 'hi';
  if (/\p{Script=Han}/u.test(text)) return 'zh';
  if (/\p{Script=Cyrillic}/u.test(text)) {
    return /\b(робота|посада|досвід|команда)\b/iu.test(text) ? 'uk' : 'ru';
  }
  return null;
}

function latinLanguage(text) {
  const tokens = text.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
  const scores = Object.entries(LATIN_LANGUAGE_MARKERS).map(([language, markers]) => [
    language,
    tokens.reduce((score, token) => score + (markers.includes(token) ? 1 : 0), 0),
  ]);
  scores.sort((left, right) => right[1] - left[1]);
  const [language, score] = scores[0] ?? [DEFAULT_JOB_LANGUAGE, 0];
  const [, runnerUp = 0] = scores[1] ?? [];
  if (score === 0) return null;
  return {
    language,
    confidence: Math.min(0.98, Math.max(0.5, (score - runnerUp + 1) / (score + 1))),
  };
}

/**
 * Resolve the language of one job description. The function is intentionally
 * stateless so every batch worker can resolve its own job independently.
 */
export function resolveJobLanguage(context = {}) {
  const override = validLanguage(context.jobLanguageOverride ?? context.override);
  if (override) return { language: override, confidence: 1, source: 'explicit-override' };

  const jdText = textFrom(context, ['jdText', 'text', 'body']);
  const extractedText = textFrom(context, ['extractedText', 'pageText']);
  const text = jdText || extractedText;
  const source = jdText ? 'jd-text' : extractedText ? 'extracted-posting-content' : null;

  if (text.length >= MIN_TEXT_LENGTH) {
    const script = scriptLanguage(text);
    if (script) return { language: script, confidence: 0.98, source };
    const latin = latinLanguage(text);
    if (latin) {
      return {
        ...latin,
        source,
        ...(latin.confidence < LOW_CONFIDENCE
          ? { warning: 'Job description language is ambiguous; choose a document language before generating artifacts.' }
          : {}),
      };
    }
  }

  return {
    language: DEFAULT_JOB_LANGUAGE,
    confidence: 0,
    source: 'fallback',
    warning: 'Job description is too short or ambiguous; choose a document language before generating artifacts.',
  };
}

export function artifactLanguageInstruction(jobLanguage) {
  const language = validLanguage(jobLanguage) ?? DEFAULT_JOB_LANGUAGE;
  return `Write this candidate-facing artifact in ${language}, the language resolved from this job description. Do not let the analysis language or market-mode file language override it.`;
}

if (isMainModule(import.meta.url)) {
  const [command, value] = process.argv.slice(2);
  if (command === '--resolve') {
    console.log(JSON.stringify(resolveJobLanguage({ jdText: value })));
  } else {
    console.error('usage: job-language.mjs --resolve <JD text>');
    process.exitCode = 1;
  }
}
