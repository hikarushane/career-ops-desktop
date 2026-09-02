import { describe, expect, it } from 'vitest';
import { EMPTY_PREFERENCES, hasAnyPreference, preferencesToPrompt, type JobPreferences } from './jobPreferences';

describe('jobPreferences', () => {
  it('EMPTY_PREFERENCES has no preference set', () => {
    expect(hasAnyPreference(EMPTY_PREFERENCES)).toBe(false);
  });

  it('detects a non-default relocation as a preference', () => {
    expect(hasAnyPreference({ ...EMPTY_PREFERENCES, relocation: 'yes' })).toBe(true);
  });

  it('serialises filled fields into a prompt block', () => {
    const prefs: JobPreferences = {
      regions: 'Germany, Netherlands',
      keywords: 'Manufacturing Engineer',
      salary: 'EUR 70k-85k',
      relocation: 'yes',
      preferredCities: 'Hamburg',
      notes: '',
    };
    const prompt = preferencesToPrompt(prefs);
    expect(prompt).toContain('- Target regions: Germany, Netherlands');
    expect(prompt).toContain('- Willing to relocate: yes');
    expect(prompt).not.toContain('Other notes');
  });

  it('returns fallback line when nothing is filled', () => {
    expect(preferencesToPrompt(EMPTY_PREFERENCES)).toContain('No preferences provided');
  });
});
