import { useCallback, useEffect, useState } from 'react';
import { getDefaultWorkspacePath } from '../api';
import { chooseWorkspace, createDefaultWorkspace } from '../config';

type Props = {
  onReady: (path: string) => Promise<void>;
};

export default function WorkspaceSetup({ onReady }: Props) {
  const [defaultPath, setDefaultPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    getDefaultWorkspacePath().then(setDefaultPath).catch((reason: unknown) => setError(String(reason)));
  }, []);

  const complete = useCallback(async (setup: () => Promise<string | null>) => {
    setError(null);
    setWorking(true);
    try {
      const path = await setup();
      if (path) await onReady(path);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  }, [onReady]);

  return (
    <main className="setup-screen workspace-setup-screen">
      <h1>Set up your workspace</h1>
      <p className="setup-subtitle">
        CareerOps keeps your job search materials and progress together in one private workspace.
      </p>
      <p className="workspace-path-preview" aria-live="polite">
        {defaultPath ?? 'Finding a location…'}
      </p>
      {error && <p className="workspace-setup-error" role="alert">{error}</p>}
      <div className="setup-actions">
        <button className="btn-primary" disabled={working} onClick={() => complete(createDefaultWorkspace)}>
          Create workspace
        </button>
        <button className="btn-ghost" disabled={working} onClick={() => complete(chooseWorkspace)}>
          Choose another location
        </button>
      </div>
    </main>
  );
}
