import { useCallback, useState } from 'react';
import { isError, setStatus, type Application } from '../api';
import { isTaskForReport } from './documentTasks';
import { startTask, useRunningTasks } from './taskStore';

export type WriteError = { stale: boolean; message: string };

/**
 * Status-write and task-start plumbing behind the report pane, shared by
 * Pipeline's Kanban/Flat views and Home's recent-activity drawer so both
 * stay wired to the same set-status/task-start behaviour instead of
 * duplicating it.
 */
export function useReportActions(root: string, onReload: () => Promise<unknown>) {
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<WriteError | null>(null);
  const running = useRunningTasks();

  const changeStatus = useCallback(
    async (app: Application, next: string) => {
      setWriteError(null);
      setPendingRow(app.reportNumber);
      try {
        // expectStatus is the value this UI last read. The sidecar refuses the
        // write if the file says something else.
        const r = await setStatus(root, app.reportNumber, app.status, next);
        if (isError(r)) {
          setWriteError({ stale: r.error === 'stale', message: r.message });
          return;
        }
        await onReload();
      } catch (e) {
        setWriteError({ stale: false, message: String(e) });
      } finally {
        setPendingRow(null);
      }
    },
    [root, onReload],
  );

  const onStartTask = useCallback(
    async (taskType: 'pdf' | 'cover', args: Record<string, string>, label: string) => {
      await startTask(taskType, args, root, label);
    },
    [root],
  );

  const runningTaskFor = useCallback(
    (app: Application | null, taskType: 'pdf' | 'cover') => {
      if (!app) return null;
      return running.find((t) => isTaskForReport(t, taskType, app.reportNumber, app.company)) ?? null;
    },
    [running],
  );

  return { pendingRow, writeError, setWriteError, changeStatus, onStartTask, runningTaskFor };
}
