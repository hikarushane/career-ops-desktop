import { t } from '../lib/i18n';
import type { TaskRecord } from '../lib/taskStore';

const VERBS: Record<string, string> = {
  evaluate: 'Evaluating', scan: 'Scanning', batch: 'Processing', 'profile-generate': 'Generating profile',
  'profile-update': 'Updating profile', pdf: 'Generating CV', cover: 'Writing cover letter',
};
function verb(type: string) { return t(VERBS[type] ?? (type.startsWith('interview') ? 'Preparing' : 'Running')); }
function minutes(startedAt: number) { return `${Math.max(0, Math.floor((Date.now() - startedAt) / 60_000))}m`; }

type Props = { tasks: TaskRecord[]; onOpen: (taskId: string) => void; onDismiss: (taskId: string) => void };

export default function TaskChip({ tasks, onOpen, onDismiss }: Props) {
  if (tasks.length === 0) return null;
  const running = tasks.filter((t) => t.state === 'running');
  if (running.length > 1) {
    return (
      <span className="task-chip running">
        <button className="task-chip-main" onClick={() => onOpen(running[0].taskId)}>
          {t('{n} tasks running', { n: running.length })}
        </button>
      </span>
    );
  }
  const task = running[0] ?? tasks[0];
  const label = task.state === 'running'
    ? `${verb(task.taskType)} ${task.label} · ${minutes(task.startedAt)}`
    : `${task.state === 'done' ? t('Done') : t('Failed')} · ${task.label}`;
  return (
    <span className={`task-chip ${task.state}`}>
      <button className="task-chip-main" onClick={() => onOpen(task.taskId)}>{label}</button>
      {task.state !== 'running' && (
        <button className="task-chip-dismiss" aria-label={t('Dismiss')} onClick={() => onDismiss(task.taskId)}>×</button>
      )}
    </span>
  );
}
