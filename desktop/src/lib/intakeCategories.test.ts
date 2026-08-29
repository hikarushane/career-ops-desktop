import { describe, expect, it } from 'vitest';
import {
  INTAKE_CATEGORIES,
  folderFor,
  suggestIntakeCategory,
} from './intakeCategories';

describe('intake categories', () => {
  it('keeps the eight staged-evidence folders stable', () => {
    expect(INTAKE_CATEGORIES).toEqual([
      { id: 'cv', label: 'CV / Resume', folder: 'cv' },
      { id: 'work', label: 'Work records', folder: 'work' },
      { id: 'research', label: 'Publications / Research', folder: 'research' },
      { id: 'diplomas', label: 'Degrees / Transcripts', folder: 'diplomas' },
      { id: 'linkedin', label: 'LinkedIn', folder: 'linkedin' },
      { id: 'references', label: 'References', folder: 'references' },
      { id: 'certificates', label: 'Certificates', folder: 'certificates' },
      { id: 'portfolio', label: 'Portfolio / Projects', folder: 'portfolio' },
    ]);
  });

  it('does not rename existing user-facing folder names', () => {
    expect(folderFor('cv')).toBe('cv');
    expect(folderFor('linkedin')).toBe('linkedin');
    expect(folderFor('diplomas')).toBe('diplomas');
    expect(folderFor('references')).toBe('references');
  });
});

describe('suggestIntakeCategory', () => {
  it.each([
    ['resume-2026.pdf', 'cv'],
    ['linkedin-profile.pdf', 'linkedin'],
    ['master-transcript.pdf', 'diplomas'],
    ['reference-letter-acme.pdf', 'references'],
    ['employment-certificate.pdf', 'work'],
    ['performance-review-2025.pdf', 'work'],
    ['research-paper.pdf', 'research'],
    ['master-thesis.pdf', 'research'],
    ['aws-certificate.pdf', 'certificates'],
    ['project-portfolio.pdf', 'portfolio'],
  ] as const)('classifies %s as %s', (filename, category) => {
    expect(suggestIntakeCategory(filename)).toBe(category);
  });

  it('leaves generic files and loose letter names for the user to categorize', () => {
    expect(suggestIntakeCategory('notes.pdf')).toBeNull();
    expect(suggestIntakeCategory('wallpaper.pdf')).toBeNull();
    expect(suggestIntakeCategory('cover-letter.pdf')).toBeNull();
  });
});
