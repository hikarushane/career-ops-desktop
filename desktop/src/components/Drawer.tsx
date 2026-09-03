import type { ReactNode } from 'react';
import { CloseIcon } from './icons';

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * 640px slide-over for a Kanban card's report. An 8-column board and a
 * permanent split panel can't both fit at the 1366px reference width, so
 * the Kanban view opens the report on demand instead — see
 * desktop/STITCH-PROMPT.md §6.3.
 */
export default function Drawer({ open, onClose, children }: Props) {
  if (!open) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
        <div className="drawer-content">{children}</div>
      </aside>
    </>
  );
}
