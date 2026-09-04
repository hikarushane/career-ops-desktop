import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { readWorkspaceFile } from '../api';
import { t } from '../lib/i18n';

type Props = { root: string; relative: string };

type State = { kind: 'loading' } | { kind: 'ready'; markdown: string } | { kind: 'error'; message: string };

/**
 * Renders one Markdown/text file from the workspace (interview-prep/,
 * reports/, jds/) — the same reading surface the report pane gives a
 * report, so files the AI writes are one click away instead of Finder-only.
 */
export default function FilePreview({ root, relative }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    readWorkspaceFile(root, relative)
      .then((markdown) => active && setState({ kind: 'ready', markdown }))
      .catch((reason) => active && setState({ kind: 'error', message: reason instanceof Error ? reason.message : String(reason) }));
    return () => { active = false; };
  }, [root, relative]);

  return (
    <div className="file-preview">
      <p className="file-preview-path">{relative}</p>
      {state.kind === 'loading' && <p className="setup-hint">{t('Loading…')}</p>}
      {state.kind === 'error' && <p className="intake-error" role="alert">{state.message}</p>}
      {state.kind === 'ready' && (
        <article className="file-preview-content"><ReactMarkdown>{state.markdown}</ReactMarkdown></article>
      )}
    </div>
  );
}
