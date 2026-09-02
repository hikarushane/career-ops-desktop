import { useCallback, useState } from 'react';
import TaskScreen from './TaskScreen';
import { getTask, startTask, useRunningTasks } from '../lib/taskStore';

type Props = { root: string; initialTaskId?: string | null; onDone: () => void };

export default function Scanner({ root, initialTaskId, onDone }: Props) {
  const [taskId, setTaskId] = useState<string | null>(initialTaskId ?? null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const scanAlreadyRunning = useRunningTasks().some((t) => t.taskType === 'scan');

  const start = useCallback(async () => {
    setStartError(null);
    setStarting(true);
    try {
      setTaskId(await startTask('scan', {}, root, 'Scan'));
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }, [root]);

  // Retry after reopening a failed scan from the header chip must reuse the
  // task's own args/label rather than re-running start() with this fresh
  // instance's (empty) local state — see Evaluate's retryEvaluate.
  const retry = useCallback(async () => {
    setStartError(null);
    try {
      const current = taskId ? getTask(taskId) : null;
      setTaskId(await startTask('scan', current?.args ?? {}, root, current?.label ?? 'Scan', current?.languageContext));
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    }
  }, [root, taskId]);

  return (
    <TaskScreen taskId={taskId} title="Find matching jobs" onRetry={retry} doneAction={{ label: 'View results', onClick: onDone }}>
      {!taskId && (
        <>
          <p>Scan configured job sources for new opportunities that match your profile.</p>
          <button className="btn-primary" onClick={start} disabled={starting || scanAlreadyRunning}>Start scanning</button>
          {scanAlreadyRunning && (
            <p className="setup-hint">A scan is already running — open it from the header.</p>
          )}
          {startError && <p className="intake-error" role="alert">{startError}</p>}
        </>
      )}
    </TaskScreen>
  );
}
