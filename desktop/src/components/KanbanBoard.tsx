import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Application } from '../api';
import { groupByStatus, statusLabel } from '../lib/filters';
import { t } from '../lib/i18n';
import { beginDrag, dropStatusAt, moveDrag, resolveDrop, startsDragFrom, type DragSession } from '../lib/kanbanDnd';
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

  // Drag a card onto a status column (or its collapsed chip) to change its
  // status through the same write path as the StatusSelect. The session is
  // pointer-driven (see lib/kanbanDnd.ts): a press on a card opens it, window
  // listeners move it, and the release resolves the drop. State renders it;
  // the ref lets the window listeners read the live session without
  // re-subscribing on every pointer move.
  const [drag, setDrag] = useState<DragSession | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const updateDrag = useCallback((next: DragSession | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const onDragPointerDown = useCallback((reportNumber: string, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !e.isPrimary || !startsDragFrom(e.target)) return;
    updateDrag(beginDrag(reportNumber, e.clientX, e.clientY));
  }, [updateDrag]);

  const dragOpen = drag !== null;
  useEffect(() => {
    if (!dragOpen) return;
    const onMove = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      // The dragged card and the ghost are pointer-events:none, so this
      // resolves to the column underneath them.
      const status = dropStatusAt(document.elementFromPoint(e.clientX, e.clientY));
      updateDrag(moveDrag(current, e.clientX, e.clientY, status));
    };
    const onUp = () => {
      const current = dragRef.current;
      updateDrag(null);
      if (!current?.active || !current.target) return;
      const r = resolveDrop(apps, current.reportNumber, current.target);
      if (r) onStatusChange(r.app, r.next);
    };
    const onCancel = () => updateDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [dragOpen, apps, onStatusChange, updateDrag]);

  const dropTarget = drag?.active ? drag.target : null;
  const dropClass = (status: string) => (dropTarget === status ? ' kanban-column--drop-target' : '');
  const draggedApp = drag?.active ? apps.find((a) => a.reportNumber === drag.reportNumber) ?? null : null;

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
    c.push({ status: 'top', label: t('Top ≥4'), apps: topApps });

    for (const col of columns) {
      const g: VirtualGroup = { status: col.status, label: t(statusLabel(col.status)), apps: col.apps };
      if (col.apps.length > 0) p.push(g);
      else c.push(g);
    }
    return { populated: p, collapsible: c };
  }, [columns, apps]);

  const expandedGroups = collapsible.filter((g) => expanded.has(g.status));
  const collapsedGroups = collapsible.filter((g) => !expanded.has(g.status));

  const card = (app: Application) => (
    <KanbanCard
      key={app.reportNumber || `${app.company}-${app.number}`}
      app={app}
      selected={selected === app.reportNumber}
      onSelect={onSelect}
      onStatusChange={onStatusChange}
      pending={pendingRow === app.reportNumber}
      dragging={draggedApp?.reportNumber === app.reportNumber}
      onDragPointerDown={onDragPointerDown}
    />
  );

  return (
    <div className={`kanban-board${draggedApp ? ' kanban-board--dragging' : ''}`}>
      {populated.map((col) => (
        <div className={`kanban-column${dropClass(col.status)}`} key={col.status} data-drop-status={col.status}>
          <div className="kanban-column-header">
            <span className={`kanban-column-dot status-dot-${col.status}`} />
            <span className="kanban-column-title">{col.label}</span>
            <span className="kanban-column-count">{col.apps.length}</span>
          </div>
          <div className="kanban-column-body">
            {col.apps.map(card)}
          </div>
        </div>
      ))}

      {expandedGroups.map((col) => (
        <div className={`kanban-column${dropClass(col.status)}`} key={col.status} data-drop-status={col.status}>
          <div className="kanban-column-header kanban-column-header--collapsible" onClick={() => toggle(col.status)}>
            <span className={`kanban-column-dot status-dot-${col.status}`} />
            <span className="kanban-column-title">{col.label}</span>
            <span className="kanban-column-count">{col.apps.length}</span>
          </div>
          <div className="kanban-column-body">
            {col.apps.length > 0 ? col.apps.map(card) : (
              <div className="kanban-column-nodata">{t('no data')}</div>
            )}
          </div>
        </div>
      ))}

      {collapsedGroups.length > 0 && (
        <div className="kanban-empty-group">
          {collapsedGroups.map((col) => (
            <div
              className={`kanban-column-collapsed${dropClass(col.status)}`}
              key={col.status}
              onClick={() => toggle(col.status)}
              data-drop-status={col.status}
            >
              <span className={`kanban-column-dot status-dot-${col.status}`} />
              <span className="kanban-column-title">{col.label}</span>
              <span className="kanban-column-count">{col.apps.length}</span>
            </div>
          ))}
        </div>
      )}

      {draggedApp && drag && (
        <div className="kanban-card kanban-card--ghost" style={{ left: drag.x + 12, top: drag.y + 12 }} aria-hidden="true">
          <div className="kanban-card-title">{draggedApp.company}</div>
          <div className="kanban-card-subtitle">{draggedApp.role}</div>
        </div>
      )}
    </div>
  );
}
