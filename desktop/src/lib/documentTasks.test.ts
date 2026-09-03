import { describe, expect, it } from 'vitest';
import { isTaskForReport } from './documentTasks';
import type { TaskRecord } from './taskStore';

function task(over: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: 't1',
    taskType: 'pdf',
    label: 'CV · Acme',
    startedAt: 0,
    state: 'running',
    events: [],
    rawLog: [],
    outcome: null,
    exitCode: null,
    args: { report: '042' },
    ...over,
  };
}

describe('isTaskForReport', () => {
  it('matches a live task by taskType and args.report', () => {
    expect(isTaskForReport(task(), 'pdf', '042', 'Acme')).toBe(true);
  });

  it('does not match a different task type even if args.report matches', () => {
    expect(isTaskForReport(task({ taskType: 'cover' }), 'pdf', '042', 'Acme')).toBe(false);
  });

  it('does not match a different report number', () => {
    expect(isTaskForReport(task({ args: { report: '043' } }), 'pdf', '042', 'Acme')).toBe(false);
  });

  // A task hydrated from the Rust-side registry after a page reload carries
  // no args (the registry does not persist them) -- fall back to matching
  // the exact label ReportPane/Pipeline construct for each task type.
  it('falls back to the CV label when a hydrated pdf task has no args', () => {
    expect(isTaskForReport(task({ args: {}, label: 'CV · Acme' }), 'pdf', '042', 'Acme')).toBe(true);
  });

  it('falls back to the cover-letter label when a hydrated cover task has no args', () => {
    expect(isTaskForReport(
      task({ taskType: 'cover', args: {}, label: 'Cover letter · Acme' }),
      'cover',
      '042',
      'Acme',
    )).toBe(true);
  });

  it('does not match a hydrated task whose label is for a different company', () => {
    expect(isTaskForReport(task({ args: {}, label: 'CV · Globex' }), 'pdf', '042', 'Acme')).toBe(false);
  });

  it('does not match a hydrated pdf task by the cover-letter label', () => {
    expect(isTaskForReport(task({ args: {}, label: 'Cover letter · Acme' }), 'pdf', '042', 'Acme')).toBe(false);
  });
});
