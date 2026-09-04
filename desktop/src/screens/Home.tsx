import { useState, useCallback } from 'react';
import type { ListResult } from '../api';
import { processPendingLabel } from '../lib/batch';
import { t } from '../lib/i18n';
import { SearchIcon } from '../components/icons';

type Props = {
  root: string;
  data: ListResult;
  onNavigate: (screen: string, params?: Record<string, string>) => void;
  /** A batch start is in flight: the button is disabled to stop a double start. */
  batchStarting?: boolean;
  /** A batch is already running: the button reopens it instead of starting another. */
  batchRunning?: boolean;
};

export default function Home({ root: _root, data, onNavigate, batchStarting, batchRunning }: Props) {
  const [url, setUrl] = useState('');
  const m = data.metrics;

  const evaluate = useCallback(() => {
    if (url.trim()) onNavigate('evaluate', { url: url.trim() });
  }, [url, onNavigate]);

  return (
    <div className="home-screen">
      <section className="home-hero">
        <h1>CareerOps</h1>
        <div className="home-stats">
          <span>{t('{n} tracked', { n: m.Total })}</span>
          <span>{t('{n} interviewing', { n: m.ByStatus?.['interview'] ?? 0 })}</span>
          <span>{t('{n} applied', { n: m.ByStatus?.['applied'] ?? 0 })}</span>
          <span>{t('Avg {score}/5', { score: m.AvgScore.toFixed(1) })}</span>
        </div>
      </section>

      <section className="home-actions">
        <div className="action-card">
          <h2>{t('Evaluate a job')}</h2>
          <p>{t('Paste a job URL or description to get a fit analysis.')}</p>
          <div className="action-input-row">
            <input
              type="text"
              placeholder={t('Job URL or paste JD text...')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && evaluate()}
            />
            <button className="btn-primary" onClick={evaluate} disabled={!url.trim()}>
              {t('Analyse')}
            </button>
          </div>
        </div>

        <div className="action-card" onClick={() => onNavigate('scanner')}>
          <h2>{t('Find matching jobs')}</h2>
          <p>{t('Scan configured sources for new opportunities.')}</p>
          <button className="btn-secondary">
            <SearchIcon size={16} /> {t('Search & evaluate')}
          </button>
        </div>

        <div className="action-card">
          <h2>{t('Process pending jobs')}</h2>
          <p>{`${t('{n} pending in your inbox', { n: data.pipelineSummary.pending })}${data.pipelineSummary.failed > 0 ? ` · ${t('{n} need attention', { n: data.pipelineSummary.failed })}` : ''}.`}</p>
          <button
            className="btn-secondary"
            disabled={(data.pipelineSummary.pending === 0 && !batchRunning) || !!batchStarting}
            onClick={() => onNavigate('batch')}
          >
            {processPendingLabel(data.pipelineSummary.pending, !!batchRunning)}
          </button>
        </div>
      </section>

      <section className="home-recent">
        <h3>{t('Recent activity')}</h3>
        <div className="recent-list">
          {data.applications.slice(0, 5).map((a) => (
            <div key={a.number} className="recent-item" onClick={() => onNavigate('pipeline', { selected: a.reportNumber })}>
              <span className="recent-company">{a.company}</span>
              <span className="recent-role">{a.role}</span>
              <span className={`status-dot status-${a.normStatus}`} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
