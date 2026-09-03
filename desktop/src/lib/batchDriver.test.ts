import { describe, expect, it } from 'vitest';
import { nextAfterTask } from './batchDriver';
import type { TaskRecord } from './taskStore';

function task(over: Partial<TaskRecord>): TaskRecord {
  return {
    taskId: 't', taskType: 'batch', label: '', startedAt: 0, state: 'done', events: [], rawLog: [],
    outcome: { ok: true, detail: '', artifacts: [] }, exitCode: 0, args: {}, ...over,
  };
}

describe('batch driver: what to do when a task finishes', () => {
  it('starts evaluating after a scan that left entries in the inbox', () => {
    expect(nextAfterTask(task({ taskType: 'scan' }), { pendingNow: 45, pendingAtStart: null })).toEqual({ action: 'start-batch' });
  });

  it('stops after a scan when the inbox is empty', () => {
    expect(nextAfterTask(task({ taskType: 'scan' }), { pendingNow: 0, pendingAtStart: null }).action).toBe('stop');
  });

  it('chains the next batch turn while the inbox shrinks', () => {
    expect(nextAfterTask(task({}), { pendingNow: 40, pendingAtStart: 45 })).toEqual({ action: 'start-batch' });
  });

  it('stops when the inbox is empty or a turn made no progress', () => {
    expect(nextAfterTask(task({}), { pendingNow: 0, pendingAtStart: 5 }).action).toBe('stop');
    expect(nextAfterTask(task({}), { pendingNow: 45, pendingAtStart: 45 }).action).toBe('stop');
  });

  it('never chains off a failed task, a hydrated task from a previous session, or other task types', () => {
    expect(nextAfterTask(task({ state: 'failed' }), { pendingNow: 40, pendingAtStart: 45 }).action).toBe('stop');
    expect(nextAfterTask(task({ hydrated: true }), { pendingNow: 40, pendingAtStart: 45 }).action).toBe('stop');
    expect(nextAfterTask(task({ taskType: 'pdf' }), { pendingNow: 40, pendingAtStart: null }).action).toBe('stop');
    expect(nextAfterTask(task({ state: 'running' }), { pendingNow: 40, pendingAtStart: 45 }).action).toBe('stop');
  });
});
