/**
 * Interface language. Source strings are English and double as the
 * dictionary keys; `t()` returns the Traditional Chinese entry when that
 * language is active and falls back to the English text otherwise, so a
 * missing entry shows English rather than a key. `{name}` placeholders are
 * filled from `params`.
 *
 * The active language is module state, not React state: every screen calls
 * `t()` during render, and App re-renders the whole tree (it holds the
 * language in its own state) when Settings switches it. Tests run in English
 * unless they call setUiLanguage.
 */
import { load } from '@tauri-apps/plugin-store';
import { ZH_TW } from './i18n/zh-TW';

export type UiLanguage = 'en' | 'zh-TW';

export const UI_LANGUAGES: { code: UiLanguage; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh-TW', label: '繁體中文' },
];

const STORE_FILE = 'settings.json';
const STORE_KEY = 'ui-language';

let current: UiLanguage = 'en';

export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === 'en' || value === 'zh-TW';
}

export function getUiLanguage(): UiLanguage {
  return current;
}

/** Switches every later t() call; the caller re-renders (App holds the language in state). */
export function setUiLanguage(language: UiLanguage): void {
  current = language;
}

export function t(text: string, params?: Record<string, string | number>): string {
  const base = current === 'zh-TW' ? (ZH_TW[text] ?? text) : text;
  if (!params) return base;
  return base.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

/** The UI language to start with when none was chosen yet: follow the workspace's analysis language. */
export function defaultUiLanguage(analysisLanguage: string | undefined): UiLanguage {
  return analysisLanguage?.toLowerCase() === 'zh-tw' ? 'zh-TW' : 'en';
}

export async function loadUiLanguage(): Promise<UiLanguage | null> {
  try {
    const store = await load(STORE_FILE, { autoSave: true });
    const saved = await store.get<string>(STORE_KEY);
    return isUiLanguage(saved) ? saved : null;
  } catch {
    return null;
  }
}

/** Never throws: a language that fails to persist still applies for this run. */
export async function saveUiLanguage(language: UiLanguage): Promise<void> {
  try {
    const store = await load(STORE_FILE, { autoSave: true });
    await store.set(STORE_KEY, language);
  } catch {
    // Store unavailable.
  }
}
