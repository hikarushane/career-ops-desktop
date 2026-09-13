import { getCanonicalLabels } from '../lib/contracts';
import { t } from '../lib/i18n';
import { ChevronDownIcon } from './icons';

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

  // The native <select> arrow is painted by the platform (WebKit on macOS,
  // Chromium/WebView2 on Windows) and sits differently over a coloured
  // pill on each; on Windows it broke the pill's right edge. Hide it and
  // draw our own chevron, which inherits the pill's text colour.
  const onColor = `var(--status-${normStatus}-on, var(--color-text-primary))`;
  return (
    <span className="status-select" style={{ color: onColor }}>
      <select
        value={value}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          if (e.target.value !== value) onChange(e.target.value);
        }}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          background: `var(--status-${normStatus}, var(--color-surface-muted))`,
          color: onColor,
          border: 0,
          borderRadius: 'var(--radius-control)',
          padding: '2px 10px',
          paddingRight: 26,
          height: 25,
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        {/* The value written to the tracker stays the canonical English label; only the display is translated. */}
        {options.map((s) => <option key={s} value={s}>{t(s)}</option>)}
      </select>
      <ChevronDownIcon className="status-select-chevron" />
    </span>
  );
}
