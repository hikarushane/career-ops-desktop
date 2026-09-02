import { useEffect, useState } from 'react';
import type { TaskRecord } from '../lib/taskStore';
import { summarize } from '../lib/taskSummary';
import { CheckIcon } from './icons';

type Props = { task: TaskRecord; onCancel: () => void; onRetry: () => void };

function elapsed(startedAt: number, now: number) {
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function AgentActivity({ task, onCancel, onRetry }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (task.state !== 'running') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [task.state]);

  const activity = task.events.filter((e) => e.kind === 'status' || e.kind === 'tool');
  const lastText = [...task.events].reverse().find((e) => e.kind === 'text');
  const latest = activity[activity.length - 1];
  const lastRawLine = task.rawLog.length > 0 ? task.rawLog[task.rawLog.length - 1] : '';
  // Text-only providers (opencode/copilot/qwen/grok) never emit structured
  // status/tool events, so the feed and headline fall back to raw stdout.
  const hasStructuredActivity = activity.length > 0;

  const stateWord = task.state === 'running' ? 'Running' : task.state === 'done' ? 'Done' : 'Failed';
  const summaryText = task.state === 'running'
    ? (latest ? summarize(latest) : (lastRawLine ? truncate(lastRawLine, 80) : ''))
    : task.state === 'done'
      ? (task.outcome?.detail ?? '')
      : (task.outcome?.detail ?? `exit code ${task.exitCode ?? 'unknown'}`);

  return (
    <div className={`agent-activity state-${task.state}`}>
      <p className="agent-headline" role="status" aria-live="polite">
        {task.state === 'done' && <CheckIcon size={14} />}
        {stateWord}
        {task.state === 'running' && <span aria-hidden="true">{`· ${elapsed(task.startedAt, now)}`}</span>}
        {summaryText && `· ${summaryText}`}
      </p>
      {task.state === 'failed' && lastText && (
        <blockquote className="agent-last-text">{lastText.summary}</blockquote>
      )}
      <ol className="agent-feed" aria-label="Activity">
        {hasStructuredActivity && activity.slice(-12).reverse().map((e, i) => (
          <li key={`${e.summary}-${i}`} className={`agent-feed-item kind-${e.kind}`}>{summarize(e)}</li>
        ))}
        {!hasStructuredActivity && task.rawLog.length > 0 && (
          <>
            <li className="agent-feed-heading">Provider output (raw)</li>
            {task.rawLog.slice(-12).reverse().map((line, i) => (
              <li key={`raw-${i}`} className="agent-feed-item kind-raw">{line}</li>
            ))}
          </>
        )}
        {!hasStructuredActivity && task.rawLog.length === 0 && task.state === 'running' && (
          <li className="agent-feed-item">Waiting for the AI provider to start</li>
        )}
      </ol>
      <div className="agent-activity-actions">
        {task.state === 'running' && <button className="btn-secondary" onClick={onCancel}>Cancel</button>}
        {task.state === 'failed' && <button className="btn-primary" onClick={onRetry}>Retry</button>}
        <button className="btn-ghost" onClick={() => setShowDetails(!showDetails)}>{showDetails ? 'Hide' : 'Technical'} details</button>
      </div>
      {showDetails && <pre className="agent-activity-log">{task.rawLog.join('\n')}{task.exitCode !== null && `\n--- exit code: ${task.exitCode} ---`}</pre>}
    </div>
  );
}
