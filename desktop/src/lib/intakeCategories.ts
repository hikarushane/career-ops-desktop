export type IntakeCategoryId =
  | 'cv'
  | 'work'
  | 'research'
  | 'diplomas'
  | 'linkedin'
  | 'references'
  | 'certificates'
  | 'portfolio';

export type IntakeCategory = {
  id: IntakeCategoryId;
  label: string;
  folder: string;
};

export const INTAKE_CATEGORIES: readonly IntakeCategory[] = [
  { id: 'cv', label: 'CV / Resume', folder: 'cv' },
  { id: 'work', label: 'Work records', folder: 'work' },
  { id: 'research', label: 'Publications / Research', folder: 'research' },
  { id: 'diplomas', label: 'Degrees / Transcripts', folder: 'diplomas' },
  { id: 'linkedin', label: 'LinkedIn', folder: 'linkedin' },
  { id: 'references', label: 'References', folder: 'references' },
  { id: 'certificates', label: 'Certificates', folder: 'certificates' },
  { id: 'portfolio', label: 'Portfolio / Projects', folder: 'portfolio' },
] as const;

export function folderFor(category: IntakeCategoryId): string {
  return INTAKE_CATEGORIES.find((item) => item.id === category)!.folder;
}

export function suggestIntakeCategory(filename: string): IntakeCategoryId | null {
  const name = filename.toLowerCase();

  if (name.includes('linkedin')) return 'linkedin';
  if (name.includes('resume') || /(?:^|[^a-z0-9])cv(?:[^a-z0-9]|$)/.test(name)) return 'cv';
  if (name.includes('reference') || name.includes('recommendation')) return 'references';
  if (name.includes('employment') || name.includes('performance-review')) return 'work';
  if (name.includes('research') || name.includes('thesis') || name.includes('paper') || name.includes('publication')) return 'research';
  if (name.includes('transcript') || name.includes('diploma') || name.includes('degree')) return 'diplomas';
  if (name.includes('certificate') || name.includes('certification')) return 'certificates';
  if (name.includes('portfolio')) return 'portfolio';

  return null;
}
