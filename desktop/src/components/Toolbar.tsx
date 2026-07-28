import { TABS, type FilterKey, type SortKey, type ViewMode } from '../lib/filters';

type Props = {
  filter: FilterKey;
  sort: SortKey;
  view: ViewMode;
  query: string;
  counts: Record<FilterKey, number>;
  onFilter: (f: FilterKey) => void;
  onSort: (s: SortKey) => void;
  onView: (v: ViewMode) => void;
  onQuery: (q: string) => void;
  onReload: () => void;
};

export default function Toolbar(p: Props) {
  return (
    <div className="toolbar">
      {TABS.map((t) => (
        <button
          key={t.key}
          className="tab"
          aria-pressed={p.filter === t.key}
          onClick={() => p.onFilter(t.key)}
        >
          {t.label} <span style={{ opacity: 0.6 }}>{p.counts[t.key]}</span>
        </button>
      ))}

      <input
        type="search"
        placeholder="Search company, role, notes"
        value={p.query}
        onChange={(e) => p.onQuery(e.target.value)}
        style={{ marginLeft: 'auto', minWidth: 220 }}
      />

      <select value={p.sort} onChange={(e) => p.onSort(e.target.value as SortKey)}>
        <option value="score">Sort: score</option>
        <option value="date">Sort: date</option>
        <option value="company">Sort: company</option>
        <option value="status">Sort: status</option>
      </select>

      <select value={p.view} onChange={(e) => p.onView(e.target.value as ViewMode)}>
        <option value="grouped">Grouped</option>
        <option value="flat">Flat</option>
      </select>

      <button className="tab" onClick={p.onReload}>Reload</button>
    </div>
  );
}
