import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { isError, readReport, type Application, type ReportResult } from '../api';
import type { TaskRecord } from '../lib/taskStore';

type Props = {
  root: string;
  app: Application | null;
  onStartTask: (taskType: 'pdf' | 'cover', args: Record<string, string>, label: string) => Promise<void>;
  runningTaskFor: (taskType: 'pdf' | 'cover') => TaskRecord | null;
};

const TONE_OPTIONS = ['Formal', 'Direct', 'Conversational', 'Mirror the JD'] as const;

export default function ReportPane({ root, app, onStartTask, runningTaskFor }: Props) {
  const [report, setReport] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The tracker parser (dashboard/internal/data/career.go) sets ReportPath
  // straight from the Report column's markdown link, with no check that the
  // file exists on disk. So a row whose linked report has gone missing still
  // carries a non-empty reportPath, and read_report fails with a generic
  // `io-error` (main.go:104-105). That is a tracker integrity problem, not
  // an ordinary "no report" row — see the two distinct messages below.
  const [missing, setMissing] = useState(false);
  const [coverFormOpen, setCoverFormOpen] = useState(false);
  const [why, setWhy] = useState('');
  const [problem, setProblem] = useState('');
  const [approach, setApproach] = useState('');
  const [tone, setTone] = useState<string>(TONE_OPTIONS[0]);

  useEffect(() => {
    setReport(null);
    setError(null);
    setMissing(false);
    // A different report was selected -- discard any in-progress cover
    // letter answers rather than let them get submitted under the newly
    // selected row.
    setCoverFormOpen(false);
    setWhy('');
    setProblem('');
    setApproach('');
    setTone(TONE_OPTIONS[0]);
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
  }, [root, app?.reportPath, app?.reportNumber]);

  if (!app) {
    return <div className="report" style={{ color: 'var(--color-text-secondary)' }}>Select a card or row to read its report.</div>;
  }

  async function reveal(path: string) {
    setError(null);
    try {
      await revealItemInDir(path);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const pdfTask = runningTaskFor('pdf');
  const coverTask = runningTaskFor('cover');
  const canSubmitCover = why.trim() !== '' && problem.trim() !== '' && approach.trim() !== '';

  async function generateCV() {
    setError(null);
    try {
      await onStartTask('pdf', { report: app!.reportNumber }, `CV · ${app!.company}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function submitCoverLetter() {
    setError(null);
    try {
      await onStartTask('cover', { report: app!.reportNumber, why, problem, approach, tone }, `Cover letter · ${app!.company}`);
      // Close only once the task actually started; a rejection (e.g. no AI
      // provider configured, or the opener scope refusing a later reveal)
      // must leave the form open with the answers intact so nothing typed
      // gets silently discarded.
      setCoverFormOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
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
            <button className="btn-secondary" onClick={() => reveal(`${root}/${app.pdfPath}`)}>View CV</button>
          ) : pdfTask ? (
            <button className="btn-secondary" disabled>Generating CV…</button>
          ) : (
            <button
              className="btn-secondary"
              disabled={!app.reportNumber}
              title={!app.reportNumber ? 'No report number' : undefined}
              onClick={() => generateCV()}
            >
              Generate CV
            </button>
          )}

          {app.coverLetterPath ? (
            <button className="btn-secondary" onClick={() => reveal(`${root}/${app.coverLetterPath}`)}>View cover letter</button>
          ) : coverTask ? (
            <button className="btn-secondary" disabled>Generating cover letter…</button>
          ) : (
            <button
              className="btn-secondary"
              disabled={!app.reportNumber}
              title={!app.reportNumber ? 'No report number' : undefined}
              onClick={() => setCoverFormOpen((open) => !open)}
            >
              Generate cover letter
            </button>
          )}
        </div>

        {coverFormOpen && !app.coverLetterPath && !coverTask && (
          <form
            className="cover-form"
            onSubmit={(e) => {
              e.preventDefault();
              submitCoverLetter();
            }}
          >
            <textarea
              placeholder="Why this role or company? 1–2 angles"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
            />
            <textarea
              placeholder="What problem would you solve for them?"
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
            />
            <textarea
              placeholder="Your opening move on day one, 1–2 sentences"
              value={approach}
              onChange={(e) => setApproach(e.target.value)}
            />
            <div className="ai-segment" role="radiogroup">
              {TONE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={tone === option}
                  onClick={() => setTone(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="report-actions">
              <button type="submit" className="btn-primary" disabled={!canSubmitCover}>Write cover letter</button>
              <button type="button" className="btn-ghost" onClick={() => setCoverFormOpen(false)}>Cancel</button>
            </div>
          </form>
        )}
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
