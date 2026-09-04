import type { Application } from '../api';
import { scoreBand, type SortKey } from '../lib/filters';
import { t } from '../lib/i18n';
import { CheckIcon } from './icons';
import StatusChip from './StatusChip';
import StatusSelect from './StatusSelect';

/** Only these four columns are sortable, matching the TUI's sort cycle. */
const COLUMNS: { key: string; label: string; sort?: SortKey; align?: 'right' }[] = [
  { key: 'num', label: '#' },
  { key: 'date', label: 'Date', sort: 'date' },
  { key: 'company', label: 'Company', sort: 'company' },
  { key: 'role', label: 'Role' },
  { key: 'score', label: 'Score', sort: 'score', align: 'right' },
  { key: 'status', label: 'Status', sort: 'status' },
  { key: 'pdf', label: 'PDF' },
];

type Props = {
  rows: Application[];
  selected: string | null;
  sort: SortKey;
  onSelect: (reportNumber: string) => void;
  onSort: (s: SortKey) => void;
  onStatusChange?: (app: Application, next: string) => void;
  pendingRow?: string | null;
};

/**
 * Pipeline's Flat view. Derived — DESIGN.md has no table component (§1
 * confirms the source never defines one); styled to match its restrained
 * card/divider language instead of inventing a new visual system.
 * Grouped-by-status display now lives entirely in KanbanBoard.
 */
export default function AppTable({
  rows, selected, sort, onSelect, onSort, onStatusChange, pendingRow,
}: Props) {
  return (
    <table className="apps">
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th
              key={c.key}
              style={{ textAlign: c.align ?? 'left', cursor: c.sort ? 'pointer' : 'default' }}
              aria-sort={c.sort && sort === c.sort ? 'descending' : undefined}
              onClick={() => c.sort && onSort(c.sort)}
            >
              {c.key === 'num' ? c.label : t(c.label)}
              {c.sort === sort ? ' ▾' : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => {
          const rowKey = a.reportNumber || `${a.company}-${a.number}`;
          return (
            <tr
              key={rowKey}
              aria-selected={selected === a.reportNumber}
              onClick={() => onSelect(a.reportNumber)}
              style={{ cursor: 'pointer' }}
            >
              <td>{a.number}</td>
              <td>{a.date}</td>
              <td>{a.company}</td>
              <td>{a.role}</td>
              <td className={`score score-${scoreBand(a.score)}`}>{a.score.toFixed(1)}</td>
              <td onClick={(e) => onStatusChange && e.stopPropagation()}>
                {onStatusChange ? (
                  <StatusSelect
                    value={a.status}
                    normStatus={a.normStatus}
                    disabled={pendingRow === a.reportNumber || !a.reportNumber}
                    onChange={(next) => onStatusChange(a, next)}
                  />
                ) : (
                  <StatusChip normStatus={a.normStatus} status={a.status} />
                )}
              </td>
              <td>{a.hasPdf && <CheckIcon size={14} />}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
