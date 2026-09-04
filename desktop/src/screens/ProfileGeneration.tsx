import { useCallback, useEffect, useRef, useState } from 'react';
import { applyGeneration, discardGeneration, languageSettings, type GenerationResult, type GenerationTarget } from '../api';
import { cancelTask, generateProfile, type GenerationFeedback } from '../lib/runner';
import { preferencesToPrompt, type JobPreferences } from '../lib/jobPreferences';
import { t } from '../lib/i18n';
import { CheckIcon } from '../components/icons';

type Props = {
  root: string;
  preferences: JobPreferences;
  onComplete: () => void;
  onSkip: () => void;
  /**
   * `generate` (default) writes all four profile files from documents/;
   * `update` rewrites only the targeting files from changed preferences and
   * leaves cv.md alone (Settings > Job Search).
   */
  mode?: 'generate' | 'update';
};

type Phase = 'running' | 'preview' | 'error';

const GENERATE_TARGETS: GenerationTarget[] = ['cv.md', 'config/profile.yml', 'modes/_profile.md', 'portals.yml'];
const UPDATE_TARGETS: GenerationTarget[] = ['config/profile.yml', 'modes/_profile.md', 'portals.yml'];

const COPY = {
  generate: {
    running: 'Generating your profile',
    runningHint: 'The AI is reading your documents and writing four profile files. This usually takes one to three minutes.',
    review: 'Review your profile',
    complete: 'All four files were generated. Apply them to your workspace, or regenerate if something looks off.',
    skip: 'Skip for now',
  },
  update: {
    running: 'Updating your targeting',
    runningHint: 'The AI is rewriting your target roles, locations and scanner settings from the new preferences. Your CV is not touched.',
    review: 'Review the changes',
    complete: 'The targeting files were rewritten. Apply them to your workspace, or regenerate if something looks off.',
    skip: 'Cancel',
  },
} as const;

export default function ProfileGeneration({ root, preferences, onComplete, onSkip, mode = 'generate' }: Props) {
  const TARGETS = mode === 'update' ? UPDATE_TARGETS : GENERATE_TARGETS;
  const copy = COPY[mode];
  const [phase, setPhase] = useState<Phase>('running');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [written, setWritten] = useState<GenerationTarget[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [selected, setSelected] = useState<GenerationTarget>('cv.md');
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const started = useRef(false);
  const activeTask = useRef<string | null>(null);

  const generate = useCallback(async (
    feedback?: GenerationFeedback,
    previous?: { taskId: string; result: GenerationResult },
  ) => {
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
      }, feedback, mode === 'update' ? 'profile-update' : 'profile-generate');
      // Only discard the previous staged draft once the new one has actually
      // landed — a failed feedback regeneration must not destroy the reviewed
      // draft with no way back.
      if (previous) void discardGeneration(previous.taskId).catch(() => {});
      setResult(generated);
      setSelected(generated.files.find((file) => file.content !== null)?.path ?? TARGETS[0]);
      setPhase('preview');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Profile generation failed.';
      if (previous) {
        setResult(previous.result);
        setTaskId(previous.taskId);
        activeTask.current = previous.taskId;
        setPhase('preview');
        setError(message);
      } else {
        setError(message);
        setPhase('error');
      }
    }
  }, [root, preferences, mode, TARGETS]);

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

  const regenerateWithFeedback = useCallback(() => {
    if (!result || !taskId) return;
    const previousFiles = Object.fromEntries(result.files.map((f) => [f.path, f.content])) as Record<GenerationTarget, string | null>;
    setFeedbackOpen(false);
    // Defer discarding the current staging dir until the feedback run either
    // succeeds or fails — see `generate`'s `previous` handling.
    void generate({ instructions: feedbackText, previous: previousFiles }, { taskId, result });
  }, [result, taskId, feedbackText, generate]);

  const skip = useCallback(() => {
    if (taskId) void discardGeneration(taskId).catch(() => {});
    activeTask.current = null;
    onSkip();
  }, [taskId, onSkip]);

  // Top-left Back on every phase: same as Skip/Cancel — cancels the run and
  // discards the staged draft, nothing reaches the workspace.
  const back = <button type="button" className="btn-ghost screen-back" onClick={skip} disabled={applying}>&larr; {t('Back')}</button>;

  if (phase === 'running') {
    return (
      <div className="setup-screen">
        {back}
        <h1><span className="animated-dots">{t(copy.running)}</span></h1>
        <p className="setup-subtitle">{t(copy.runningHint)}</p>
        <p className="setup-hint" role="status" aria-live="polite">{t('{n} of {m} files written', { n: written.length, m: TARGETS.length })}</p>
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
          <button className="btn-ghost" onClick={skip}>{t(copy.skip)}</button>
        </div>
      </div>
    );
  }

  if (phase === 'error' || !result) {
    return (
      <div className="setup-screen">
        {back}
        <h1>{t('Generation failed')}</h1>
        <p className="setup-subtitle">{t('Nothing was written to your workspace. You can try again or skip this step.')}</p>
        {error && <pre className="intake-error" role="alert">{error}</pre>}
        <div className="setup-actions">
          <button className="btn-primary" onClick={regenerate}>{t('Try again')}</button>
          <button className="btn-ghost" onClick={skip}>{t(copy.skip)}</button>
        </div>
      </div>
    );
  }

  const current = result.files.find((file) => file.path === selected) ?? result.files[0];

  return (
    <div className="setup-screen generation-preview">
      {back}
      <h1>{t(copy.review)}</h1>
      <p className="setup-subtitle">
        {result.complete
          ? t(copy.complete)
          : t('Some files are missing or did not pass validation. You can still apply the ones that look right, or regenerate.')}
      </p>

      <div className="generation-tabs" role="tablist" aria-label={t('Generated files')}>
        {result.files.map((file) => (
          <button
            key={file.path}
            role="tab"
            aria-selected={file.path === current.path}
            className={`generation-tab ${file.path === current.path ? 'selected' : ''} ${file.valid ? '' : 'invalid'}`}
            onClick={() => setSelected(file.path)}
          >
            {file.path}
            {!file.valid && <span className="generation-tab-flag" aria-label={t('Needs attention')}>!</span>}
          </button>
        ))}
      </div>

      {current.issue && <p className="intake-error" role="alert">{current.path}: {current.issue}</p>}
      <pre className="generation-file" role="tabpanel">{current.content ?? t('(not written)')}</pre>

      {error && <p className="intake-error" role="alert">{error}</p>}

      <div className="setup-actions">
        <button className="btn-primary" onClick={apply} disabled={applying || !result.files.some((file) => file.content !== null)}>
          {applying ? <span className="animated-dots">{t('Applying')}</span> : t('Apply')}
        </button>
        <button className="btn-secondary" onClick={() => setFeedbackOpen(true)} disabled={applying}>{t('Regenerate with feedback…')}</button>
        <button className="btn-secondary" onClick={regenerate} disabled={applying}>{t('Regenerate from scratch')}</button>
        <button className="btn-ghost" onClick={skip} disabled={applying}>{t(copy.skip)}</button>
      </div>

      {feedbackOpen && (
        <div className="feedback-dialog" role="dialog" aria-label={t('What should change?')}>
          <label>
            <span>{t('Tell the AI what to change')}</span>
            <textarea rows={4} value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} placeholder={t('Shorter summary, add the 2023 project, use British spelling')} />
          </label>
          <div className="setup-actions">
            <button className="btn-primary" onClick={regenerateWithFeedback} disabled={!feedbackText.trim()}>{t('Regenerate')}</button>
            <button className="btn-ghost" onClick={() => setFeedbackOpen(false)}>{t('Cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
