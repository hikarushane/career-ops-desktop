import { useCallback, useState } from 'react';
import AgentActivity from '../components/AgentActivity';
import { runTask, cancelTask } from '../lib/runner';

type Props = { root: string; onDone: () => void };

const SCAN_STEPS = [
  'Scanning sources',
  'Deduplicating',
  'Pre-screening candidates',
  'Evaluating matches',
];

export default function Scanner({ root, onDone }: Props) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [step, setStep] = useState(0);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [stdout, setStdout] = useState<string[]>([]);
  const [stderr, setStderr] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [unlistenFn, setUnlistenFn] = useState<(() => void) | null>(null);

  const start = useCallback(async () => {
    setStatus('running');
    setStep(0);
    setStdout([]);
    setStderr([]);

    const { taskId: tid, unlisten } = await runTask('scan', {}, root, {
      onOutput: (stream, data) => {
        if (stream === 'stdout') {
          setStdout((prev) => [...prev, data]);
          setStep((s) => Math.min(s + 1, SCAN_STEPS.length - 1));
        } else {
          setStderr((prev) => [...prev, data]);
        }
      },
      onFinished: (code, success) => {
        setExitCode(code);
        setStatus(success ? 'done' : 'error');
      },
    });
    setTaskId(tid);
    setUnlistenFn(() => unlisten);
  }, [root]);

  const cancel = useCallback(async () => {
    if (taskId) await cancelTask(taskId);
    unlistenFn?.();
    setStatus('idle');
  }, [taskId, unlistenFn]);

  return (
    <div className="scanner-screen">
      <h1>Find matching jobs</h1>

      {status === 'idle' && (
        <>
          <p>Scan configured job sources for new opportunities that match your profile.</p>
          <button className="btn-primary" onClick={start}>Start scanning</button>
        </>
      )}

      {status !== 'idle' && (
        <AgentActivity
          taskId={taskId}
          status={status === 'done' ? 'done' : status === 'error' ? 'error' : 'running'}
          steps={SCAN_STEPS}
          currentStep={step}
          stdout={stdout}
          stderr={stderr}
          exitCode={exitCode}
          onCancel={cancel}
          onRetry={start}
        />
      )}

      {status === 'done' && (
        <button className="btn-primary" onClick={onDone}>View results</button>
      )}
    </div>
  );
}
