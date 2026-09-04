import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { isError, setStatus, type Application, type ListResult } from '../api';
import {
  applyFilterAndSort, countForFilter, matchesInboxSearch, TABS,
  type FilterKey, type SortKey, type ViewMode,
} from '../lib/filters';
import { isTaskForReport } from '../lib/documentTasks';
import { t } from '../lib/i18n';
import { loadReportWidth, saveReportWidth } from '../lib/splitResize';
import { startTask, useRunningTasks, useTasks } from '../lib/taskStore';
import AppTable from '../components/AppTable';
import Drawer from '../components/Drawer';
import InboxTable from '../components/InboxTable';
import KanbanBoard from '../components/KanbanBoard';
import MetricsBar from '../components/MetricsBar';
import ReportPane from '../components/ReportPane';
import ResizeHandle from '../components/ResizeHandle';
import Toolbar from '../components/Toolbar';

// onReload is async because Task 11 awaits it after a successful write.
type Props = {
  root: string;
  data: ListResult;
  onReload: () => Promise<unknown>;
  initialSelected?: string;
  /** Tab to open on; the scanner's "Review inbox" lands on 'inbox'. */
  initialFilter?: FilterKey;
  onProcessPending: () => void;
  batchStarting: boolean;
  batchRunning: boolean;
};

export default function Pipeline({
  root, data, onReload, initialSelected, initialFilter, onProcessPending, batchStarting, batchRunning,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>(initialFilter ?? 'all');
  const [sort, setSort] = useState<SortKey>('score');
  const [view, setView] = useState<ViewMode>('grouped');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null);
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<{ stale: boolean; message: string } | null>(null);
  // Report panel width, shared by the drawer and the Flat split; dragged by
  // the user and remembered across visits (lib/splitResize.ts).
  const [reportWidth, setReportWidth] = useState(() => loadReportWidth(window.innerWidth));
  const running = useRunningTasks();
  const tasks = useTasks();
  const handledTaskIds = useRef<Set<string>>(new Set());
  const splitRef = useRef<HTMLDivElement | null>(null);
  const persistReportWidth = useCallback(() => saveReportWidth(reportWidth), [reportWidth]);

  const rows = useMemo(
    () => applyFilterAndSort(data.applications, filter, sort, view, query),
    [data.applications, filter, sort, view, query],
  );

  const selectedApp = useMemo(
    () => rows.find((a) => a.reportNumber === selected) ?? null,
    [rows, selected],
  );

  const inbox = useMemo(() => data.inbox ?? [], [data.inbox]);

  const counts = useMemo(() => {
    const out = {} as Record<FilterKey, number>;
    for (const t of TABS) out[t.key] = countForFilter(data.applications, t.key, query);
    out.inbox = inbox.filter((e) => matchesInboxSearch(e, query)).length;
    return out;
  }, [data.applications, inbox, query]);

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

  const onStartTask = useCallback(
    async (taskType: 'pdf' | 'cover', args: Record<string, string>, label: string) => {
      await startTask(taskType, args, root, label);
    },
    [root],
  );

  const runningTaskFor = useCallback(
    (taskType: 'pdf' | 'cover') => {
      if (!selectedApp) return null;
      return running.find((t) => isTaskForReport(t, taskType, selectedApp.reportNumber, selectedApp.company)) ?? null;
    },
    [running, selectedApp],
  );

  // Once a pdf/cover task the report pane is watching finishes, reload so
  // pdfPath/coverLetterPath (resolved server-side) come back and the action
  // buttons flip from "Generate…" to "View…". Keyed on the joined ids of
  // finished pdf/cover tasks (not `tasks` itself) so this only re-runs when
  // that specific set changes; the ref guards each id to exactly one reload
  // even though the effect's dependency is a plain string, not the task list.
  const finishedPdfCoverTaskIds = tasks
    .filter((t) => t.state !== 'running' && (t.taskType === 'pdf' || t.taskType === 'cover'))
    .map((t) => t.taskId)
    .join(',');

  useEffect(() => {
    const ids = finishedPdfCoverTaskIds ? finishedPdfCoverTaskIds.split(',') : [];
    const unhandled = ids.filter((id) => !handledTaskIds.current.has(id));
    if (unhandled.length === 0) return;
    for (const id of unhandled) handledTaskIds.current.add(id);
    onReload().catch(() => {});
  }, [finishedPdfCoverTaskIds, onReload]);

  return (
    <div className="pane">
      <MetricsBar metrics={data.metrics} />
      <Toolbar
        filter={filter} sort={sort} view={view} query={query} counts={counts}
        onFilter={setFilter} onSort={setSort} onView={setView}
        onQuery={setQuery}
      />
      {writeError && (
        <div className={`banner${writeError.stale ? ' stale' : ''}`}>
          <p>{writeError.message}</p>
          <button onClick={() => { setWriteError(null); onReload(); }}>{t('Reload')}</button>
          <button onClick={() => setWriteError(null)}>{t('Dismiss')}</button>
        </div>
      )}
      {filter === 'inbox' ? (
        <InboxTable
          entries={inbox}
          query={query}
          onProcessPending={onProcessPending}
          batchStarting={batchStarting}
          batchRunning={batchRunning}
          onOpenError={(message) => setWriteError({ stale: false, message })}
        />
      ) : view === 'grouped' ? (
        <>
          <KanbanBoard
            apps={rows}
            selected={selected}
            onSelect={setSelected}
            onStatusChange={changeStatus}
            pendingRow={pendingRow}
          />
          {/* An 8-column board and a permanent report panel can't both fit
              at once, so the Kanban view opens the report as a drawer on
              click instead of a split pane — STITCH-PROMPT.md §6.3. */}
          <Drawer
            open={selected !== null}
            onClose={() => setSelected(null)}
            width={reportWidth}
            onResize={setReportWidth}
            onResizeEnd={persistReportWidth}
          >
            <ReportPane
              root={root}
              app={selectedApp}
              onStartTask={onStartTask}
              runningTaskFor={runningTaskFor}
              onStatusChange={changeStatus}
              pending={selectedApp !== null && pendingRow === selectedApp.reportNumber}
            />
          </Drawer>
        </>
      ) : (
        /* The table takes the full width until a row is picked; the report
           then opens beside it behind a draggable boundary. */
        <div
          ref={splitRef}
          className={selectedApp ? 'split' : 'split split--single'}
          style={{ '--report-width': `${reportWidth}px` } as CSSProperties}
        >
          <div>
            <AppTable
              rows={rows}
              selected={selected}
              sort={sort}
              onSelect={setSelected}
              onSort={setSort}
              onStatusChange={changeStatus}
              pendingRow={pendingRow}
            />
          </div>
          {selectedApp && (
            <>
              <ResizeHandle containerRef={splitRef} onResize={setReportWidth} onResizeEnd={persistReportWidth} />
              <ReportPane
                root={root}
                app={selectedApp}
                onStartTask={onStartTask}
                runningTaskFor={runningTaskFor}
                onStatusChange={changeStatus}
                pending={pendingRow === selectedApp.reportNumber}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
