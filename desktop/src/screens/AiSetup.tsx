import { useCallback, useEffect, useState } from 'react';
import type { ProviderEntry } from '../api';
import { detectProviders, getReadyProviders, setPreferredId, installProviderById } from '../lib/providers';
import { CheckIcon } from '../components/icons';
import { openUrl } from '@tauri-apps/plugin-opener';

type Props = { onComplete: () => void };

type InstallState = { id: string; phase: 'installing' | 'done' | 'error'; message?: string };

export default function AiSetup({ onComplete }: Props) {
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [install, setInstall] = useState<InstallState | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const ps = await detectProviders();
    setProviders(ps);
    setLoading(false);
    const ready = ps.filter((p) => p.state === 'ready');
    if (ready.length > 0 && !selected) setSelected(ready[0].id);
  }, [selected]);

  useEffect(() => { refresh(); }, []);

  const confirm = useCallback(async () => {
    if (selected) {
      await setPreferredId(selected);
      onComplete();
    }
  }, [selected, onComplete]);

  const handleInstall = useCallback(async (provider: ProviderEntry) => {
    if (!provider.installCmd) {
      if (provider.website) openUrl(provider.website);
      return;
    }
    setInstall({ id: provider.id, phase: 'installing' });
    const result = await installProviderById(provider.id);
    if (result.ok) {
      setInstall({ id: provider.id, phase: 'done', message: 'Installed successfully.' });
      await refresh();
    } else {
      setInstall({ id: provider.id, phase: 'error', message: result.error ?? 'Install failed.' });
    }
  }, [refresh]);

  const ready = getReadyProviders();

  if (loading) {
    return <div className="setup-screen"><p className="animated-dots">Detecting AI providers</p></div>;
  }

  return (
    <div className="setup-screen">
      <h1>Set up AI</h1>
      <p className="setup-subtitle">
        CareerOps uses AI to analyse jobs, generate CVs, and prepare interviews.
        {ready.length > 0
          ? ' Select a provider below.'
          : ' Install a provider to get started.'}
      </p>

      <div className="provider-list">
        {providers.map((p) => (
          <div key={p.id} className={`provider-card ${selected === p.id ? 'selected' : ''} state-${p.state}`}>
            <div className="provider-info" onClick={() => p.state === 'ready' && setSelected(p.id)}>
              <span className="provider-name">{p.displayName}</span>
              <span className="provider-state">
                {p.state === 'ready' && <><CheckIcon size={14} /> {p.version}</>}
                {p.state === 'installed' && 'Installed — needs auth'}
                {p.state === 'error' && `Error: ${p.error}`}
                {p.state === 'not_installed' && (
                  install?.id === p.id && install.phase === 'installing'
                    ? <span className="animated-dots">Installing</span>
                    : null
                )}
              </span>
            </div>
            <div className="provider-actions">
              {p.state === 'not_installed' && (
                install?.id === p.id && install.phase === 'installing' ? (
                  <span className="provider-spinner" />
                ) : (
                  <button
                    className="btn-install"
                    onClick={() => handleInstall(p)}
                    title={p.installCmd ?? 'Open website'}
                  >
                    {p.installCmd ? 'Install' : 'Get it'}
                  </button>
                )
              )}
              {p.state === 'installed' && p.authHint && (
                <span className="provider-auth-hint">{p.authHint}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {install?.phase === 'error' && (
        <p className="intake-error" role="alert">
          {install.message}
          {providers.find((p) => p.id === install.id)?.website && (
            <> — <button className="btn-link" onClick={() => openUrl(providers.find((p) => p.id === install.id)!.website!)}>visit website</button></>
          )}
        </p>
      )}

      {install?.phase === 'done' && (
        <p className="setup-hint" role="status">
          {install.message}
          {' '}
          {providers.find((p) => p.id === install.id)?.authHint && (
            <strong>{providers.find((p) => p.id === install.id)!.authHint}</strong>
          )}
        </p>
      )}

      {ready.length === 0 && !install && (
        <p className="setup-hint">
          Most providers install with a single command.
          If you already have <strong>Claude Code</strong> or <strong>Codex</strong> installed,
          click <strong>Refresh</strong> below.
        </p>
      )}

      <div className="setup-actions">
        <button className="btn-secondary" onClick={refresh} disabled={loading}>
          Refresh
        </button>
        <button className="btn-primary" disabled={!selected} onClick={confirm}>
          Continue
        </button>
      </div>
    </div>
  );
}
