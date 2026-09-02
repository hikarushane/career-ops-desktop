import { useCallback, useEffect, useState } from 'react';
import type { ProviderEntry, ModelEntry } from '../api';
import {
  detectProviders, getPreferredId, setPreferredId,
  getModel, setModel as saveModel,
  getEffort, setEffort as saveEffort,
  getFastMode, setFastMode as saveFastMode,
  type EffortLevel,
} from '../lib/providers';
import { getModelCatalog, fastModeAllowed } from '../lib/models';
import { checkForUpdate, type UpdateState, initialState } from '../lib/updater';
import { openWorkspaceFolder } from '../lib/workspace';
import AnalysisLanguageField from '../components/AnalysisLanguageField';
import WorkspaceSettings from './WorkspaceSettings';

/** Providers whose runner does not consume --model/--effort/--settings fastMode at all. */
const NO_MODEL_SETTINGS_PROVIDERS = new Set(['opencode', 'copilot', 'qwen', 'grok']);

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
  const [catalog, setCatalog] = useState<ModelEntry[]>([]);
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('ready');
  const [customModel, setCustomModel] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      detectProviders().then(setProviders),
      getPreferredId().then(setPreferred),
      getModel().then(setModelState),
      getEffort().then(setEffortState),
      getFastMode().then(setFastState),
    ]).catch(() => {}).finally(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    if (tab !== 'ai' || !preferredId) return;
    let active = true;
    setCatalogState('loading');
    getModelCatalog(preferredId, { force: false })
      .then(({ models: result, degraded }) => {
        if (!active) return;
        setCatalog(result);
        if (model !== '' && !result.some((m) => m.id === model)) setCustomModel(true);
        setCatalogState(degraded ? 'error' : 'ready');
      })
      .catch(() => {
        if (!active) return;
        setCatalogState('error');
      });
    return () => { active = false; };
  }, [tab, preferredId]);

  const refreshCatalog = useCallback(async () => {
    if (!preferredId) return;
    setCatalogState('loading');
    try {
      const { models: result, degraded } = await getModelCatalog(preferredId, { force: true });
      setCatalog(result);
      if (model !== '' && !result.some((m) => m.id === model)) setCustomModel(true);
      setCatalogState(degraded ? 'error' : 'ready');
    } catch {
      setCatalogState('error');
    }
  }, [preferredId, model]);

  const selectProvider = useCallback(async (id: string) => {
    await setPreferredId(id);
    setPreferred(id);
  }, []);

  const modelSettingsSupported = !!preferredId && !NO_MODEL_SETTINGS_PROVIDERS.has(preferredId);
  const effortDisabled = !modelSettingsSupported || preferredId === 'agy';
  const fastOk = fastModeAllowed(preferredId ?? '', model, catalog);

  useEffect(() => {
    if (settingsLoaded && tab === 'ai' && catalogState === 'ready' && !fastOk && fastMode) {
      setFastState(false);
      saveFastMode(false).catch(() => {});
    }
  }, [settingsLoaded, tab, catalogState, fastOk, fastMode]);

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

            {!modelSettingsSupported && (
              <p className="setup-hint">Model settings are not supported for this provider.</p>
            )}

            <div className="ai-setting-row">
              <label htmlFor="ai-model">Model</label>
              <select
                id="ai-model"
                disabled={!modelSettingsSupported || catalogState === 'loading'}
                value={customModel ? '__custom' : model}
                onChange={(e) => {
                  if (e.target.value === '__custom') { setCustomModel(true); return; }
                  setCustomModel(false);
                  setModelState(e.target.value);
                  saveModel(e.target.value);
                }}
              >
                <option value="">Provider default</option>
                {catalog.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}{m.available === null ? ' (unverified)' : ''}
                  </option>
                ))}
                <option value="__custom">Custom…</option>
              </select>
            </div>

            {customModel && (
              <div className="ai-setting-row">
                <label htmlFor="ai-model-custom">Custom model id</label>
                <input
                  id="ai-model-custom"
                  type="text"
                  className="ai-input"
                  placeholder="Model id"
                  disabled={!modelSettingsSupported}
                  value={model}
                  onChange={(e) => {
                    setModelState(e.target.value);
                    saveModel(e.target.value);
                  }}
                />
              </div>
            )}

            {catalogState === 'loading' && (
              <p className="setup-hint">Checking which models your account can use…</p>
            )}
            {catalogState === 'error' && (
              <p className="setup-hint">Could not verify models; showing defaults.</p>
            )}

            <div className="ai-setting-row">
              <label>Refresh</label>
              <button className="btn-ghost" disabled={!modelSettingsSupported} onClick={refreshCatalog}>
                Refresh
              </button>
            </div>

            <div className="ai-setting-row">
              <label>Effort</label>
              <div className="ai-segment" role="radiogroup">
                {(['low', 'medium', 'high'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    role="radio"
                    aria-checked={effort === lvl}
                    disabled={effortDisabled}
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
                disabled={!fastOk}
                onClick={() => { setFastState(!fastMode); saveFastMode(!fastMode); }}
              >
                <span className="ai-toggle-thumb" />
              </button>
            </div>
            {!fastOk && (
              <p className="setup-hint">Fast mode is available for Claude Opus models only.</p>
            )}
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
