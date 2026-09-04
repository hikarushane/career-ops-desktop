import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defaultUiLanguage, getUiLanguage, loadUiLanguage, saveUiLanguage, setUiLanguage, t } from './i18n';
import { ZH_TW } from './i18n/zh-TW';
import { TABS } from './filters';
import { INTAKE_CATEGORIES } from './intakeCategories';
import { INTAKE_FIELDS } from './interviewSession';

const store = vi.hoisted(() => {
  const data = new Map<string, unknown>();
  return {
    data,
    fail: false,
    load: vi.fn(async () => {
      if (store.fail) throw new Error('store unavailable');
      return { get: async (k: string) => data.get(k), set: async (k: string, v: unknown) => { data.set(k, v); } };
    }),
  };
});
vi.mock('@tauri-apps/plugin-store', () => ({ load: store.load }));

afterEach(() => { setUiLanguage('en'); store.data.clear(); store.fail = false; });

describe('t', () => {
  it('returns the English source text by default and fills placeholders', () => {
    expect(t('Evaluate a job')).toBe('Evaluate a job');
    expect(t('{n} tracked', { n: 4 })).toBe('4 tracked');
    expect(t('{n} of {m} files written', { n: 1, m: 3 })).toBe('1 of 3 files written');
  });

  it('switches to Traditional Chinese and falls back to English for a missing entry', () => {
    setUiLanguage('zh-TW');
    expect(getUiLanguage()).toBe('zh-TW');
    expect(t('Evaluate a job')).toBe(ZH_TW['Evaluate a job']);
    expect(t('{n} tracked', { n: 4 })).toBe(ZH_TW['{n} tracked'].replace('{n}', '4'));
    expect(t('a string nobody translated')).toBe('a string nobody translated');
  });

  it('derives the first-run language from the analysis language', () => {
    expect(defaultUiLanguage('zh-TW')).toBe('zh-TW');
    expect(defaultUiLanguage('zh-tw')).toBe('zh-TW');
    expect(defaultUiLanguage('en')).toBe('en');
    expect(defaultUiLanguage(undefined)).toBe('en');
  });

  it('persists the choice and survives a broken store', async () => {
    expect(await loadUiLanguage()).toBeNull();
    await saveUiLanguage('zh-TW');
    expect(await loadUiLanguage()).toBe('zh-TW');
    store.data.set('ui-language', 'klingon');
    expect(await loadUiLanguage()).toBeNull();
    store.fail = true;
    expect(await loadUiLanguage()).toBeNull();
    await expect(saveUiLanguage('en')).resolves.toBeUndefined();
  });
});

/**
 * Every `t('…')` key in the source has a Traditional Chinese entry. The
 * dictionary is keyed by the English text, so a string wrapped in t() but
 * never translated would silently show English in the Chinese UI.
 */
describe('zh-TW dictionary', () => {
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) sourceFiles(full, out);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
    return out;
  }

  it('covers every t() key used in src/', () => {
    const src = join(__dirname, '..');
    const keys = new Set<string>();
    for (const file of sourceFiles(src)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
      for (const m of text.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(m[1].replace(/\\"/g, '"'));
    }
    const missing = [...keys].filter((k) => !(k in ZH_TW)).sort();
    expect(missing).toEqual([]);
    expect(keys.size).toBeGreaterThan(100);
  });

  it('has no empty translations', () => {
    const empty = Object.entries(ZH_TW).filter(([, v]) => v.trim() === '').map(([k]) => k);
    expect(empty).toEqual([]);
  });

  /**
   * Strings that reach t() through a variable (label tables, option lists,
   * canonical status names) are invisible to the source scan above.
   */
  it('covers the label tables that reach t() through variables', () => {
    const dynamic = [
      ...TABS.map((tab) => tab.label),
      ...['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP', 'Hired', 'Top ≥4'],
      ...['Total', 'Avg', 'Top', 'Actionable', 'With PDF', 'Date', 'Company', 'Role', 'Score', 'Status', 'PDF'],
      ...INTAKE_CATEGORIES.map((c) => c.label),
      ...Object.values(INTAKE_FIELDS).flatMap((fields) => fields.flatMap((f) => [f.label, ...(f.placeholder ? [f.placeholder] : []), ...(f.options ?? [])])),
      ...['Interview Prep Plan', 'Practice Interview', 'Post-Interview Debrief'],
      ...['Evaluating', 'Scanning', 'Processing', 'Generating profile', 'Updating profile', 'Generating CV', 'Writing cover letter', 'Preparing', 'Running'],
      ...['Formal', 'Direct', 'Conversational', 'Mirror the JD', 'Yes', 'Maybe', 'No', 'Low', 'Medium', 'High'],
      ...['Generating your profile', 'Review your profile', 'Updating your targeting', 'Review the changes', 'Skip for now', 'Cancel'],
    ];
    const missing = [...new Set(dynamic)].filter((k) => !(k in ZH_TW)).sort();
    expect(missing).toEqual([]);
  });
});
