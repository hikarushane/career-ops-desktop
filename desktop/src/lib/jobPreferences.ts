export type Relocation = 'yes' | 'no' | 'maybe';

export type JobPreferences = {
  regions: string;
  keywords: string;
  salary: string;
  relocation: Relocation;
  preferredCities: string;
  notes: string;
};

export const EMPTY_PREFERENCES: JobPreferences = {
  regions: '',
  keywords: '',
  salary: '',
  relocation: 'maybe',
  preferredCities: '',
  notes: '',
};

const LABELS: [keyof JobPreferences, string][] = [
  ['regions', 'Target regions'],
  ['keywords', 'Role keywords'],
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
