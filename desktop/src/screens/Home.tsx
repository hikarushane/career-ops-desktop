import { useState, useCallback } from 'react';
import type { ListResult } from '../api';
import { SearchIcon } from '../components/icons';

type Props = {
  root: string;
  data: ListResult;
  onNavigate: (screen: string, params?: Record<string, string>) => void;
};

export default function Home({ root: _root, data, onNavigate }: Props) {
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
          <span>{m.Total} tracked</span>
          <span>{m.ByStatus?.['interview'] ?? 0} interviewing</span>
          <span>{m.ByStatus?.['applied'] ?? 0} applied</span>
          <span>Avg {m.AvgScore.toFixed(1)}/5</span>
        </div>
      </section>

      <section className="home-actions">
        <div className="action-card">
          <h2>Evaluate a job</h2>
          <p>Paste a job URL or description to get a fit analysis.</p>
          <div className="action-input-row">
            <input
              type="text"
              placeholder="Job URL or paste JD text..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && evaluate()}
            />
            <button className="btn-primary" onClick={evaluate} disabled={!url.trim()}>
              Analyse
            </button>
          </div>
        </div>

        <div className="action-card" onClick={() => onNavigate('scanner')}>
          <h2>Find matching jobs</h2>
          <p>Scan configured sources for new opportunities.</p>
          <button className="btn-secondary">
            <SearchIcon size={16} /> Search &amp; evaluate
          </button>
        </div>
      </section>

      <section className="home-recent">
        <h3>Recent activity</h3>
        <div className="recent-list">
          {data.applications.slice(0, 5).map((a) => (
            <div key={a.number} className="recent-item" onClick={() => onNavigate('pipeline')}>
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
