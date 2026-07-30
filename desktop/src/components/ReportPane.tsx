import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { isError, readReport, type Application, type ReportResult } from '../api';

type Props = { root: string; app: Application | null };

export default function ReportPane({ root, app }: Props) {
  const [report, setReport] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The tracker parser (dashboard/internal/data/career.go) sets ReportPath
  // straight from the Report column's markdown link, with no check that the
  // file exists on disk. So a row whose report was never generated still
  // carries a non-empty reportPath, and read_report fails with a generic
  // `io-error` (main.go:104-105) whose message is a raw local filesystem
  // path. Folding that error code into the same "no report" rendering avoids
  // leaking that path into the UI and avoids a dead-end error box for what
  // is, from the user's point of view, just a row with nothing to show yet.
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setReport(null);
    setError(null);
    setMissing(false);
    if (!app?.reportPath) return;

    let cancelled = false;
    readReport(root, app.reportPath)
      .then((r) => {
        if (cancelled) return;
        if (isError(r)) {
          if (r.error === 'io-error') setMissing(true);
          else setError(r.message);
        } else {
          setReport(r);
        }
      })
      .catch((e) => !cancelled && setError(String(e)));

    return () => {
      cancelled = true;
    };
  }, [root, app?.reportPath]);

  if (!app) {
    return <div className="report" style={{ color: 'var(--subtext)' }}>Select a row to read its report.</div>;
  }

  const noReport = !app.reportPath || missing;

  return (
    <div className="report">
      <div className="report-card">
        <dl>
          <dt>Company</dt><dd>{app.company}</dd>
          <dt>Role</dt><dd>{app.role}</dd>
          <dt>Archetype</dt><dd>{app.archetype || '—'}</dd>
          <dt>TL;DR</dt><dd>{app.tldr || '—'}</dd>
          <dt>Remote</dt><dd>{app.remote || '—'}</dd>
          <dt>Comp</dt><dd>{app.compEstimate || '—'}</dd>
        </dl>

        <div className="report-actions">
          <button disabled={!app.jobUrl} onClick={() => openUrl(app.jobUrl)}>
            {app.jobUrl ? 'Open job posting' : 'No job URL'}
          </button>

          {app.pdfPath ? (
            <button onClick={() => openPath(`${root}/${app.pdfPath}`)}>Open PDF</button>
          ) : (
            // generate-pdf.mjs takes its output path from the caller, so a
            // company with no unique match gets the folder, not a guess.
            <button onClick={() => openPath(`${root}/output`)}>
              {app.hasPdf ? 'Open output folder' : 'No PDF'}
            </button>
          )}
        </div>
      </div>

      {error && <pre style={{ color: 'var(--red)', whiteSpace: 'pre-wrap' }}>{error}</pre>}
      {!error && !report && !noReport && <div style={{ color: 'var(--subtext)' }}>Loading report…</div>}
      {noReport && <div style={{ color: 'var(--subtext)' }}>This row has no linked report.</div>}
      {report && (
        <div className="md">
          <Markdown remarkPlugins={[remarkGfm]}>{report.markdown}</Markdown>
        </div>
      )}
    </div>
  );
}
