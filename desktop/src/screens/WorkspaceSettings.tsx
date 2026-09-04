import { useState } from 'react';
import { pickWorkspace } from '../config';
import { t } from '../lib/i18n';
import { openWorkspaceFolder } from '../lib/workspace';

export type WorkspaceSettingsProps = {
  path: string;
  onWorkspaceChanged: (path: string) => Promise<void>;
};

export default function WorkspaceSettings({ path, onWorkspaceChanged }: WorkspaceSettingsProps) {
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  async function openFolder() {
    setError(null);
    try {
      await openWorkspaceFolder(path);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function changeLocation() {
    setError(null);
    setChanging(true);
    try {
      const nextPath = await pickWorkspace();
      if (nextPath) await onWorkspaceChanged(nextPath);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setChanging(false);
    }
  }

  return (
    <section className="workspace-settings">
      <h2>{t('Workspace')}</h2>
      <code className="workspace-path-preview">{path}</code>
      {error && <p className="workspace-settings-error" role="alert">{error}</p>}
      <div className="workspace-settings-actions">
        <button className="btn-secondary" onClick={openFolder}>{t('Open Folder')}</button>
        <button className="btn-primary" disabled={changing} onClick={changeLocation}>{t('Change Location')}</button>
      </div>
      <p className="setup-hint">
        {t('Changing location switches the active workspace.')}<br />
        {t('It does not move your current files.')}
      </p>
    </section>
  );
}
