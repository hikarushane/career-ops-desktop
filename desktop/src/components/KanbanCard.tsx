import { useState } from 'react';
import type { Application } from '../api';
import { scoreBand } from '../lib/filters';
import { CheckIcon } from './icons';
import StatusSelect from './StatusSelect';

type Props = {
  app: Application;
  selected: boolean;
  onSelect: (reportNumber: string) => void;
  onStatusChange: (app: Application, next: string) => void;
  pending: boolean;
};

/**
 * Adapts DESIGN.md §5.2 ProjectCard. The template's "% complete" progress
 * bar becomes the evaluation score rendered as a fill (score/5), colored
 * by the same band the table/report use. No avatar stack — this app has
 * no team-member concept, so that slot is dropped rather than faked.
 *
 * Footer uses the same editable StatusSelect as the table (not a
 * read-only chip): status-change is this app's one write path, and the
 * Kanban board must not lose it relative to Flat/table view.
 * See desktop/STITCH-PROMPT.md §6.3.
 */
export default function KanbanCard({ app, selected, onSelect, onStatusChange, pending }: Props) {
  const [dragging, setDragging] = useState(false);
  const band = scoreBand(app.score);
  const fillPct = Math.max(0, Math.min(100, (app.score / 5) * 100));

  return (
    <article
      className={`kanban-card${dragging ? ' kanban-card--dragging' : ''}`}
      aria-selected={selected}
      draggable={!!app.reportNumber && !pending}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', app.reportNumber);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={() => app.reportNumber && onSelect(app.reportNumber)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && app.reportNumber) onSelect(app.reportNumber);
      }}
    >
      <div className="kanban-card-date">{app.date}</div>
      <div className="kanban-card-title">{app.company}</div>
      <div className="kanban-card-subtitle">{app.role}</div>

      <div className="kanban-card-score">
        <div className="kanban-score-track">
          <div className={`kanban-score-fill score-${band}`} style={{ width: `${fillPct}%` }} />
        </div>
        <span className={`kanban-score-value score-${band}`}>{app.score.toFixed(1)}</span>
      </div>

      <div className="kanban-card-footer">
        <span className="kanban-card-pdf">
          {app.hasPdf && <CheckIcon size={14} />}
        </span>
        <StatusSelect
          value={app.status}
          normStatus={app.normStatus}
          disabled={pending || !app.reportNumber}
          onChange={(next) => onStatusChange(app, next)}
        />
      </div>
    </article>
  );
}
