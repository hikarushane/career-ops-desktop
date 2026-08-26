import { useCallback, useEffect, useState } from 'react';
import { doctor, isError, listApplications, type DoctorResult, type ListResult } from './api';
import { loadRoot, pickRoot } from './config';
import Header from './components/Header';
import { PipelineIcon, ProgressIcon } from './components/icons';
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

  // Empty, Error, and this loading flash all render before the shell
  // mounts — no Header, no Sidebar. DESIGN.md's "shell stays consistent
  // across every screen" rule (§4.1) assumes a signed-in app; these three
  // are career-ops's pre-shell states (no folder chosen yet, sidecar
  // unreachable, or the first fetch hasn't landed), closer to the
  // source's own undefined "logged out" case than to a real screen.
  if (error) {
    return (
      <main className="state-screen">
        <h1 className="state-title">Cannot reach the sidecar</h1>
        <pre className="state-error">{error}</pre>
      </main>
    );
  }

  if (!root || !probe || !probe.ready) {
    return <EmptyState root={root} missing={probe?.missing ?? []} onPick={onPick} />;
  }

  if (!data) return <main className="state-screen"><p className="state-loading">Loading…</p></main>;

  return (
    <div className="shell">
      <Header
        title={screen === 'pipeline' ? 'Pipeline' : 'Progress'}
        root={root}
        onReload={reload}
        onChangeFolder={onPick}
      />
      <nav className="nav">
        <button aria-current={screen === 'pipeline'} onClick={() => setScreen('pipeline')}>
          <PipelineIcon />
          <span>Pipeline</span>
        </button>
        <button aria-current={screen === 'progress'} onClick={() => setScreen('progress')}>
          <ProgressIcon />
          <span>Progress</span>
        </button>
      </nav>
      {screen === 'pipeline'
        ? <Pipeline root={root!} data={data} onReload={reload} />
        : <Progress data={data.progress} />}
    </div>
  );
}
