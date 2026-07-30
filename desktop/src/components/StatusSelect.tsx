import { CANONICAL_STATUSES } from '../api';

type Props = {
  value: string;
  normStatus: string;
  disabled: boolean;
  onChange: (next: string) => void;
};

export default function StatusSelect({ value, normStatus, disabled, onChange }: Props) {
  // A legacy row may hold a non-canonical status ("aplicado", "hold"). Keep it
  // in the list so the select can display it, but never write it back.
  const options = CANONICAL_STATUSES.includes(value as never)
    ? [...CANONICAL_STATUSES]
    : [value, ...CANONICAL_STATUSES];

  return (
    <select
      value={value}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        if (e.target.value !== value) onChange(e.target.value);
      }}
      style={{
        background: 'var(--surface)',
        color: `var(--status-${normStatus}, var(--text))`,
        border: '1px solid var(--overlay)',
        borderRadius: 4,
        padding: '2px 6px',
        fontSize: 12,
      }}
    >
      {options.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
