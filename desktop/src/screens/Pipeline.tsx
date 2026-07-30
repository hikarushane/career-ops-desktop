import { useCallback, useMemo, useState } from 'react';
import { isError, setStatus, type Application, type ListResult } from '../api';
import {
  applyFilterAndSort, countForFilter, TABS,
  type FilterKey, type SortKey, type ViewMode,
} from '../lib/filters';
import AppTable from '../components/AppTable';
import MetricsBar from '../components/MetricsBar';
import ReportPane from '../components/ReportPane';
import Toolbar from '../components/Toolbar';

// onReload is async because Task 11 awaits it after a successful write.
type Props = { root: string; data: ListResult; onReload: () => Promise<void> };

export default function Pipeline({ root, data, onReload }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('score');
  const [view, setView] = useState<ViewMode>('grouped');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<{ stale: boolean; message: string } | null>(null);

  const rows = useMemo(
    () => applyFilterAndSort(data.applications, filter, sort, view, query),
    [data.applications, filter, sort, view, query],
  );

  const counts = useMemo(() => {
    const out = {} as Record<FilterKey, number>;
    for (const t of TABS) out[t.key] = countForFilter(data.applications, t.key, query);
    return out;
  }, [data.applications, query]);

  const changeStatus = useCallback(
    async (app: Application, next: string) => {
      setWriteError(null);
      setPendingRow(app.reportNumber);
      try {
        // expectStatus is the value this UI last read. The sidecar refuses the
        // write if the file says something else.
        const r = await setStatus(root, app.reportNumber, app.status, next);
        if (isError(r)) {
          setWriteError({ stale: r.error === 'stale', message: r.message });
          return;
        }
        await onReload();
      } catch (e) {
        setWriteError({ stale: false, message: String(e) });
      } finally {
        setPendingRow(null);
      }
    },
    [root, onReload],
  );

  return (
    <div className="pane">
      <MetricsBar metrics={data.metrics} />
      <Toolbar
        filter={filter} sort={sort} view={view} query={query} counts={counts}
        onFilter={setFilter} onSort={setSort} onView={setView}
        onQuery={setQuery} onReload={onReload}
      />
      {writeError && (
        <div className={`banner${writeError.stale ? ' stale' : ''}`}>
          <p>{writeError.message}</p>
          <button onClick={() => { setWriteError(null); onReload(); }}>Reload</button>
          <button onClick={() => setWriteError(null)}>Dismiss</button>
        </div>
      )}
      <div className="split">
        <div>
          <AppTable
            rows={rows}
            grouped={view === 'grouped'}
            selected={selected}
            sort={sort}
            onSelect={setSelected}
            onSort={setSort}
            onStatusChange={changeStatus}
            pendingRow={pendingRow}
          />
        </div>
        <ReportPane
          root={root}
          app={rows.find((a) => a.reportNumber === selected) ?? null}
        />
      </div>
    </div>
  );
}
