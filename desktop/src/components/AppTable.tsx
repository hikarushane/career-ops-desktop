import { Fragment } from 'react';
import type { Application } from '../api';
import { scoreBand, type SortKey } from '../lib/filters';
import StatusSelect from './StatusSelect';

/** Display labels for normalized statuses, matching statusLabel (pipeline.go:1129). */
const LABELS: Record<string, string> = {
  interview: 'Interview',
  offer: 'Offer',
  responded: 'Responded',
  applied: 'Applied',
  evaluated: 'Evaluated',
  skip: 'SKIP',
  rejected: 'Rejected',
  discarded: 'Discarded',
};

export function statusLabel(norm: string): string {
  return LABELS[norm] ?? norm;
}

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
  grouped: boolean;
  selected: string | null;
  sort: SortKey;
  onSelect: (reportNumber: string) => void;
  onSort: (s: SortKey) => void;
  onStatusChange?: (app: Application, next: string) => void;
  pendingRow?: string | null;
};

export default function AppTable({
  rows, grouped, selected, sort, onSelect, onSort, onStatusChange, pendingRow,
}: Props) {
  let lastGroup = '';

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
              {c.label}
              {c.sort === sort ? ' ▾' : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => {
          const head = grouped && a.normStatus !== lastGroup;
          if (head) lastGroup = a.normStatus;
          const rowKey = a.reportNumber || `${a.company}-${a.number}`;
          return (
            <Fragment key={rowKey}>
              {head && (
                <tr className="group-head">
                  <td colSpan={COLUMNS.length}>{statusLabel(a.normStatus)}</td>
                </tr>
              )}
              <tr
                aria-selected={selected === a.reportNumber}
                onClick={() => onSelect(a.reportNumber)}
                style={{ cursor: 'pointer' }}
              >
                <td>{a.number}</td>
                <td>{a.date}</td>
                <td>{a.company}</td>
                <td>{a.role}</td>
                <td className={`score ${scoreBand(a.score)}`}>{a.score.toFixed(1)}</td>
                <td>
                  {onStatusChange ? (
                    <StatusSelect
                      value={a.status}
                      normStatus={a.normStatus}
                      disabled={pendingRow === a.reportNumber || !a.reportNumber}
                      onChange={(next) => onStatusChange(a, next)}
                    />
                  ) : (
                    <span className="status-pill" style={{ color: `var(--status-${a.normStatus}, var(--text))` }}>
                      {a.status}
                    </span>
                  )}
                </td>
                <td>{a.hasPdf ? '✅' : ''}</td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
