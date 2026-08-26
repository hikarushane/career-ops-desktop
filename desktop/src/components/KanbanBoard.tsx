import type { Application } from '../api';
import { groupByStatus, statusLabel } from '../lib/filters';
import KanbanCard from './KanbanCard';

type Props = {
  apps: Application[];
  selected: string | null;
  onSelect: (reportNumber: string) => void;
  onStatusChange: (app: Application, next: string) => void;
  pendingRow: string | null;
};

/**
 * Pipeline's Grouped view. career-ops already buckets applications into 8
 * status groups (STATUS_GROUP_ORDER); that maps directly onto DESIGN.md
 * §5.4's project-portal columns. 8 columns don't fit one 1366px screen, so
 * the board scrolls horizontally — see desktop/STITCH-PROMPT.md §6.3.
 */
export default function KanbanBoard({ apps, selected, onSelect, onStatusChange, pendingRow }: Props) {
  const columns = groupByStatus(apps);

  return (
    <div className="kanban-board">
      {columns.map((col) => (
        <div className="kanban-column" key={col.status}>
          <div className="kanban-column-header">
            <span className={`kanban-column-dot status-dot-${col.status}`} />
            <span className="kanban-column-title">{statusLabel(col.status)}</span>
            <span className="kanban-column-count">{col.apps.length}</span>
          </div>
          <div className="kanban-column-body">
            {col.apps.map((app) => (
              <KanbanCard
                key={app.reportNumber || `${app.company}-${app.number}`}
                app={app}
                selected={selected === app.reportNumber}
                onSelect={onSelect}
                onStatusChange={onStatusChange}
                pending={pendingRow === app.reportNumber}
              />
            ))}
            {col.apps.length === 0 && <div className="kanban-column-empty">None</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
