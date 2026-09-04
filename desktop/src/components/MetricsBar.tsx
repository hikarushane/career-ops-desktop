import type { Metrics } from '../api';
import { t } from '../lib/i18n';

const FIELDS: { label: string; get: (m: Metrics) => string }[] = [
  { label: 'Total', get: (m) => String(m.Total) },
  { label: 'Avg', get: (m) => m.AvgScore.toFixed(1) },
  { label: 'Top', get: (m) => m.TopScore.toFixed(1) },
  { label: 'Actionable', get: (m) => String(m.Actionable) },
  { label: 'With PDF', get: (m) => String(m.WithPDF) },
];

export default function MetricsBar({ metrics }: { metrics: Metrics }) {
  return (
    <div className="metrics">
      {FIELDS.map((f) => (
        <div key={f.label}>
          <div className="metric-label">{t(f.label)}</div>
          <div className="metric-value">{f.get(metrics)}</div>
        </div>
      ))}
    </div>
  );
}
