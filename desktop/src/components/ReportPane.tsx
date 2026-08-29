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
  // file exists on disk. So a row whose linked report has gone missing still
  // carries a non-empty reportPath, and read_report fails with a generic
  // `io-error` (main.go:104-105). That is a tracker integrity problem, not
  // an ordinary "no report" row — see the two distinct messages below.
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
    return <div className="report" style={{ color: 'var(--color-text-secondary)' }}>Select a card or row to read its report.</div>;
  }

  return (
    <div className="report">
      <div className="report-card">
        {/* Company/Role pulled out of the field list as a header block —
            DESIGN.md §5.3's client-card name/role treatment, not just
            another dt/dd row. STITCH-PROMPT.md §6.5. */}
        <div className="report-header">
          <div className="report-company">{app.company}</div>
          <div className="report-role">{app.role}</div>
        </div>
        <dl>
          <dt>Archetype</dt><dd>{app.archetype || '—'}</dd>
          <dt>TL;DR</dt><dd>{app.tldr || '—'}</dd>
          <dt>Remote</dt><dd>{app.remote || '—'}</dd>
          <dt>Comp</dt><dd>{app.compEstimate || '—'}</dd>
        </dl>

        <div className="report-actions">
          <button className="btn-primary" disabled={!app.jobUrl} onClick={() => openUrl(app.jobUrl)}>
            {app.jobUrl ? 'Open job posting' : 'No job URL'}
          </button>

          {app.pdfPath ? (
            <button className="btn-secondary" onClick={() => openPath(`${root}/${app.pdfPath}`)}>Open PDF</button>
          ) : (
            // generate-pdf.mjs takes its output path from the caller, so a
            // company with no unique match gets the folder, not a guess.
            <button className="btn-secondary" onClick={() => openPath(`${root}/output`)}>
              {app.hasPdf ? 'Open output folder' : 'No PDF'}
            </button>
          )}
        </div>
      </div>

      {error && <pre className="code-block" style={{ color: 'var(--color-accent-red)' }}>{error}</pre>}
      {!error && !report && app.reportPath && !missing && (
        <div style={{ color: 'var(--color-text-secondary)' }}>Loading report…</div>
      )}

      {/*
        Two distinct conditions, deliberately not merged. A row with no link
        is normal. A row whose linked file is gone is a tracker integrity
        problem the user should hear about by name — saying "no linked
        report" there would hide a missing file behind an ordinary-looking
        message. verify-pipeline.mjs is the tool that finds the rest.
      */}
      {!app.reportPath && (
        <div style={{ color: 'var(--color-text-secondary)' }}>This row has no linked report.</div>
      )}
      {app.reportPath && missing && (
        <div style={{ color: 'var(--color-accent-amber)' }}>
          The tracker links <code style={{ fontFamily: 'var(--font-mono)' }}>{app.reportPath}</code>, but that file is missing.
          Check the report path in your active workspace and retry after restoring any missing report file.
        </div>
      )}
      {report && (
        <div className="md">
          <Markdown remarkPlugins={[remarkGfm]}>{report.markdown}</Markdown>
        </div>
      )}
    </div>
  );
}
