import { useCallback, useEffect, useRef, useState } from 'react';
import AgentActivity from '../components/AgentActivity';
import { runTask, cancelTask } from '../lib/runner';
import {
  languageSettings,
  resolveJobLanguage,
  type JobLanguageResolution,
  type LanguageSettings,
} from '../api';

type Props = {
  root: string;
  initialUrl?: string;
  onDone: () => void;
};

const EVAL_STEPS = [
  'Reading job posting',
  'Matching your background',
  'Analysing role requirements',
  'Researching compensation',
  'Generating evaluation',
];

export default function Evaluate({ root, initialUrl, onDone }: Props) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [status, setStatus] = useState<'input' | 'running' | 'done' | 'error'>('input');
  const [step, setStep] = useState(0);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [stdout, setStdout] = useState<string[]>([]);
  const [stderr, setStderr] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [unlistenFn, setUnlistenFn] = useState<(() => void) | null>(null);
  const [languages, setLanguages] = useState<LanguageSettings | null>(null);
  const [jobLanguage, setJobLanguage] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState<JobLanguageResolution | null>(null);
  const documentLanguageRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    languageSettings(root).then(setLanguages).catch(() => setLanguages(null));
  }, [root]);

  useEffect(() => {
    if (/^https?:\/\//i.test(url.trim()) || url.trim().length < 80) {
      setDetectedLanguage(null);
      return;
    }
    const timer = window.setTimeout(() => {
      resolveJobLanguage(root, url).then(setDetectedLanguage).catch(() => setDetectedLanguage(null));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [root, url]);

  const start = useCallback(async () => {
    if (!url.trim()) return;
    setStatus('running');
    setStep(0);
    setStdout([]);
    setStderr([]);

    const languageContext = languages
      ? {
          analysisLanguage: languages.analysisLanguage,
          ...(jobLanguage ? { jobLanguage, jobLanguageSource: 'manual-override', jobLanguageConfidence: 1 } : {}),
        }
      : undefined;

    const { taskId: tid, unlisten } = await runTask(
      'evaluate',
      { url: url.trim() },
      root,
      {
        onOutput: (stream, data) => {
          if (stream === 'stdout') {
            setStdout((prev) => [...prev, data]);
            setStep((s) => Math.min(s + 1, EVAL_STEPS.length - 1));
          } else {
            setStderr((prev) => [...prev, data]);
          }
        },
        onFinished: (code, success) => {
          setExitCode(code);
          setStatus(success ? 'done' : 'error');
          },
        },
      languageContext,
    );
    setTaskId(tid);
    setUnlistenFn(() => unlisten);
  }, [url, root, languages, jobLanguage]);

  const cancel = useCallback(async () => {
    if (taskId) await cancelTask(taskId);
    unlistenFn?.();
    setStatus('input');
  }, [taskId, unlistenFn]);

  if (status === 'input') {
    return (
      <div className="eval-screen">
        <h1>Evaluate a job</h1>
        <div className="action-input-row">
          <input
            type="text"
            placeholder="Paste job URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
            autoFocus
          />
          <button className="btn-primary" onClick={start} disabled={!url.trim()}>
            Analyse
          </button>
        </div>
        {languages && (
          <section className="document-language-picker">
            <label>
              <span>Document language</span>
              <select ref={documentLanguageRef} value={jobLanguage} onChange={(event) => setJobLanguage(event.target.value)}>
                <option value="">Detect from the job description</option>
                {languages.options.map((option) => (
                  <option key={option.code} value={option.code}>{option.name}</option>
                ))}
              </select>
            </label>
            <p className="setup-hint">
              Analysis uses {languages.analysisLanguage}; generated CVs, cover letters, and interview practice use this job language.
            </p>
            {detectedLanguage && (
              <p className="setup-hint">
                Detected document language: {detectedLanguage.language} ({Math.round(detectedLanguage.confidence * 100)}% confidence).
                {detectedLanguage.warning && (
                  <>
                    {' '}{detectedLanguage.warning}{' '}
                    <button className="btn-ghost language-change-button" type="button" onClick={() => documentLanguageRef.current?.focus()}>
                      [Change]
                    </button>
                  </>
                )}
              </p>
            )}
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="eval-screen">
      <h1>{status === 'done' ? 'Evaluation complete' : 'Evaluating...'}</h1>

      <AgentActivity
        taskId={taskId}
        status={status === 'done' ? 'done' : status === 'error' ? 'error' : 'running'}
        steps={EVAL_STEPS}
        currentStep={step}
        stdout={stdout}
        stderr={stderr}
        exitCode={exitCode}
        onCancel={cancel}
        onRetry={start}
      />

      {status === 'done' && (
        <div className="eval-done-actions">
          <button className="btn-primary" onClick={onDone}>Back to pipeline</button>
        </div>
      )}
    </div>
  );
}
