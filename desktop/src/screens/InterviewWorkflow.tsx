import { useCallback, useEffect, useState } from 'react';
import TaskScreen from './TaskScreen';
import { startTask } from '../lib/taskStore';
import { languageSettings, type LanguageSettings, type TaskType } from '../api';

type Props = {
  root: string;
  mode: 'interview-plan' | 'interview-practice' | 'interview-debrief';
  company: string;
  role: string;
  onBack: () => void;
};

const TITLES: Record<string, string> = {
  'interview-plan': 'Interview Prep Plan',
  'interview-practice': 'Practice Interview',
  'interview-debrief': 'Post-Interview Debrief',
};

export default function InterviewWorkflow({ root, mode, company, role, onBack }: Props) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [languages, setLanguages] = useState<LanguageSettings | null>(null);
  const [jobLanguage, setJobLanguage] = useState('');

  useEffect(() => {
    languageSettings(root).then(setLanguages).catch(() => setLanguages(null));
  }, [root]);

  const start = useCallback(async () => {
    const languageContext = languages
      ? {
          analysisLanguage: languages.analysisLanguage,
          ...(jobLanguage ? { jobLanguage, jobLanguageSource: 'manual-override', jobLanguageConfidence: 1 } : {}),
        }
      : undefined;
    setTaskId(await startTask(mode as TaskType, { company, role }, root, `${TITLES[mode] ?? mode} · ${company}`, languageContext));
  }, [root, mode, company, role, languages, jobLanguage]);

  return (
    <TaskScreen taskId={taskId} title={TITLES[mode] ?? mode} onRetry={start} doneAction={{ label: 'Done', onClick: onBack }}>
      <button className="btn-ghost" onClick={onBack}>&larr; Back</button>
      <p>{company} &mdash; {role}</p>
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
      {!taskId && <button className="btn-primary" onClick={start}>Start</button>}
    </TaskScreen>
  );
}
