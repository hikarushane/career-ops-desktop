import type { ReactNode } from 'react';
import AgentActivity from '../components/AgentActivity';
import { cancel, useTask } from '../lib/taskStore';

type Props = {
  taskId: string | null; title: string; onRetry: () => void;
  children?: ReactNode; doneAction?: { label: string; onClick: () => void };
};

export default function TaskScreen({ taskId, title, onRetry, children, doneAction }: Props) {
  const task = useTask(taskId);
  return (
    <div className="eval-screen">
      <h1>{title}</h1>
      {children}
      {task && <AgentActivity task={task} onCancel={() => void cancel(task.taskId)} onRetry={onRetry} />}
      {task?.state === 'done' && doneAction && (
        <div className="eval-done-actions"><button className="btn-primary" onClick={doneAction.onClick}>{doneAction.label}</button></div>
      )}
    </div>
  );
}
