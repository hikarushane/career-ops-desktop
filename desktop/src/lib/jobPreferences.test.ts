import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_PREFERENCES, hasAnyPreference, loadPreferences, preferencesToPrompt, savePreferences, type JobPreferences,
} from './jobPreferences';

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

afterEach(() => { store.data.clear(); store.fail = false; });

describe('jobPreferences', () => {
  it('EMPTY_PREFERENCES has no preference set', () => {
    expect(hasAnyPreference(EMPTY_PREFERENCES)).toBe(false);
  });

  it('detects a non-default relocation as a preference', () => {
    expect(hasAnyPreference({ ...EMPTY_PREFERENCES, relocation: 'yes' })).toBe(true);
  });

  it('detects a filled text field as a preference', () => {
    expect(hasAnyPreference({ ...EMPTY_PREFERENCES, keywords: 'PM' })).toBe(true);
  });

  it('renders only the filled fields as prompt lines', () => {
    const p: JobPreferences = { ...EMPTY_PREFERENCES, regions: 'Germany', salary: 'EUR 80k', relocation: 'no' };
    expect(preferencesToPrompt(p)).toBe('- Target regions: Germany\n- Expected salary: EUR 80k\n- Willing to relocate: no');
  });

  it('falls back to an inference hint when nothing is filled', () => {
    expect(preferencesToPrompt(EMPTY_PREFERENCES)).toMatch(/No preferences provided/);
  });
});

describe('remembered preferences', () => {
  it('round-trips per workspace and fills gaps with the empty defaults', async () => {
    await savePreferences('/w', { ...EMPTY_PREFERENCES, regions: 'Netherlands' });
    expect(await loadPreferences('/w')).toEqual({ ...EMPTY_PREFERENCES, regions: 'Netherlands' });
    expect(await loadPreferences('/other')).toEqual(EMPTY_PREFERENCES);
    store.data.set('job-preferences./w', { keywords: 'PM' });
    expect(await loadPreferences('/w')).toEqual({ ...EMPTY_PREFERENCES, keywords: 'PM' });
  });

  it('degrades to the defaults and never throws when the store is unavailable', async () => {
    store.fail = true;
    expect(await loadPreferences('/w')).toEqual(EMPTY_PREFERENCES);
    await expect(savePreferences('/w', EMPTY_PREFERENCES)).resolves.toBeUndefined();
  });
});
