import { describe, expect, it } from 'vitest';
import { BATCH_LIMIT, batchArgs, batchTaskLabel, processPendingLabel } from './batch';

describe('batch sizing', () => {
  it('evaluates five entries per agent turn', () => {
    expect(BATCH_LIMIT).toBe(5);
    expect(batchArgs()).toEqual({ limit: '5' });
  });

  it('labels the button as evaluating everything, since the desktop chains turns', () => {
    expect(processPendingLabel(45)).toBe('Evaluate all pending');
    expect(processPendingLabel(0)).toBe('Evaluate all pending');
  });

  it('turns the button into a way back to a batch that is already running', () => {
    expect(processPendingLabel(45, true)).toBe('View progress');
  });

  it('labels the task chip with progress against the whole inbox', () => {
    expect(batchTaskLabel(45)).toBe('Evaluating (next 5 of 45 pending)');
    expect(batchTaskLabel(1)).toBe('Evaluating (next 1 of 1 pending)');
  });
});
