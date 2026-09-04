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
import ProfileGeneration from './ProfileGeneration';
import JobPreferences from './JobPreferences';
import { EMPTY_PREFERENCES, loadPreferences, savePreferences, type JobPreferences as Preferences } from '../lib/jobPreferences';


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
  const [rawFilesError, setRawFilesError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  // Job Search tab: the remembered answers, and whether the AI is rewriting
  // the targeting files from them. Declared last so the positional useState
  // mocks in ProfileSettings.test.ts keep their existing indices.
  const [preferences, setPreferences] = useState<Preferences>(EMPTY_PREFERENCES);
  const [updatingProfile, setUpdatingProfile] = useState(false);

  useEffect(() => {
    Promise.all([
      detectProviders().then(setProviders),
      getPreferredId().then(setPreferred),
      getModel().then(setModelState),
      getEffort().then(setEffortState),
      getFastMode().then(setFastState),
      loadPreferences(root).then(setPreferences),
    ]).catch(() => {}).finally(() => setSettingsLoaded(true));
  }, [root]);

  const updateProfile = useCallback(() => {
    void savePreferences(root, preferences);
    setUpdatingProfile(true);
  }, [root, preferences]);

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
    // Model and fast-mode are stored per provider (#4): reload them for the
    // newly selected provider instead of leaving the previous provider's
    // values on screen, and drop any Custom-model override tied to the old
    // provider's model id.
    const [nextModel, nextFastMode] = await Promise.all([getModel(), getFastMode()]);
    setModelState(nextModel);
    setFastState(nextFastMode);
    setCustomModel(false);
  }, []);

  const openRawFiles = useCallback(async () => {
    setRawFilesError(null);
    try {
      await openWorkspaceFolder(root);
    } catch (reason) {
      setRawFilesError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [root]);

  const modelSettingsSupported = !!preferredId;
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
        {tab === 'background' && !regenerating && (
          <div>
            <h2>My Background</h2>
            <p>Your career profile is stored in <code>cv.md</code> and <code>config/profile.yml</code>.</p>
            <p className="setup-hint">
              Edit your profile through the AI assistant, or open the raw files for advanced editing.
            </p>
            <div className="setup-actions">
              <button className="btn-primary" onClick={() => setRegenerating(true)}>
                Regenerate profile
              </button>
              <button className="btn-secondary" onClick={openRawFiles}>
                Open raw files
              </button>
            </div>
            {rawFilesError && <p className="intake-error" role="alert">{rawFilesError}</p>}
          </div>
        )}
        {tab === 'background' && regenerating && (
          <ProfileGeneration
            root={root}
            preferences={EMPTY_PREFERENCES}
            onComplete={() => setRegenerating(false)}
            onSkip={() => setRegenerating(false)}
          />
        )}

        {tab === 'preferences' && !updatingProfile && (
          <div>
            <h2>Job Search Preferences</h2>
            <p>Target roles, locations, relocation, and salary expectations.</p>
            <p className="setup-hint">
              Updating asks the AI to rewrite <code>config/profile.yml</code>, <code>modes/_profile.md</code> and{' '}
              <code>portals.yml</code> from these answers. You review the result before anything is applied; <code>cv.md</code> is not touched.
            </p>
            <JobPreferences
              compact
              value={preferences}
              onChange={setPreferences}
              onContinue={updateProfile}
              continueLabel="Update profile with these preferences"
            />
            <AnalysisLanguageField root={root} />
          </div>
        )}
        {tab === 'preferences' && updatingProfile && (
          <ProfileGeneration
            root={root}
            mode="update"
            preferences={preferences}
            onComplete={() => setUpdatingProfile(false)}
            onSkip={() => setUpdatingProfile(false)}
          />
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
