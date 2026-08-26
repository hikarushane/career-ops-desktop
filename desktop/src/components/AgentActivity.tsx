import { useState } from 'react';

type Props = {
  taskId: string | null;
  status: 'idle' | 'running' | 'done' | 'error';
  steps: string[];
  currentStep: number;
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
  onCancel: () => void;
  onRetry: () => void;
};

export default function AgentActivity({
  status, steps, currentStep, stdout, stderr, exitCode, onCancel, onRetry,
}: Props) {
  const [showDetails, setShowDetails] = useState(false);

  if (status === 'idle') return null;

  return (
    <div className="agent-activity">
      <div className="agent-activity-steps">
        {steps.map((step, i) => (
          <div key={i} className={`agent-step ${i < currentStep ? 'done' : i === currentStep ? 'active' : ''}`}>
            <span className="agent-step-dot" />
            <span>{step}</span>
          </div>
        ))}
      </div>

      <div className="agent-activity-actions">
        {status === 'running' && (
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        )}
        {status === 'error' && (
          <button className="btn-primary" onClick={onRetry}>Retry</button>
        )}
        <button className="btn-ghost" onClick={() => setShowDetails(!showDetails)}>
          {showDetails ? 'Hide' : 'Technical'} Details
        </button>
      </div>

      {showDetails && (
        <pre className="agent-activity-log">
          {stdout.join('\n')}
          {stderr.length > 0 && `\n--- stderr ---\n${stderr.join('\n')}`}
          {exitCode !== null && `\n--- exit code: ${exitCode} ---`}
        </pre>
      )}
    </div>
  );
}
