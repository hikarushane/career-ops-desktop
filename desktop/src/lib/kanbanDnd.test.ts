import { describe, expect, it } from 'vitest';
import type { Application } from '../api';
import { resolveDrop } from './kanbanDnd';

function app(over: Partial<Application>): Application {
  return {
    number: 1, date: '', company: 'X', role: 'Dev', status: 'Evaluated', normStatus: 'evaluated', statusPriority: 5,
    score: 3, scoreRaw: '3.0/5', hasPdf: false, pdfPath: '', coverLetterPath: '', reportPath: '', reportNumber: '001',
    notes: '', jobUrl: '', archetype: '', tldr: '', remote: '', compEstimate: '', ...over,
  };
}

describe('dropping a card on a status column', () => {
  const apps = [app({ reportNumber: '001' }), app({ reportNumber: '002', status: 'Applied', normStatus: 'applied' })];

  it('resolves to the card and the canonical label of the target column', () => {
    expect(resolveDrop(apps, '001', 'applied')).toEqual({ app: apps[0], next: 'Applied' });
  });

  it('is a no-op when dropped back on its own column, on an unknown card, or on a virtual column', () => {
    expect(resolveDrop(apps, '002', 'applied')).toBeNull();
    expect(resolveDrop(apps, '999', 'applied')).toBeNull();
    expect(resolveDrop(apps, '001', 'top')).toBeNull();
  });
});
