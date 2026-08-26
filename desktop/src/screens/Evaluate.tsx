import { useCallback, useState } from 'react';
import AgentActivity from '../components/AgentActivity';
import { runTask, cancelTask } from '../lib/runner';

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

  const start = useCallback(async () => {
    if (!url.trim()) return;
    setStatus('running');
    setStep(0);
    setStdout([]);
    setStderr([]);

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
    );
    setTaskId(tid);
    setUnlistenFn(() => unlisten);
  }, [url, root]);

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
