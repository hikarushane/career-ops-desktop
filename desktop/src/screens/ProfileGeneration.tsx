import { useCallback, useEffect, useRef, useState } from 'react';
import { applyGeneration, discardGeneration, languageSettings, type GenerationResult, type GenerationTarget } from '../api';
import { cancelTask, generateProfile } from '../lib/runner';
import { preferencesToPrompt, type JobPreferences } from '../lib/jobPreferences';
import { CheckIcon } from '../components/icons';

type Props = {
  root: string;
  preferences: JobPreferences;
  onComplete: () => void;
  onSkip: () => void;
};

type Phase = 'running' | 'preview' | 'error';

const TARGETS: GenerationTarget[] = ['cv.md', 'config/profile.yml', 'modes/_profile.md', 'portals.yml'];

export default function ProfileGeneration({ root, preferences, onComplete, onSkip }: Props) {
  const [phase, setPhase] = useState<Phase>('running');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [written, setWritten] = useState<GenerationTarget[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [selected, setSelected] = useState<GenerationTarget>('cv.md');
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const started = useRef(false);
  const activeTask = useRef<string | null>(null);

  const generate = useCallback(async () => {
    setPhase('running');
    setError(null);
    setWritten([]);
    setResult(null);
    try {
      let analysisLanguage = 'en';
      try {
        analysisLanguage = (await languageSettings(root)).analysisLanguage || 'en';
      } catch {
        // Fall back to English when the language sidecar is unavailable.
      }
      const generated = await generateProfile(root, preferencesToPrompt(preferences), analysisLanguage, {
        onStarted: (id) => { activeTask.current = id; setTaskId(id); },
        onFileWritten: (file) => setWritten((current) => (current.includes(file) ? current : [...current, file])),
      });
      setResult(generated);
      setSelected(generated.files.find((file) => file.content !== null)?.path ?? 'cv.md');
      setPhase('preview');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Profile generation failed.');
      setPhase('error');
    }
  }, [root, preferences]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void generate();
    return () => {
      const id = activeTask.current;
      if (id) {
        void cancelTask(id).catch(() => {});
        void discardGeneration(id).catch(() => {});
      }
    };
  }, [generate]);

  const apply = useCallback(async () => {
    if (!taskId) return;
    setApplying(true);
    setError(null);
    try {
      await applyGeneration(taskId);
      activeTask.current = null;
      onComplete();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setApplying(false);
    }
  }, [taskId, onComplete]);

  const regenerate = useCallback(() => {
    if (taskId) void discardGeneration(taskId).catch(() => {});
    activeTask.current = null;
    setTaskId(null);
    void generate();
  }, [taskId, generate]);

  const skip = useCallback(() => {
    if (taskId) void discardGeneration(taskId).catch(() => {});
    activeTask.current = null;
    onSkip();
  }, [taskId, onSkip]);

  if (phase === 'running') {
    return (
      <div className="setup-screen">
        <h1><span className="animated-dots">Generating your profile</span></h1>
        <p className="setup-subtitle">
          The AI is reading your documents and writing four profile files. This usually takes one to three minutes.
        </p>
        <p className="setup-hint" role="status" aria-live="polite">{`${written.length} of 4 files written`}</p>
        <div className="profile-gen-steps">
          {TARGETS.map((file) => {
            const done = written.includes(file);
            const active = !done && written.length === TARGETS.indexOf(file);
            return (
              <div key={file} className={`agent-step ${done ? 'done' : active ? 'active' : ''}`}>
                <span className="agent-step-dot" aria-hidden="true">{done ? <CheckIcon size={10} /> : null}</span>
                <span className={active ? 'animated-dots' : undefined}>{file}</span>
              </div>
            );
          })}
        </div>
        <div className="setup-actions">
          <button className="btn-ghost" onClick={skip}>Skip for now</button>
        </div>
      </div>
    );
  }

  if (phase === 'error' || !result) {
    return (
      <div className="setup-screen">
        <h1>Generation failed</h1>
        <p className="setup-subtitle">Nothing was written to your workspace. You can try again or skip this step.</p>
        {error && <pre className="intake-error" role="alert">{error}</pre>}
        <div className="setup-actions">
          <button className="btn-primary" onClick={regenerate}>Try again</button>
          <button className="btn-ghost" onClick={skip}>Skip for now</button>
        </div>
      </div>
    );
  }

  const current = result.files.find((file) => file.path === selected) ?? result.files[0];

  return (
    <div className="setup-screen generation-preview">
      <h1>Review your profile</h1>
      <p className="setup-subtitle">
        {result.complete
          ? 'All four files were generated. Apply them to your workspace, or regenerate if something looks off.'
          : 'Some files are missing or did not pass validation. You can still apply the ones that look right, or regenerate.'}
      </p>

      <div className="generation-tabs" role="tablist" aria-label="Generated files">
        {result.files.map((file) => (
          <button
            key={file.path}
            role="tab"
            aria-selected={file.path === current.path}
            className={`generation-tab ${file.path === current.path ? 'selected' : ''} ${file.valid ? '' : 'invalid'}`}
            onClick={() => setSelected(file.path)}
          >
            {file.path}
            {!file.valid && <span className="generation-tab-flag" aria-label="Needs attention">!</span>}
          </button>
        ))}
      </div>

      {current.issue && <p className="intake-error" role="alert">{current.path}: {current.issue}</p>}
      <pre className="generation-file" role="tabpanel">{current.content ?? '(not written)'}</pre>

      {error && <p className="intake-error" role="alert">{error}</p>}

      <div className="setup-actions">
        <button className="btn-primary" onClick={apply} disabled={applying || !result.files.some((file) => file.content !== null)}>
          {applying ? <span className="animated-dots">Applying</span> : 'Apply'}
        </button>
        <button className="btn-secondary" onClick={regenerate} disabled={applying}>Regenerate</button>
        <button className="btn-ghost" onClick={skip} disabled={applying}>Skip for now</button>
      </div>
    </div>
  );
}
