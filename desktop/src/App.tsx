import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function App() {
  const [out, setOut] = useState('loading…');

  useEffect(() => {
    invoke('doctor', { path: '..' })
      .then((r) => setOut(JSON.stringify(r, null, 2)))
      .catch((e) => setOut(`ERROR: ${e}`));
  }, []);

  return <pre style={{ padding: 16, fontFamily: 'ui-monospace, monospace' }}>{out}</pre>;
}
