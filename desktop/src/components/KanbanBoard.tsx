import { useCallback, useMemo, useState } from 'react';
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

type VirtualGroup = { status: string; label: string; apps: Application[] };

export default function KanbanBoard({ apps, selected, onSelect, onStatusChange, pendingRow }: Props) {
  const columns = groupByStatus(apps);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = useCallback((status: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const { populated, collapsible } = useMemo(() => {
    const p: VirtualGroup[] = [];
    const c: VirtualGroup[] = [];

    const topApps = apps.filter((a) => a.score >= 4.0 && a.normStatus !== 'skip');
    c.push({ status: 'top', label: 'Top ≥4', apps: topApps });

    for (const col of columns) {
      const g: VirtualGroup = { status: col.status, label: statusLabel(col.status), apps: col.apps };
      if (col.apps.length > 0) p.push(g);
      else c.push(g);
    }
    return { populated: p, collapsible: c };
  }, [columns, apps]);

  const expandedGroups = collapsible.filter((g) => expanded.has(g.status));
  const collapsedGroups = collapsible.filter((g) => !expanded.has(g.status));

  return (
    <div className="kanban-board">
      {populated.map((col) => (
        <div className="kanban-column" key={col.status}>
          <div className="kanban-column-header">
            <span className={`kanban-column-dot status-dot-${col.status}`} />
            <span className="kanban-column-title">{col.label}</span>
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
          </div>
        </div>
      ))}

      {expandedGroups.map((col) => (
        <div className="kanban-column" key={col.status}>
          <div className="kanban-column-header kanban-column-header--collapsible" onClick={() => toggle(col.status)}>
            <span className={`kanban-column-dot status-dot-${col.status}`} />
            <span className="kanban-column-title">{col.label}</span>
            <span className="kanban-column-count">{col.apps.length}</span>
          </div>
          <div className="kanban-column-body">
            {col.apps.length > 0 ? col.apps.map((app) => (
              <KanbanCard
                key={app.reportNumber || `${app.company}-${app.number}`}
                app={app}
                selected={selected === app.reportNumber}
                onSelect={onSelect}
                onStatusChange={onStatusChange}
                pending={pendingRow === app.reportNumber}
              />
            )) : (
              <div className="kanban-column-nodata">no data</div>
            )}
          </div>
        </div>
      ))}

      {collapsedGroups.length > 0 && (
        <div className="kanban-empty-group">
          {collapsedGroups.map((col) => (
            <div
              className="kanban-column-collapsed"
              key={col.status}
              onClick={() => toggle(col.status)}
            >
              <span className={`kanban-column-dot status-dot-${col.status}`} />
              <span className="kanban-column-title">{col.label}</span>
              <span className="kanban-column-count">{col.apps.length}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
