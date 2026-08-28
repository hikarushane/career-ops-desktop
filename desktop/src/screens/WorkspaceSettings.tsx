import { useState } from 'react';
import { chooseWorkspace } from '../config';
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
      const nextPath = await chooseWorkspace();
      if (nextPath) await onWorkspaceChanged(nextPath);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setChanging(false);
    }
  }

  return (
    <section className="workspace-settings">
      <h2>Workspace</h2>
      <code className="workspace-path-preview">{path}</code>
      {error && <p className="workspace-settings-error" role="alert">{error}</p>}
      <div className="workspace-settings-actions">
        <button className="btn-secondary" onClick={openFolder}>Open Folder</button>
        <button className="btn-primary" disabled={changing} onClick={changeLocation}>Change Location</button>
      </div>
      <p className="setup-hint">
        Changing location switches the active workspace.<br />
        It does not move your current files.
      </p>
    </section>
  );
}
