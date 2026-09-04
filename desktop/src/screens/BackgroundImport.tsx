import { useCallback, useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { listIntakeCandidates, stageIntakeFiles, type StagedIntakeFile } from '../api';
import { INTAKE_CATEGORIES, suggestIntakeCategory, type IntakeCategoryId } from '../lib/intakeCategories';
import { t } from '../lib/i18n';
import { ImportIcon } from '../components/icons';

export type BackgroundImportResult = {
  staged: StagedIntakeFile[];
};

type Props = {
  root: string;
  initialStaged: StagedIntakeFile[];
  onComplete: (result: BackgroundImportResult) => void;
};

type SelectedFile = {
  sourcePath: string;
  name: string;
  category: IntakeCategoryId | null;
};

function filenameFor(sourcePath: string): string {
  return sourcePath.split(/[\\/]/).filter(Boolean).pop() ?? sourcePath;
}

export default function BackgroundImport({ root, initialStaged, onComplete }: Props) {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [staging, setStaging] = useState(false);
  const [staged, setStaged] = useState<StagedIntakeFile[] | null>(initialStaged.length > 0 ? initialStaged : null);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback(async (paths: string[]) => {
    let expanded = paths;
    try {
      expanded = await listIntakeCandidates(paths);
    } catch {
      // Fall back to the raw paths when the command is unavailable.
    }
    setFiles((current) => {
      const knownPaths = new Set(current.map((file) => file.sourcePath));
      const additions = expanded
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
        void addFiles(payload.paths);
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
    const selected = await open({ multiple: true, title: t('Add background files') });
    if (!selected) return;
    void addFiles(Array.isArray(selected) ? selected : [selected]);
  }, [addFiles]);

  const pickFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: true, title: t('Add a folder of background files') });
    if (!selected) return;
    void addFiles(Array.isArray(selected) ? selected : [selected]);
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
      onComplete({ staged: [] });
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
      setError(
        typeof reason === 'string' ? reason
          : reason instanceof Error ? reason.message
          : t('Could not stage the selected files.'),
      );
    } finally {
      setStaging(false);
    }
  }, [files, onComplete, root]);

  const unresolved = files.some((file) => file.category === null);
  const copiedCount = staged?.filter((file) => !file.duplicate).length ?? 0;
  const duplicateCount = staged?.filter((file) => file.duplicate).length ?? 0;
  const includesPdf = staged?.some((file) => file.destinationPath.toLowerCase().endsWith('.pdf')) ?? false;

  return (
    <div className="setup-screen">
      <h1>{t('Import your background')}</h1>
      <p className="setup-subtitle">
        {t('Drag in anything that describes your career.')}
      </p>

      <ul className="intake-category-list" aria-label={t('Background evidence categories')}>
        {INTAKE_CATEGORIES.map((category) => <li key={category.id}>{t(category.label)}</li>)}
      </ul>

      {staged ? (
        <div className="intake-stage-result" role="status">
          <p>{copiedCount === 1 ? t('1 file staged for review.') : t('{n} files staged for review.', { n: copiedCount })}</p>
          {duplicateCount > 0 && <p className="setup-hint">{duplicateCount === 1 ? t('1 duplicate already existed and was left unchanged.') : t('{n} duplicates already existed and were left unchanged.', { n: duplicateCount })}</p>}
          {includesPdf && (
            <p className="setup-hint">
              {t('PDF text extraction is unavailable in this build. Your PDF is still staged; add a .md, .txt, or .tex copy for profile extraction.')}
            </p>
          )}
          <p className="setup-hint">{t('Your files were copied only; profile extraction starts after AI setup.')}</p>
          <button className="btn-ghost" onClick={() => { setStaged(null); setFiles([]); }}>{t('Start over')}</button>
        </div>
      ) : (
        <>
          <div className={`intake-dropzone${dragging ? ' is-dragging' : ''}`}>
            <p>{dragging ? t('Drop files to add them') : t('Drag files or folders here')}</p>
            <div className="setup-actions">
              <button className="btn-secondary import-btn" onClick={pickFiles} disabled={staging}>
                <ImportIcon size={18} />
                {t('Add files')}
              </button>
              <button className="btn-secondary import-btn" onClick={pickFolder} disabled={staging}>
                {t('Add folder')}
              </button>
            </div>
          </div>

          {files.length > 0 && (
            <ul className="intake-file-list" aria-label={t('Files to stage')}>
              {files.map((file) => (
                <li key={file.sourcePath} className="intake-file-row">
                  <span className="intake-file-name">{file.name}</span>
                  <label>
                    <span className="intake-file-label">{t('Destination category')}</span>
                    <select
                      aria-label={t('Category for {name}', { name: file.name })}
                      value={file.category ?? ''}
                      onChange={(event) => setCategory(
                        file.sourcePath,
                        event.target.value === '' ? null : event.target.value as IntakeCategoryId,
                      )}
                    >
                      <option value="">{t('Choose category')}</option>
                      {INTAKE_CATEGORIES.map((category) => (
                        <option key={category.id} value={category.id}>{t(category.label)}</option>
                      ))}
                    </select>
                  </label>
                  <button className="btn-ghost intake-remove" onClick={() => removeFile(file.sourcePath)}>
                    {t('Remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {unresolved && <p className="setup-hint">{t('Choose a category for every file before continuing.')}</p>}
          {error && <p className="intake-error" role="alert">{error}</p>}
        </>
      )}

      <div className="setup-actions">
        <button
          className="btn-primary"
          onClick={staged ? () => onComplete({ staged }) : continueImport}
          disabled={!staged && (staging || (files.length > 0 && unresolved))}
        >
          {staged ? t('Continue setup') : staging ? <span className="animated-dots">{t('Staging')}</span> : files.length > 0 ? t('Continue') : t('Skip for now')}
        </button>
      </div>
    </div>
  );
}
