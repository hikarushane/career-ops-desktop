import { useCallback, type ReactNode } from 'react';
import AgentActivity from '../components/AgentActivity';
import { t } from '../lib/i18n';
import { cancel, useTask } from '../lib/taskStore';

type Props = {
  taskId: string | null; title: string; onRetry: () => void;
  children?: ReactNode; doneAction?: { label: string; onClick: () => void };
  onCancelled?: () => void;
  /** Top-left Back: leaves the screen without touching the task (it keeps running behind the header chip). */
  onBack?: () => void;
};

export default function TaskScreen({ taskId, title, onRetry, children, doneAction, onCancelled, onBack }: Props) {
  const task = useTask(taskId);

  const handleCancel = useCallback(async () => {
    if (!task) return;
    await cancel(task.taskId);
    onCancelled?.();
  }, [task, onCancelled]);

  return (
    <div className="eval-screen">
      {onBack && <button type="button" className="btn-ghost screen-back" onClick={onBack}>&larr; {t('Back')}</button>}
      <h1>{title}</h1>
      {children}
      {task && <AgentActivity task={task} onCancel={() => void handleCancel()} onRetry={onRetry} />}
      {(task?.state === 'done' || task?.state === 'failed') && doneAction && (
        <div className="eval-done-actions"><button className="btn-primary" onClick={doneAction.onClick}>{doneAction.label}</button></div>
      )}
    </div>
  );
}
