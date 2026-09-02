import { useCallback, useEffect, useState } from 'react';
import TaskScreen from './TaskScreen';
import { getTask, startTask, useRunningTasks } from '../lib/taskStore';
import { languageSettings, type LanguageSettings, type TaskType } from '../api';

type Mode = 'interview-plan' | 'interview-practice' | 'interview-debrief';

type Props = {
  root: string;
  mode: Mode;
  company: string;
  role: string;
  initialTaskId?: string | null;
  onBack: () => void;
};

const TITLES: Record<string, string> = {
  'interview-plan': 'Interview Prep Plan',
  'interview-practice': 'Practice Interview',
  'interview-debrief': 'Post-Interview Debrief',
};

export default function InterviewWorkflow({ root, mode, company, role, initialTaskId, onBack }: Props) {
  const [taskId, setTaskId] = useState<string | null>(initialTaskId ?? null);
  const [languages, setLanguages] = useState<LanguageSettings | null>(null);
  const [jobLanguage, setJobLanguage] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const modeAlreadyRunning = useRunningTasks().some((t) => t.taskType === mode);

  useEffect(() => {
    languageSettings(root).then(setLanguages).catch(() => setLanguages(null));
  }, [root]);

  // Reopening from the header chip only carries a task id, not the original
  // company/role props (App doesn't know them), so the subtitle falls back
  // to the task's own label whenever one is available.
  const initialTask = initialTaskId ? getTask(initialTaskId) : null;

  const start = useCallback(async () => {
    setStartError(null);
    setStarting(true);
    try {
      const languageContext = languages
        ? {
            analysisLanguage: languages.analysisLanguage,
            ...(jobLanguage ? { jobLanguage, jobLanguageSource: 'manual-override', jobLanguageConfidence: 1 } : {}),
          }
        : undefined;
      setTaskId(await startTask(mode as TaskType, { company, role }, root, `${TITLES[mode] ?? mode} · ${company}`, languageContext));
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }, [root, mode, company, role, languages, jobLanguage]);

  // Retry after reopening a failed task from the header chip must reuse its
  // stored args/label/languageContext — see Evaluate's retryEvaluate for why
  // re-running start() on a freshly-mounted instance would be a no-op.
  const retry = useCallback(async () => {
    setStartError(null);
    try {
      const current = taskId ? getTask(taskId) : null;
      setTaskId(
        await startTask(
          mode as TaskType,
          current?.args ?? { company, role },
          root,
          current?.label ?? `${TITLES[mode] ?? mode} · ${company}`,
          current?.languageContext,
        ),
      );
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    }
  }, [root, mode, company, role, taskId]);

  return (
    <TaskScreen taskId={taskId} title={TITLES[mode] ?? mode} onRetry={retry} doneAction={{ label: 'Done', onClick: onBack }}>
      <button className="btn-ghost" onClick={onBack}>&larr; Back</button>
      <p>{initialTask ? initialTask.label : <>{company} &mdash; {role}</>}</p>
      {languages && (
        <label className="workflow-language-picker">
          <span>Interview language</span>
          <select value={jobLanguage} onChange={(event) => setJobLanguage(event.target.value)} disabled={taskId !== null}>
            <option value="">Detect from this job's description</option>
            {languages.options.map((option) => (
              <option key={option.code} value={option.code}>{option.name}</option>
            ))}
          </select>
          <small>Practice, planning, and debrief material follow the job language; analysis stays {languages.analysisLanguage}.</small>
        </label>
      )}
      {!taskId && <button className="btn-primary" onClick={start} disabled={starting || modeAlreadyRunning}>Start</button>}
      {modeAlreadyRunning && (
        <p className="setup-hint">An interview prep task is already running — open it from the header.</p>
      )}
      {startError && <p className="intake-error" role="alert">{startError}</p>}
    </TaskScreen>
  );
}
