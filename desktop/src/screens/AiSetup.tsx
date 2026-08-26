import { useCallback, useEffect, useState } from 'react';
import type { ProviderEntry } from '../api';
import { detectProviders, getReadyProviders, setPreferredId } from '../lib/providers';
import { CheckIcon } from '../components/icons';

type Props = { onComplete: () => void };

export default function AiSetup({ onComplete }: Props) {
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    detectProviders().then((ps) => {
      setProviders(ps);
      setLoading(false);
      const ready = ps.filter((p) => p.state === 'ready');
      if (ready.length > 0) setSelected(ready[0].id);
    });
  }, []);

  const confirm = useCallback(async () => {
    if (selected) {
      await setPreferredId(selected);
      onComplete();
    }
  }, [selected, onComplete]);

  const ready = getReadyProviders();

  if (loading) {
    return <div className="setup-screen"><p>Detecting AI providers...</p></div>;
  }

  return (
    <div className="setup-screen">
      <h1>Set up AI</h1>
      <p className="setup-subtitle">
        CareerOps uses AI to analyse jobs, generate CVs, and prepare interviews.
        Select an installed provider below.
      </p>

      <div className="provider-list">
        {providers.map((p) => (
          <button
            key={p.id}
            className={`provider-card ${selected === p.id ? 'selected' : ''} state-${p.state}`}
            disabled={p.state !== 'ready'}
            onClick={() => setSelected(p.id)}
          >
            <span className="provider-name">{p.displayName}</span>
            <span className="provider-state">
              {p.state === 'ready' && <><CheckIcon size={14} /> {p.version}</>}
              {p.state === 'not_installed' && 'Not installed'}
              {p.state === 'installed' && 'Not authenticated'}
              {p.state === 'error' && `Error: ${p.error}`}
            </span>
          </button>
        ))}
      </div>

      {ready.length === 0 && (
        <p className="setup-hint">
          No AI provider detected. Install <strong>Claude Code</strong> or another supported CLI, then reopen this screen.
        </p>
      )}

      <button className="btn-primary" disabled={!selected} onClick={confirm}>
        Continue
      </button>
    </div>
  );
}
