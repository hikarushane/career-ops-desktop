import { useCallback, useEffect, useRef, useState } from 'react';
import TaskScreen from './TaskScreen';
import { getTask, startTask } from '../lib/taskStore';
import {
  fetchPosting,
  isError,
  saveJobCapture,
  languageSettings,
  resolveJobLanguage,
  type JobLanguageResolution,
  type LanguageSettings,
} from '../api';

type Props = {
  root: string;
  initialUrl?: string;
  initialTaskId?: string | null;
  onDone: () => void;
};

type FetchState = { kind: 'idle' } | { kind: 'fetching' } | { kind: 'blocked'; url: string; reason: string };

function isUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function hostOf(url: string): string {
  try {
    return new URL(url.trim()).host;
  } catch {
    return url.trim().slice(0, 40);
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Evaluate({ root, initialUrl, initialTaskId, onDone }: Props) {
  // State order: input, jdText, fetchState, taskId, startError, starting, languages, jobLanguage, detectedLanguage
  const [input, setInput] = useState(initialUrl ?? '');
  const [jdText, setJdText] = useState('');
  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'idle' });
  const [taskId, setTaskId] = useState<string | null>(initialTaskId ?? null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [languages, setLanguages] = useState<LanguageSettings | null>(null);
  const [jobLanguage, setJobLanguage] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState<JobLanguageResolution | null>(null);
  const documentLanguageRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    languageSettings(root).then(setLanguages).catch(() => setLanguages(null));
  }, [root]);

  useEffect(() => {
    if (/^https?:\/\//i.test(input.trim()) || input.trim().length < 80) {
      setDetectedLanguage(null);
      return;
    }
    const timer = window.setTimeout(() => {
      resolveJobLanguage(root, input).then(setDetectedLanguage).catch(() => setDetectedLanguage(null));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [root, input]);

  const start = useCallback(async () => {
    const value = input.trim();
    if (!value || starting) return;

    setStartError(null);
    setStarting(true);
    try {
      const languageContext = languages
        ? {
            analysisLanguage: languages.analysisLanguage,
            ...(jobLanguage ? { jobLanguage, jobLanguageSource: 'manual-override', jobLanguageConfidence: 1 } : {}),
          }
        : undefined;

      if (fetchState.kind === 'blocked' && fetchState.url === value) {
        if (jdText.trim().length < 200) return;
        const capture = await saveJobCapture(
          root,
          `${today()}_pasted`,
          `Source: ${fetchState.url}\n\n${jdText.trim()}`,
        );
        setTaskId(
          await startTask(
            'evaluate',
            { url: fetchState.url, url_line: ` Posting URL: ${fetchState.url}.`, capture },
            root,
            hostOf(fetchState.url),
            languageContext,
          ),
        );
        setFetchState({ kind: 'idle' });
        setJdText('');
        return;
      }

      if (fetchState.kind === 'blocked') {
        // The input changed since the block; the stale paste box no longer
        // applies to the current value. Reset and fall through below.
        setFetchState({ kind: 'idle' });
      }

      if (!isUrl(value)) {
        const capture = await saveJobCapture(root, `${today()}_pasted`, value);
        setTaskId(
          await startTask(
            'evaluate',
            { url: '', url_line: '', capture },
            root,
            'Pasted job description',
            languageContext,
          ),
        );
        return;
      }

      setFetchState({ kind: 'fetching' });
      const fetched = await fetchPosting(value);
      if (isError(fetched)) {
        setFetchState({ kind: 'blocked', url: value, reason: fetched.message });
        return;
      }
      const capture = await saveJobCapture(
        root,
        `${today()}_${fetched.company || hostOf(value)}_${fetched.title || 'posting'}`,
        `Source: ${value}\n\n${fetched.text}`,
      );
      setFetchState({ kind: 'idle' });
      setTaskId(
        await startTask(
          'evaluate',
          { url: value, url_line: ` Posting URL: ${value}.`, capture },
          root,
          fetched.company || hostOf(value),
          languageContext,
        ),
      );
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }, [input, jdText, fetchState, root, languages, jobLanguage, starting]);

  // initialTaskId never changes across this component's lifetime (App
  // remounts Evaluate with a fresh key whenever activeTaskId changes), so
  // looking it up once here per render is safe and stable. Computed (and
  // retryBatch declared) unconditionally, alongside the other hooks above,
  // rather than after the taskId===null early return below — taskId flips
  // from null to non-null within this same component instance once start()
  // succeeds, so a hook declared only past that guard would be called on
  // some renders and not others, which breaks React's Rules of Hooks.
  const initialTask = initialTaskId ? getTask(initialTaskId) : null;
  const isBatchTask = initialTask?.taskType === 'batch';

  const retryBatch = useCallback(async () => {
    setStartError(null);
    try {
      setTaskId(await startTask('batch', {}, root, initialTask?.label ?? 'Batch processing'));
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    }
  }, [root, initialTask]);

  // Retry after reopening a failed evaluate task from the header chip must
  // reuse the args/label/languageContext it was originally started with —
  // re-running `start()` here would be a silent no-op, since the input/
  // jdText/languages state above is empty on a freshly-mounted (remounted
  // via App's `key={activeTaskId}`) instance that never went through the
  // "paste a URL and click Analyse" flow.
  const retryEvaluate = useCallback(async () => {
    setStartError(null);
    try {
      const current = taskId ? getTask(taskId) : null;
      setTaskId(
        await startTask(
          'evaluate',
          current?.args ?? {},
          root,
          current?.label ?? 'Evaluating',
          current?.languageContext,
        ),
      );
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    }
  }, [root, taskId]);

  const pasteReady = jdText.trim().length >= 200;

  if (taskId === null) {
    return (
      <div className="eval-screen">
        <h1>Evaluate a job</h1>
        <div className="action-input-row">
          <textarea
            className="eval-input"
            rows={2}
            placeholder="Paste a job URL, or paste the full job description..."
            value={input}
            onChange={(e) => {
              const next = e.target.value;
              setInput(next);
              if (fetchState.kind === 'blocked' && next.trim() !== fetchState.url) {
                setFetchState({ kind: 'idle' });
              }
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                start();
                return;
              }
              if (!e.shiftKey && isUrl(input)) {
                e.preventDefault();
                start();
              }
            }}
            autoFocus
          />
          <button
            className="btn-primary"
            onClick={start}
            disabled={!input.trim() || starting || (fetchState.kind === 'blocked' && !pasteReady)}
          >
            {fetchState.kind === 'fetching' ? 'Fetching…' : 'Analyse'}
          </button>
        </div>
        {fetchState.kind === 'fetching' && (
          <p className="setup-hint" role="status">Fetching the posting…</p>
        )}
        {fetchState.kind === 'blocked' && (
          <div className="eval-blocked" role="alert">
            <p>Could not read this page automatically ({fetchState.reason}). Paste the job description below.</p>
            <textarea
              rows={10}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the job description"
              aria-label="Paste the job description"
            />
            <p className="setup-hint">{jdText.trim().length} / 200 characters minimum</p>
          </div>
        )}
        {startError && <p className="intake-error" role="alert">{startError}</p>}
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
    <TaskScreen
      taskId={taskId}
      title={isBatchTask ? 'Processing pending jobs' : 'Evaluating'}
      onRetry={isBatchTask ? retryBatch : retryEvaluate}
      doneAction={{ label: 'Back to pipeline', onClick: onDone }}
      onCancelled={isBatchTask ? onDone : () => setTaskId(null)}
    />
  );
}
