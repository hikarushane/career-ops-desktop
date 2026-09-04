import { describe, expect, it } from 'vitest';
import { fileDate, groupInterviewFiles, jdCaptureFor } from './interviewFiles';
import type { WorkspaceFile } from '../api';

const f = (path: string): WorkspaceFile => ({ path, name: path.split('/').pop() ?? path, modified: 1_757_000_000 });

describe('groupInterviewFiles', () => {
  const files = [
    f('interview-prep/acme-gmbh-project-manager.md'),
    f('interview-prep/sessions/acme-gmbh-2026-09-04.md'),
    f('interview-prep/rtw-general-manager.md'),
    f('interview-prep/story-bank.md'),
    f('interview-prep/question-bank.md'),
  ];

  it('claims files whose path carries the company slug and leaves the rest shared', () => {
    const groups = groupInterviewFiles(files, ['ACME GmbH', 'RTW']);
    expect(groups.byCompany['ACME GmbH'].map((x) => x.name)).toEqual(['acme-gmbh-project-manager.md', 'acme-gmbh-2026-09-04.md']);
    expect(groups.byCompany['RTW'].map((x) => x.name)).toEqual(['rtw-general-manager.md']);
    expect(groups.shared.map((x) => x.name)).toEqual(['story-bank.md', 'question-bank.md']);
  });

  it('falls back to the first word of a long company name', () => {
    const groups = groupInterviewFiles([f('interview-prep/acme-pm.md')], ['ACME Engineering Services GmbH & Co. KG']);
    expect(groups.byCompany['ACME Engineering Services GmbH & Co. KG']).toHaveLength(1);
  });

  it('never matches on a company key shorter than three characters', () => {
    const groups = groupInterviewFiles([f('interview-prep/ab-plan.md')], ['AB']);
    expect(groups.byCompany['AB']).toEqual([]);
    expect(groups.shared).toHaveLength(1);
  });
});

describe('jdCaptureFor', () => {
  const jds = [f('jds/064-2026-09-04_acme_pm.md'), f('jds/7-old.md'), f('jds/2026-09-01_pasted.md')];
  it('matches padded and unpadded report numbers', () => {
    expect(jdCaptureFor(jds, '064')?.name).toBe('064-2026-09-04_acme_pm.md');
    expect(jdCaptureFor(jds, '64')?.name).toBe('064-2026-09-04_acme_pm.md');
    expect(jdCaptureFor(jds, '007')?.name).toBe('7-old.md');
    expect(jdCaptureFor(jds, '6')).toBeNull();
    expect(jdCaptureFor(jds, '')).toBeNull();
  });
});

describe('fileDate', () => {
  it('renders the modification date and blanks an unknown one', () => {
    expect(fileDate(1_757_000_000)).toBe('2025-09-04');
    expect(fileDate(0)).toBe('');
  });
});
