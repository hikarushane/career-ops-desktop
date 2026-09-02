import { useCallback, useEffect, useRef, useState } from 'react';
import TaskScreen from './TaskScreen';
import { startTask } from '../lib/taskStore';
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

function labelFor(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).host;
    } catch {
      // fall through to generic truncation below
    }
  }
  return trimmed.slice(0, 40);
}

export default function Evaluate({ root, initialUrl, onDone }: Props) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [taskId, setTaskId] = useState<string | null>(null);
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

    const languageContext = languages
      ? {
          analysisLanguage: languages.analysisLanguage,
          ...(jobLanguage ? { jobLanguage, jobLanguageSource: 'manual-override', jobLanguageConfidence: 1 } : {}),
        }
      : undefined;

    setTaskId(await startTask('evaluate', { url: url.trim() }, root, labelFor(url), languageContext));
  }, [url, root, languages, jobLanguage]);

  if (taskId === null) {
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
    <TaskScreen taskId={taskId} title="Evaluating" onRetry={start} doneAction={{ label: 'Back to pipeline', onClick: onDone }} />
  );
}
