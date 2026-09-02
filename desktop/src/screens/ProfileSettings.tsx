import { useCallback, useEffect, useState } from 'react';
import type { ProviderEntry } from '../api';
import {
  detectProviders, getPreferredId, setPreferredId,
  getModel, setModel as saveModel,
  getEffort, setEffort as saveEffort,
  getFastMode, setFastMode as saveFastMode,
  type EffortLevel,
} from '../lib/providers';
import { checkForUpdate, type UpdateState, initialState } from '../lib/updater';
import { openWorkspaceFolder } from '../lib/workspace';
import AnalysisLanguageField from '../components/AnalysisLanguageField';
import WorkspaceSettings from './WorkspaceSettings';

type Props = {
  root: string;
  onWorkspaceChanged: (path: string) => Promise<void>;
};

type Tab = 'background' | 'preferences' | 'sources' | 'workspace' | 'ai' | 'about';

export default function ProfileSettings({ root, onWorkspaceChanged }: Props) {
  const [tab, setTab] = useState<Tab>('background');
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [preferredId, setPreferred] = useState<string | null>(null);
  const [model, setModelState] = useState('');
  const [effort, setEffortState] = useState<EffortLevel>('medium');
  const [fastMode, setFastState] = useState(false);
  const [updateCheck, setUpdateCheck] = useState<UpdateState>(initialState());

  useEffect(() => {
    detectProviders().then(setProviders);
    getPreferredId().then(setPreferred);
    getModel().then(setModelState);
    getEffort().then(setEffortState);
    getFastMode().then(setFastState);
  }, []);

  const selectProvider = useCallback(async (id: string) => {
    await setPreferredId(id);
    setPreferred(id);
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'background', label: 'My Background' },
    { key: 'preferences', label: 'Job Search' },
    { key: 'sources', label: 'Search Sources' },
    { key: 'workspace', label: 'Workspace' },
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
            <button className="btn-secondary" onClick={() => openWorkspaceFolder(root)}>
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
            <AnalysisLanguageField root={root} />
          </div>
        )}

        {tab === 'sources' && (
          <div>
            <h2>Search Sources</h2>
            <p>Companies and job boards to scan, stored in <code>{root.split('/').pop()}/portals.yml</code>.</p>
          </div>
        )}

        {tab === 'workspace' && (
          <WorkspaceSettings path={root} onWorkspaceChanged={onWorkspaceChanged} />
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

            <h2 style={{ marginTop: 32 }}>Model Settings</h2>

            <div className="ai-setting-row">
              <label htmlFor="ai-model">Model</label>
              <input
                id="ai-model"
                type="text"
                className="ai-input"
                placeholder="Default (provider decides)"
                value={model}
                onChange={(e) => {
                  setModelState(e.target.value);
                  saveModel(e.target.value);
                }}
              />
            </div>

            <div className="ai-setting-row">
              <label>Effort</label>
              <div className="ai-segment">
                {(['low', 'medium', 'high'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    aria-current={effort === lvl}
                    onClick={() => { setEffortState(lvl); saveEffort(lvl); }}
                  >
                    {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-setting-row">
              <label htmlFor="ai-fast">Fast mode</label>
              <button
                id="ai-fast"
                role="switch"
                aria-checked={fastMode}
                className="ai-toggle"
                onClick={() => { setFastState(!fastMode); saveFastMode(!fastMode); }}
              >
                <span className="ai-toggle-thumb" />
              </button>
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
                  <div className="settings-update-status settings-update-error">
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
