import { useCallback, type ReactNode } from 'react';
import AgentActivity from '../components/AgentActivity';
import { cancel, useTask } from '../lib/taskStore';

type Props = {
  taskId: string | null; title: string; onRetry: () => void;
  children?: ReactNode; doneAction?: { label: string; onClick: () => void };
  onCancelled?: () => void;
};

export default function TaskScreen({ taskId, title, onRetry, children, doneAction, onCancelled }: Props) {
  const task = useTask(taskId);

  const handleCancel = useCallback(async () => {
    if (!task) return;
    await cancel(task.taskId);
    onCancelled?.();
  }, [task, onCancelled]);

  return (
    <div className="eval-screen">
      <h1>{title}</h1>
      {children}
      {task && <AgentActivity task={task} onCancel={() => void handleCancel()} onRetry={onRetry} />}
      {(task?.state === 'done' || task?.state === 'failed') && doneAction && (
        <div className="eval-done-actions"><button className="btn-primary" onClick={doneAction.onClick}>{doneAction.label}</button></div>
      )}
    </div>
  );
}
