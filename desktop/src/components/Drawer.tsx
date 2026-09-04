import type { CSSProperties, ReactNode } from 'react';
import { t } from '../lib/i18n';
import { CloseIcon } from './icons';
import ResizeHandle from './ResizeHandle';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Panel width in px; the left edge is draggable and reports a new width. */
  width: number;
  onResize: (width: number) => void;
  onResizeEnd: () => void;
  children: ReactNode;
};

/**
 * Slide-over for a Kanban card's report. An 8-column board and a permanent
 * split panel can't both fit at the 1366px reference width, so the Kanban
 * view opens the report on demand instead — see desktop/STITCH-PROMPT.md
 * §6.3. Its width is the shared report width (lib/splitResize.ts).
 */
export default function Drawer({ open, onClose, width, onResize, onResizeEnd, children }: Props) {
  if (!open) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" style={{ '--report-width': `${width}px` } as CSSProperties}>
        <ResizeHandle onResize={onResize} onResizeEnd={onResizeEnd} />
        <button type="button" className="drawer-close" onClick={onClose} aria-label={t('Close')}>
          <CloseIcon />
        </button>
        <div className="drawer-content">{children}</div>
      </aside>
    </>
  );
}
