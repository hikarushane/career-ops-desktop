import { TABS, type FilterKey, type SortKey, type ViewMode } from '../lib/filters';
import { t } from '../lib/i18n';

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
};

export default function Toolbar(p: Props) {
  return (
    <div className="toolbar">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          className="tab"
          aria-pressed={p.filter === tab.key}
          onClick={() => p.onFilter(tab.key)}
        >
          {t(tab.label)} <span style={{ opacity: 0.6 }}>{p.counts[tab.key]}</span>
        </button>
      ))}

      <input
        type="search"
        placeholder={t('Search company, role, notes')}
        value={p.query}
        onChange={(e) => p.onQuery(e.target.value)}
        style={{ marginLeft: 'auto', minWidth: 220 }}
      />

      {/* Sort and Grouped/Flat act on tracker rows; the inbox has neither
          scores nor statuses, so they are hidden rather than left inert. */}
      {p.filter !== 'inbox' && (
        <>
          <select value={p.sort} onChange={(e) => p.onSort(e.target.value as SortKey)}>
            <option value="score">{t('Sort: score')}</option>
            <option value="date">{t('Sort: date')}</option>
            <option value="company">{t('Sort: company')}</option>
            <option value="status">{t('Sort: status')}</option>
          </select>

          <select value={p.view} onChange={(e) => p.onView(e.target.value as ViewMode)}>
            <option value="grouped">{t('Grouped')}</option>
            <option value="flat">{t('Flat')}</option>
          </select>
        </>
      )}
    </div>
  );
}
