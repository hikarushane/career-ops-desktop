import { useMemo, useState } from 'react';
import type { ListResult } from '../api';
import {
  applyFilterAndSort, countForFilter, TABS,
  type FilterKey, type SortKey, type ViewMode,
} from '../lib/filters';
import AppTable from '../components/AppTable';
import MetricsBar from '../components/MetricsBar';
import Toolbar from '../components/Toolbar';

// onReload is async because Task 11 awaits it after a successful write.
type Props = { root: string; data: ListResult; onReload: () => Promise<void> };

// root is unused until Task 10 wires it into ReportPane's readReport call —
// aliased to silence noUnusedLocals rather than dropped from the signature,
// since the Pipeline interface contract (task-9-brief.md) requires it now.
export default function Pipeline({ root: _root, data, onReload }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('score');
  const [view, setView] = useState<ViewMode>('grouped');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(
    () => applyFilterAndSort(data.applications, filter, sort, view, query),
    [data.applications, filter, sort, view, query],
  );

  const counts = useMemo(() => {
    const out = {} as Record<FilterKey, number>;
    for (const t of TABS) out[t.key] = countForFilter(data.applications, t.key, query);
    return out;
  }, [data.applications, query]);

  return (
    <div className="pane">
      <MetricsBar metrics={data.metrics} />
      <Toolbar
        filter={filter} sort={sort} view={view} query={query} counts={counts}
        onFilter={setFilter} onSort={setSort} onView={setView}
        onQuery={setQuery} onReload={onReload}
      />
      <div className="split">
        <div>
          <AppTable
            rows={rows}
            grouped={view === 'grouped'}
            selected={selected}
            sort={sort}
            onSelect={setSelected}
            onSort={setSort}
          />
        </div>
        <div style={{ padding: 16, color: 'var(--subtext)' }}>
          {selected ? `Selected ${selected} — report pane lands in Task 10` : 'Select a row'}
        </div>
      </div>
    </div>
  );
}
