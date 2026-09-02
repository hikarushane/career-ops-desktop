import { useCallback, useState } from 'react';
import TaskScreen from './TaskScreen';
import { startTask } from '../lib/taskStore';

export default function Scanner({ root, onDone }: { root: string; onDone: () => void }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const start = useCallback(async () => setTaskId(await startTask('scan', {}, root, 'Scan')), [root]);
  return (
    <TaskScreen taskId={taskId} title="Find matching jobs" onRetry={start} doneAction={{ label: 'View results', onClick: onDone }}>
      {!taskId && (<><p>Scan configured job sources for new opportunities that match your profile.</p><button className="btn-primary" onClick={start}>Start scanning</button></>)}
    </TaskScreen>
  );
}
