import { useCallback, useState } from 'react';
import TaskScreen from './TaskScreen';
import { startTask } from '../lib/taskStore';

export default function Scanner({ root, onDone }: { root: string; onDone: () => void }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

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

  return (
    <TaskScreen taskId={taskId} title="Find matching jobs" onRetry={start} doneAction={{ label: 'View results', onClick: onDone }}>
      {!taskId && (
        <>
          <p>Scan configured job sources for new opportunities that match your profile.</p>
          <button className="btn-primary" onClick={start} disabled={starting}>Start scanning</button>
          {startError && <p className="intake-error" role="alert">{startError}</p>}
        </>
      )}
    </TaskScreen>
  );
}
