import type { Application } from '../api';

export type FilterKey =
  | 'all' | 'evaluated' | 'applied' | 'interview'
  | 'top' | 'skip' | 'rejected' | 'discarded';

export type SortKey = 'score' | 'date' | 'company' | 'status';
export type ViewMode = 'grouped' | 'flat';

/** Tab order and labels, from pipeline.go:83-92. */
export const TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'evaluated', label: 'EVALUATED' },
  { key: 'applied', label: 'APPLIED' },
  { key: 'interview', label: 'INTERVIEW' },
  { key: 'top', label: 'TOP ≥4' },
  { key: 'skip', label: 'SKIP' },
  { key: 'rejected', label: 'REJECTED' },
  { key: 'discarded', label: 'DISCARDED' },
];

/** Group display order, from pipeline.go:99. */
export const STATUS_GROUP_ORDER = [
  'interview', 'offer', 'responded', 'applied',
  'evaluated', 'skip', 'rejected', 'discarded',
];

/** Mirrors matchesSearch (pipeline.go:516-531). */
export function matchesSearch(app: Application, query: string): boolean {
  if (query === '') return true;
  const q = query.toLowerCase();
  return (
    app.company.toLowerCase().includes(q) ||
    app.role.toLowerCase().includes(q) ||
    app.notes.toLowerCase().includes(q)
  );
}

function passesFilter(app: Application, filter: FilterKey): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'top':
      // The label reads "TOP >=4"; the rule is >= 4.0 and not skip.
      return app.score >= 4.0 && app.normStatus !== 'skip';
    default:
      return app.normStatus === filter;
  }
}

/** Comparators are stable, matching Go's sort.SliceStable. */
function compare(a: Application, b: Application, sort: SortKey): number {
  switch (sort) {
    case 'score':
      return b.score - a.score;
    case 'date':
      // The TUI compares the raw date strings, which works because they are
      // ISO-formatted. Kept identical rather than parsed, so malformed dates
      // sort the same way in both dashboards.
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    case 'company': {
      const x = a.company.toLowerCase();
      const y = b.company.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    }
    case 'status':
      return a.statusPriority - b.statusPriority;
  }
}

/** Mirrors applyFilterAndSort (pipeline.go:534-600). Returns a new array. */
export function applyFilterAndSort(
  apps: Application[],
  filter: FilterKey,
  sort: SortKey,
  view: ViewMode,
  query: string,
): Application[] {
  const out = apps.filter((a) => matchesSearch(a, query) && passesFilter(a, filter));

  out.sort((a, b) => compare(a, b, sort));

  if (view === 'grouped') {
    out.sort((a, b) => {
      if (a.statusPriority !== b.statusPriority) {
        return a.statusPriority - b.statusPriority;
      }
      // Within a group the TUI falls back to score for the status sort.
      return compare(a, b, sort === 'status' ? 'score' : sort);
    });
  }

  return out;
}

/**
 * Buckets an already filtered+sorted list into the 8 status columns for
 * the Kanban board (Pipeline grouped view). Always returns all 8 buckets,
 * empty ones included, so the board's column layout doesn't shift as
 * filters change — see desktop/STITCH-PROMPT.md §6.3.
 */
export function groupByStatus(apps: Application[]): { status: string; apps: Application[] }[] {
  return STATUS_GROUP_ORDER.map((status) => ({
    status,
    apps: apps.filter((a) => a.normStatus === status),
  }));
}

export function countForFilter(
  apps: Application[],
  filter: FilterKey,
  query: string,
): number {
  return apps.filter((a) => matchesSearch(a, query) && passesFilter(a, filter)).length;
}

/** Score bands from scoreStyle (pipeline.go:1081-1091). */
export function scoreBand(score: number): 'high' | 'mid' | 'neutral' | 'low' {
  if (score >= 4.2) return 'high';
  if (score >= 3.8) return 'mid';
  if (score >= 3.0) return 'neutral';
  return 'low';
}

/** Display labels for normalized statuses, matching statusLabel (pipeline.go:1129). */
const STATUS_LABELS: Record<string, string> = {
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
  return STATUS_LABELS[norm] ?? norm;
}
