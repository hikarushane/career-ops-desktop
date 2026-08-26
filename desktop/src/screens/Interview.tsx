import type { Application, ListResult } from '../api';

type Props = {
  data: ListResult;
  onAction: (action: string, app: Application) => void;
};

export default function Interview({ data, onAction }: Props) {
  const active = data.applications.filter((a) => a.normStatus === 'interview');

  return (
    <div className="interview-screen">
      <h1>Interviews</h1>

      {active.length === 0 ? (
        <p className="empty-hint">No active interviews. Applications in Interview status will appear here.</p>
      ) : (
        <div className="interview-list">
          {active.map((a) => (
            <div key={a.number} className="interview-card">
              <div className="interview-card-header">
                <strong>{a.company}</strong>
                <span>{a.role}</span>
              </div>
              <div className="interview-card-actions">
                <button className="btn-secondary" onClick={() => onAction('interview-plan', a)}>
                  Prep plan
                </button>
                <button className="btn-secondary" onClick={() => onAction('interview-practice', a)}>
                  Practice
                </button>
                <button className="btn-secondary" onClick={() => onAction('interview-debrief', a)}>
                  Debrief
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
