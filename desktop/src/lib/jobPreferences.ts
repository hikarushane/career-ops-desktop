import { load } from '@tauri-apps/plugin-store';

export type Relocation = 'yes' | 'no' | 'maybe';

export type JobPreferences = {
  regions: string;
  keywords: string;
  industries: string;
  salary: string;
  relocation: Relocation;
  preferredCities: string;
  notes: string;
};

export const EMPTY_PREFERENCES: JobPreferences = {
  regions: '',
  keywords: '',
  industries: '',
  salary: '',
  relocation: 'maybe',
  preferredCities: '',
  notes: '',
};

const LABELS: [keyof JobPreferences, string][] = [
  ['regions', 'Target regions'],
  ['keywords', 'Role keywords'],
  ['industries', 'Industries'],
  ['salary', 'Expected salary'],
  ['relocation', 'Willing to relocate'],
  ['preferredCities', 'Preferred cities'],
  ['notes', 'Other notes'],
];

export function hasAnyPreference(p: JobPreferences): boolean {
  return LABELS.some(([key]) => (key === 'relocation' ? p.relocation !== 'maybe' : p[key].trim() !== ''));
}

export function preferencesToPrompt(p: JobPreferences): string {
  const lines = LABELS.flatMap(([key, label]) => {
    if (key === 'relocation') return p.relocation === 'maybe' ? [] : [`- ${label}: ${p.relocation}`];
    const value = p[key].trim();
    return value === '' ? [] : [`- ${label}: ${value}`];
  });
  return lines.length > 0
    ? lines.join('\n')
    : '- No preferences provided; infer sensible targets from the documents.';
}

// --- persistence -----------------------------------------------------------
// The answers themselves are app state (the profile files are what the AI
// derives from them), kept per workspace in the same settings store as the
// provider choice so Settings > Job Search reopens on what was last entered.

const STORE_FILE = 'settings.json';
function storeKey(root: string) { return `job-preferences.${root}`; }

export async function loadPreferences(root: string): Promise<JobPreferences> {
  try {
    const store = await load(STORE_FILE, { autoSave: true });
    const saved = await store.get<Partial<JobPreferences>>(storeKey(root));
    return { ...EMPTY_PREFERENCES, ...(saved ?? {}) };
  } catch {
    return EMPTY_PREFERENCES;
  }
}

/** Never throws: losing the remembered answers is not worth blocking the flow that uses them. */
export async function savePreferences(root: string, preferences: JobPreferences): Promise<void> {
  try {
    const store = await load(STORE_FILE, { autoSave: true });
    await store.set(storeKey(root), preferences);
  } catch {
    // Store unavailable (tests, broken plugin): the form still works for this visit.
  }
}
