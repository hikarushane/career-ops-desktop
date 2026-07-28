import { useCallback, useEffect, useState } from 'react';
import { doctor, isError, type DoctorResult } from './api';
import { loadRoot, pickRoot } from './config';
import EmptyState from './screens/EmptyState';

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [probe, setProbe] = useState<DoctorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    loadRoot().then((p) => {
      setRoot(p);
      if (p) refresh(p);
    });
  }, [refresh]);

  const onPick = useCallback(async () => {
    const picked = await pickRoot();
    if (!picked) return;
    setRoot(picked);
    await refresh(picked);
  }, [refresh]);

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

  return <pre style={{ padding: 16 }}>ready — pipeline lands in Task 9</pre>;
}
