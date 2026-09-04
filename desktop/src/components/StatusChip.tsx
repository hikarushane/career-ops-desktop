import { statusLabel } from '../lib/filters';
import { t } from '../lib/i18n';

/**
 * Read-only status pill. DESIGN.md §5.9: 13px SemiBold, 25px fixed height,
 * 20px radius. Fill color per normStatus (theme.css --status-*), paired
 * text color per --status-*-on so every fill passes WCAG AA — see
 * theme.css's comment block for the measured contrast ratios.
 */
export default function StatusChip({ normStatus, status }: { normStatus: string; status: string }) {
  return (
    <span
      className="status-chip"
      style={{
        background: `var(--status-${normStatus}, var(--color-surface-muted))`,
        color: `var(--status-${normStatus}-on, var(--color-text-primary))`,
      }}
    >
      {t(statusLabel(normStatus) || status)}
    </span>
  );
}
