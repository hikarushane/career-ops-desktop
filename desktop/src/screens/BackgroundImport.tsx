import { useCallback, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ImportIcon } from '../components/icons';

type Props = { root: string; onComplete: () => void };

type ImportedFile = { name: string; path: string; type: string };

export default function BackgroundImport({ root: _root, onComplete }: Props) {
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [scanning, setScanning] = useState(false);

  const pickFolder = useCallback(async () => {
    const selected = await open({ directory: true, title: 'Select your documents folder' });
    if (!selected) return;

    setScanning(true);
    // The actual file scanning and extraction would be delegated to
    // the AgentRunner (intake mode) in a full implementation. For now
    // we record the folder selection and move on.
    setTimeout(() => {
      setScanning(false);
      setFiles([{ name: String(selected).split('/').pop() ?? 'folder', path: String(selected), type: 'folder' }]);
    }, 500);
  }, []);

  return (
    <div className="setup-screen">
      <h1>Import your background</h1>
      <p className="setup-subtitle">
        Select a folder with your CVs, cover letters, portfolio, or other career documents.
        CareerOps will extract your experience to build your profile.
      </p>

      <button className="btn-secondary import-btn" onClick={pickFolder} disabled={scanning}>
        <ImportIcon size={18} />
        {scanning ? 'Scanning...' : 'Select documents folder'}
      </button>

      {files.length > 0 && (
        <div className="import-result">
          <p>{files.length} source(s) selected</p>
          <p className="setup-hint">
            Full document extraction runs via your AI provider after setup.
          </p>
        </div>
      )}

      <div className="setup-actions">
        <button className="btn-primary" onClick={onComplete}>
          {files.length > 0 ? 'Continue' : 'Skip for now'}
        </button>
      </div>
    </div>
  );
}
