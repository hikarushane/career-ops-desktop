import type { TaskRecord } from './taskStore';

/** Task types whose completion changes data/applications.md or the inbox. */
const TRACKER_WRITERS = new Set(['evaluate', 'scan', 'batch']);

/**
 * Ids of tasks that finished in this session and may have changed the
 * tracker, so the board can be re-read once per completion. A task that
 * finishes while another screen is open has no other path back to the UI:
 * its row exists on disk only until something calls list again.
 */
export function finishedTrackerWriterIds(tasks: TaskRecord[]): string[] {
  return tasks
    .filter((t) => t.state !== 'running' && !t.hydrated && TRACKER_WRITERS.has(t.taskType))
    .map((t) => t.taskId);
}
