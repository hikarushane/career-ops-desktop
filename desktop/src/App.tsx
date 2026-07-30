import { useCallback, useEffect, useState } from 'react';
import { doctor, isError, listApplications, type DoctorResult, type ListResult } from './api';
import { loadRoot, pickRoot } from './config';
import EmptyState from './screens/EmptyState';
import Pipeline from './screens/Pipeline';
import Progress from './screens/Progress';

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [probe, setProbe] = useState<DoctorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ListResult | null>(null);
  const [screen, setScreen] = useState<'pipeline' | 'progress'>('pipeline');

  const refresh = useCallback(async (path: string) => {
    setError(null);
    try {
      const r = await doctor(path);
      if (isError(r)) {
        setError(r.message);
        return;
      }
      setProbe(r);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    // .catch, not just .then: a corrupt settings.json or a filesystem
    // permissions error here would otherwise become an unhandled promise
    // rejection, and the UI would silently fall back to the "no folder
    // selected" empty state instead of surfacing the real failure.
    loadRoot()
      .then((p) => {
        setRoot(p);
        if (p) refresh(p);
      })
      .catch((e) => setError(String(e)));
  }, [refresh]);

  const onPick = useCallback(async () => {
    const picked = await pickRoot();
    if (!picked) return;
    setRoot(picked);
    await refresh(picked);
  }, [refresh]);

  const reload = useCallback(async () => {
    if (!root) return;
    const r = await listApplications(root);
    if (isError(r)) { setError(r.message); return; }
    setData(r);
  }, [root]);

  useEffect(() => { if (probe?.ready) reload(); }, [probe, reload]);

  if (error) {
    return (
      <main style={{ padding: 48 }}>
        <h1>Cannot reach the sidecar</h1>
        <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--red)' }}>{error}</pre>
      </main>
    );
  }

  if (!root || !probe || !probe.ready) {
    return <EmptyState root={root} missing={probe?.missing ?? []} onPick={onPick} />;
  }

  if (!data) return <main style={{ padding: 48 }}>Loading…</main>;

  return (
    <div className="shell">
      <nav className="nav">
        <button aria-current={screen === 'pipeline'} onClick={() => setScreen('pipeline')}>Pipeline</button>
        <button aria-current={screen === 'progress'} onClick={() => setScreen('progress')}>Progress</button>
      </nav>
      {screen === 'pipeline'
        ? <Pipeline root={root!} data={data} onReload={reload} />
        : <Progress data={data.progress} />}
    </div>
  );
}
