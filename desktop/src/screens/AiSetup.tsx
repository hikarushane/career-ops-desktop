import { useCallback, useEffect, useRef, useState } from 'react';
import { openProviderInstaller, type ProviderEntry } from '../api';
import { detectProviders, getReadyProviders, setPreferredId } from '../lib/providers';
import { CheckIcon } from '../components/icons';
import { t } from '../lib/i18n';
import { openUrl } from '@tauri-apps/plugin-opener';

type Props = { onComplete: () => void };

/**
 * `launching` covers only the moment between the click and the terminal
 * appearing. The install itself happens in that terminal, where the user can
 * read it — the app never claims to know whether it succeeded, it just keeps
 * re-detecting until the provider reports ready.
 */
type InstallState = { id: string; phase: 'launching' | 'launched' | 'error'; command?: string; message?: string };

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1_000;

export default function AiSetup({ onComplete }: Props) {
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [install, setInstall] = useState<InstallState | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (poll.current !== null) {
      clearInterval(poll.current);
      poll.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    stopPolling();
    setLoading(true);
    const ps = await detectProviders();
    setProviders(ps);
    setLoading(false);
    const ready = ps.filter((p) => p.state === 'ready');
    if (ready.length > 0 && !selected) setSelected(ready[0].id);
  }, [selected, stopPolling]);

  useEffect(() => { refresh(); }, []);
  useEffect(() => stopPolling, [stopPolling]);

  /**
   * The installer runs outside the app, so the card can only turn Ready by
   * re-detecting. Polling stops as soon as it does, and gives up after
   * POLL_TIMEOUT_MS rather than re-detecting forever behind an abandoned
   * terminal window.
   */
  const startPolling = useCallback((id: string) => {
    stopPolling();
    const startedAt = Date.now();
    poll.current = setInterval(async () => {
      const ps = await detectProviders();
      setProviders(ps);
      const entry = ps.find((p) => p.id === id);
      if (entry?.state === 'ready' || Date.now() - startedAt >= POLL_TIMEOUT_MS) stopPolling();
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  const confirm = useCallback(async () => {
    if (selected) {
      await setPreferredId(selected);
      onComplete();
    }
  }, [selected, onComplete]);

  const handleInstall = useCallback(async (provider: ProviderEntry) => {
    setInstall({ id: provider.id, phase: 'launching' });
    try {
      const command = await openProviderInstaller(provider.id);
      setInstall({ id: provider.id, phase: 'launched', command });
      startPolling(provider.id);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setInstall({ id: provider.id, phase: 'error', message: message || t('Install failed.') });
    }
  }, [startPolling]);

  const ready = getReadyProviders();

  if (loading) {
    return <div className="setup-screen"><p className="animated-dots">{t('Detecting AI providers')}</p></div>;
  }

  return (
    <div className="setup-screen">
      <h1>{t('Set up AI')}</h1>
      <p className="setup-subtitle">
        {t('CareerOps uses AI to analyse jobs, generate CVs, and prepare interviews.')}
        {' '}
        {ready.length > 0
          ? t('Select a provider below.')
          : t('Install a provider to get started.')}
      </p>

      <div className="provider-list">
        {providers.map((p) => (
          <div key={p.id} className={`provider-card ${selected === p.id ? 'selected' : ''} state-${p.state}`}>
            <div className="provider-info" onClick={() => p.state === 'ready' && setSelected(p.id)}>
              <span className="provider-name">{p.displayName}</span>
              <span className="provider-state">
                {p.state === 'ready' && <><CheckIcon size={14} /> {p.version}</>}
                {p.state === 'installed' && t('Installed — needs auth')}
                {p.state === 'error' && t('Error: {message}', { message: p.error ?? '' })}
                {p.state === 'not_installed' && (
                  install?.id === p.id && install.phase === 'launching'
                    ? <span className="animated-dots">{t('Opening terminal')}</span>
                    : null
                )}
              </span>
            </div>
            <div className="provider-actions">
              {p.state === 'not_installed' && (
                install?.id === p.id && install.phase === 'launching' ? (
                  <span className="provider-spinner" />
                ) : (
                  <button className="btn-install" onClick={() => handleInstall(p)}>
                    {t('Install')}
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
            <> — <button className="btn-link" onClick={() => openUrl(providers.find((p) => p.id === install.id)!.website!)}>{t('visit website')}</button></>
          )}
        </p>
      )}

      {install?.phase === 'launched' && (
        <p className="setup-hint" role="status">
          {t('Installer opened in a terminal window. Finish the install and sign-in there, then come back.')}
          {' '}
          <code className="install-command">{install.command}</code>
        </p>
      )}

      {ready.length === 0 && !install && (
        <p className="setup-hint">
          {t('If you already have Claude Code or Codex installed, click Refresh below.')}
        </p>
      )}

      <div className="setup-actions">
        <button className="btn-secondary" onClick={refresh} disabled={loading}>
          {t('Refresh')}
        </button>
        <button className="btn-primary" disabled={!selected} onClick={confirm}>
          {t('Continue')}
        </button>
      </div>
    </div>
  );
}
