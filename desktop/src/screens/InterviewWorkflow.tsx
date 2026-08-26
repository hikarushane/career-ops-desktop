import { useCallback, useState } from 'react';
import AgentActivity from '../components/AgentActivity';
import { runTask, cancelTask } from '../lib/runner';
import type { TaskType } from '../api';

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

const STEPS: Record<string, string[]> = {
  'interview-plan': ['Loading role context', 'Building prep plan', 'Creating schedule'],
  'interview-practice': ['Preparing questions', 'Ready for practice'],
  'interview-debrief': ['Reviewing interview notes', 'Analysing gaps', 'Updating knowledge base'],
};

export default function InterviewWorkflow({ root, mode, company, role, onBack }: Props) {
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

    const steps = STEPS[mode] ?? [];
    const { taskId: tid, unlisten } = await runTask(
      mode as TaskType,
      { company, role },
      root,
      {
        onOutput: (stream, data) => {
          if (stream === 'stdout') {
            setStdout((prev) => [...prev, data]);
            setStep((s) => Math.min(s + 1, steps.length - 1));
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
  }, [root, mode, company, role]);

  const cancel = useCallback(async () => {
    if (taskId) await cancelTask(taskId);
    unlistenFn?.();
    setStatus('idle');
  }, [taskId, unlistenFn]);

  const steps = STEPS[mode] ?? [];

  return (
    <div className="interview-workflow-screen">
      <button className="btn-ghost" onClick={onBack}>&larr; Back</button>
      <h1>{TITLES[mode] ?? mode}</h1>
      <p>{company} &mdash; {role}</p>

      {status === 'idle' && (
        <button className="btn-primary" onClick={start}>Start</button>
      )}

      {status !== 'idle' && (
        <AgentActivity
          taskId={taskId}
          status={status === 'done' ? 'done' : status === 'error' ? 'error' : 'running'}
          steps={steps}
          currentStep={step}
          stdout={stdout}
          stderr={stderr}
          exitCode={exitCode}
          onCancel={cancel}
          onRetry={start}
        />
      )}

      {status === 'done' && (
        <button className="btn-primary" onClick={onBack}>Done</button>
      )}
    </div>
  );
}
