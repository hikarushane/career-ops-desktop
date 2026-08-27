import { useCallback, useEffect, useState } from 'react';
import type { ProviderEntry } from '../api';
import { detectProviders, getPreferredId, setPreferredId } from '../lib/providers';
import { checkForUpdate, type UpdateState, initialState } from '../lib/updater';
import AnalysisLanguageField from '../components/AnalysisLanguageField';

type Props = { root: string };

type Tab = 'background' | 'preferences' | 'sources' | 'ai' | 'about';

export default function ProfileSettings({ root: _root }: Props) {
  const [tab, setTab] = useState<Tab>('background');
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [preferredId, setPreferred] = useState<string | null>(null);
  const [updateCheck, setUpdateCheck] = useState<UpdateState>(initialState());

  useEffect(() => {
    detectProviders().then(setProviders);
    getPreferredId().then(setPreferred);
  }, []);

  const selectProvider = useCallback(async (id: string) => {
    await setPreferredId(id);
    setPreferred(id);
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'background', label: 'My Background' },
    { key: 'preferences', label: 'Job Search' },
    { key: 'sources', label: 'Search Sources' },
    { key: 'ai', label: 'AI' },
    { key: 'about', label: 'About' },
  ];

  return (
    <div className="profile-screen">
      <h1>Profile &amp; Settings</h1>

      <nav className="profile-tabs">
        {tabs.map((t) => (
          <button key={t.key} aria-current={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="profile-content">
        {tab === 'background' && (
          <div>
            <h2>My Background</h2>
            <p>Your career profile is stored in <code>cv.md</code> and <code>config/profile.yml</code>.</p>
            <p className="setup-hint">
              Edit your profile through the AI assistant, or open the raw files for advanced editing.
            </p>
            <button className="btn-secondary" onClick={() => {/* open in editor */}}>
              Open raw files
            </button>
          </div>
        )}

        {tab === 'preferences' && (
          <div>
            <h2>Job Search Preferences</h2>
            <p>Target roles, locations, remote preference, and salary expectations.</p>
            <p className="setup-hint">
              These settings are stored in <code>config/profile.yml</code> and <code>modes/_profile.md</code>.
            </p>
            <AnalysisLanguageField root={_root} />
          </div>
        )}

        {tab === 'sources' && (
          <div>
            <h2>Search Sources</h2>
            <p>Companies and job boards to scan, stored in <code>portals.yml</code>.</p>
          </div>
        )}

        {tab === 'ai' && (
          <div>
            <h2>AI Provider</h2>
            <div className="provider-list">
              {providers.map((p) => (
                <button
                  key={p.id}
                  className={`provider-card ${preferredId === p.id ? 'selected' : ''} state-${p.state}`}
                  disabled={p.state !== 'ready'}
                  onClick={() => selectProvider(p.id)}
                >
                  <span className="provider-name">{p.displayName}</span>
                  <span className="provider-state">
                    {p.state === 'ready' ? p.version : p.state.replace('_', ' ')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'about' && (
          <div>
            <h2>About</h2>
            <p>CareerOps Desktop v{__APP_VERSION__}</p>
            <div className="settings-update-row">
              <div>
                <span>Check for Updates</span>
                {updateCheck.status === 'up_to_date' && (
                  <div className="settings-update-status">You're up to date.</div>
                )}
                {updateCheck.status === 'available' && (
                  <div className="settings-update-status">
                    v{updateCheck.availableVersion} available
                  </div>
                )}
                {updateCheck.status === 'error' && (
                  <div className="settings-update-status" style={{color: 'var(--color-accent-red)'}}>
                    {updateCheck.error}
                  </div>
                )}
                {updateCheck.status === 'checking' && (
                  <div className="settings-update-status">Checking…</div>
                )}
              </div>
              <button
                className="btn-secondary"
                disabled={updateCheck.status === 'checking'}
                onClick={() => checkForUpdate(setUpdateCheck, __APP_VERSION__, true)}
              >
                Check Now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
