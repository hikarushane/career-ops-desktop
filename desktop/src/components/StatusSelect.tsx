import { getCanonicalLabels } from '../lib/contracts';

type Props = {
  value: string;
  normStatus: string;
  disabled: boolean;
  onChange: (next: string) => void;
};

export default function StatusSelect({ value, normStatus, disabled, onChange }: Props) {
  // A legacy row may hold a non-canonical status ("aplicado", "hold"). Keep it
  // in the list so the select can display it, but never write it back.
  const canonical = getCanonicalLabels();
  const options = canonical.includes(value)
    ? [...canonical]
    : [value, ...canonical];

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
        background: `var(--status-${normStatus}, var(--color-surface-muted))`,
        color: `var(--status-${normStatus}-on, var(--color-text-primary))`,
        border: 0,
        borderRadius: 'var(--radius-control)',
        padding: '2px 10px',
        height: 25,
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      {options.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
