import { useCallback, useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { stageIntakeFiles, type StagedIntakeFile } from '../api';
import { INTAKE_CATEGORIES, suggestIntakeCategory, type IntakeCategoryId } from '../lib/intakeCategories';
import { ImportIcon } from '../components/icons';

type Props = { root: string; onComplete: () => void };

type SelectedFile = {
  sourcePath: string;
  name: string;
  category: IntakeCategoryId | null;
};

function filenameFor(sourcePath: string): string {
  return sourcePath.split(/[\\/]/).filter(Boolean).pop() ?? sourcePath;
}

export default function BackgroundImport({ root, onComplete }: Props) {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [staging, setStaging] = useState(false);
  const [staged, setStaged] = useState<StagedIntakeFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback((paths: string[]) => {
    setFiles((current) => {
      const knownPaths = new Set(current.map((file) => file.sourcePath));
      const additions = paths
        .filter((path) => !knownPaths.has(path))
        .map((sourcePath) => ({
          sourcePath,
          name: filenameFor(sourcePath),
          category: suggestIntakeCategory(filenameFor(sourcePath)),
        }));
      return additions.length > 0 ? [...current, ...additions] : current;
    });
    setError(null);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWindow().onDragDropEvent(({ payload }) => {
      if (disposed) return;
      if (payload.type === 'enter' || payload.type === 'over') {
        setDragging(true);
      } else if (payload.type === 'leave') {
        setDragging(false);
      } else {
        setDragging(false);
        addFiles(payload.paths);
      }
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    }).catch(() => {
      // The dialog picker remains available if native drag/drop is unavailable.
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [addFiles]);

  const pickFiles = useCallback(async () => {
    const selected = await open({ multiple: true, title: 'Add background files' });
    if (!selected) return;

    addFiles(Array.isArray(selected) ? selected : [selected]);
  }, [addFiles]);

  const setCategory = useCallback((sourcePath: string, category: IntakeCategoryId | null) => {
    setFiles((current) => current.map((file) => (
      file.sourcePath === sourcePath ? { ...file, category } : file
    )));
  }, []);

  const removeFile = useCallback((sourcePath: string) => {
    setFiles((current) => current.filter((file) => file.sourcePath !== sourcePath));
  }, []);

  const continueImport = useCallback(async () => {
    if (files.length === 0) {
      onComplete();
      return;
    }
    if (files.some((file) => file.category === null)) return;

    setStaging(true);
    setError(null);
    try {
      const results = await stageIntakeFiles(root, files.map((file) => ({
        sourcePath: file.sourcePath,
        category: file.category!,
      })));
      setStaged(results);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not stage the selected files.');
    } finally {
      setStaging(false);
    }
  }, [files, onComplete, root]);

  const unresolved = files.some((file) => file.category === null);
  const copiedCount = staged?.filter((file) => !file.duplicate).length ?? 0;
  const duplicateCount = staged?.filter((file) => file.duplicate).length ?? 0;

  return (
    <div className="setup-screen">
      <h1>Import your background</h1>
      <p className="setup-subtitle">
        Drag in anything that describes your career.
      </p>

      <ul className="intake-category-list" aria-label="Background evidence categories">
        {INTAKE_CATEGORIES.map((category) => <li key={category.id}>{category.label}</li>)}
      </ul>

      {staged ? (
        <div className="intake-stage-result" role="status">
          <p>{copiedCount} file{copiedCount === 1 ? '' : 's'} staged for a later intake session.</p>
          {duplicateCount > 0 && <p className="setup-hint">{duplicateCount} duplicate{duplicateCount === 1 ? '' : 's'} already existed and were left unchanged.</p>}
          <p className="setup-hint">Your files were copied only; profile extraction has not run yet.</p>
        </div>
      ) : (
        <>
          <div className={`intake-dropzone${dragging ? ' is-dragging' : ''}`}>
            <p>{dragging ? 'Drop files to add them' : 'Drag files here'}</p>
            <button className="btn-secondary import-btn" onClick={pickFiles} disabled={staging}>
              <ImportIcon size={18} />
              Add files
            </button>
          </div>

          {files.length > 0 && (
            <ul className="intake-file-list" aria-label="Files to stage">
              {files.map((file) => (
                <li key={file.sourcePath} className="intake-file-row">
                  <span className="intake-file-name">{file.name}</span>
                  <label>
                    <span className="intake-file-label">Destination category</span>
                    <select
                      aria-label={`Category for ${file.name}`}
                      value={file.category ?? ''}
                      onChange={(event) => setCategory(
                        file.sourcePath,
                        event.target.value === '' ? null : event.target.value as IntakeCategoryId,
                      )}
                    >
                      <option value="">Choose category</option>
                      {INTAKE_CATEGORIES.map((category) => (
                        <option key={category.id} value={category.id}>{category.label}</option>
                      ))}
                    </select>
                  </label>
                  <button className="btn-ghost intake-remove" onClick={() => removeFile(file.sourcePath)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {unresolved && <p className="setup-hint">Choose a category for every file before continuing.</p>}
          {error && <p className="intake-error" role="alert">{error}</p>}
        </>
      )}

      <div className="setup-actions">
        <button
          className="btn-primary"
          onClick={staged ? onComplete : continueImport}
          disabled={!staged && (staging || (files.length > 0 && unresolved))}
        >
          {staged ? 'Continue setup' : staging ? 'Staging...' : files.length > 0 ? 'Continue' : 'Skip for now'}
        </button>
      </div>
    </div>
  );
}
