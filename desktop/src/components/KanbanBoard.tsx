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
 * Pipeline's Grouped view. career-ops buckets applications by canonical
 * status, while empty groups are omitted so filtered cards stay visible.
 * When populated columns exceed the viewport, the board scrolls horizontally.
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
