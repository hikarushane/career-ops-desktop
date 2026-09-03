import type { TaskRecord } from './taskStore';

export type ChainDecision = { action: 'start-batch' } | { action: 'stop'; reason: string };

/**
 * "Search & evaluate" as one flow: a scan hands off to evaluation, and each
 * evaluation turn (BATCH_LIMIT entries) hands off to the next until the inbox
 * is empty. The desktop makes the decision between turns, so no single agent
 * run has to survive a whole inbox.
 *
 * `pendingAtStart` is the inbox size when the finished batch turn began;
 * a turn that did not shrink it stops the chain instead of looping forever.
 */
export function nextAfterTask(
  task: TaskRecord,
  inbox: { pendingNow: number; pendingAtStart: number | null },
): ChainDecision {
  if (task.hydrated) return { action: 'stop', reason: 'task from a previous session' };
  if (task.state !== 'done') return { action: 'stop', reason: `task ${task.state}` };
  if (task.taskType !== 'scan' && task.taskType !== 'batch') return { action: 'stop', reason: 'not a pipeline task' };
  if (inbox.pendingNow === 0) return { action: 'stop', reason: 'inbox empty' };
  if (task.taskType === 'batch' && inbox.pendingAtStart !== null && inbox.pendingNow >= inbox.pendingAtStart) {
    return { action: 'stop', reason: 'no progress in the last turn' };
  }
  return { action: 'start-batch' };
}
