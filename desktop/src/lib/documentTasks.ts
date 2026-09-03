import type { TaskRecord } from './taskStore';

/**
 * Whether `task` represents in-flight work on a specific application's CV
 * or cover letter.
 *
 * Prefers matching `args.report`, the identifier ReportPane/Pipeline pass
 * when starting the task. But a task hydrated from the Rust-side task
 * registry after a reload (initTaskStore's `listTasks()` path in
 * taskStore.ts) carries `args: {}` -- the registry does not persist the
 * original args -- so `args.report` alone would never match a hydrated
 * task and "Generating CV..." would silently revert to "Generate CV" after
 * a reload while the task is still running. Fall back to an exact match on
 * the label ReportPane/Pipeline construct for each task type: `CV ·
 * {company}` for "pdf", `Cover letter · {company}` for "cover".
 */
export function isTaskForReport(
  task: TaskRecord,
  taskType: 'pdf' | 'cover',
  reportNumber: string,
  company: string,
): boolean {
  if (task.taskType !== taskType) return false;
  // A live task always carries the args it was started with; trust that
  // outright (match or not) rather than also checking the label, which
  // could coincidentally match a stale/different task. Only a hydrated
  // task -- args entirely absent -- falls back to the label.
  if (task.args.report !== undefined) return task.args.report === reportNumber;
  const expectedLabel = taskType === 'pdf' ? `CV · ${company}` : `Cover letter · ${company}`;
  return task.label === expectedLabel;
}
