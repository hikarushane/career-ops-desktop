import { describe, expect, it } from 'vitest';
import { finishedTrackerWriterIds } from './trackerRefresh';
import type { TaskRecord } from './taskStore';

const task = (over: Partial<TaskRecord>): TaskRecord => ({
  taskId: 'x', taskType: 'evaluate', label: 'Acme', startedAt: 0, state: 'done',
  events: [], rawLog: [], outcome: null, exitCode: null, args: {}, ...over,
});

describe('finishedTrackerWriterIds', () => {
  it('lists finished tasks that write the tracker, in task order', () => {
    // An evaluation that finishes while another screen is open must still
    // refresh the board: its row only exists on disk until someone re-reads.
    const ids = finishedTrackerWriterIds([
      task({ taskId: 'e1', taskType: 'evaluate' }),
      task({ taskId: 's1', taskType: 'scan' }),
      task({ taskId: 'b1', taskType: 'batch', state: 'failed' }),
    ]);
    expect(ids).toEqual(['e1', 's1', 'b1']);
  });

  it('skips running tasks, tasks restored from a previous session, and tasks that do not touch the tracker', () => {
    const ids = finishedTrackerWriterIds([
      task({ taskId: 'running', state: 'running' }),
      task({ taskId: 'old', hydrated: true }),
      task({ taskId: 'pdf', taskType: 'pdf' }),
      task({ taskId: 'cover', taskType: 'cover' }),
      task({ taskId: 'prep', taskType: 'interview-plan' }),
      task({ taskId: 'profile', taskType: 'profile-generate' }),
    ]);
    expect(ids).toEqual([]);
  });
});
