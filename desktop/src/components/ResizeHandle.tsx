import { useRef, type PointerEvent, type RefObject } from 'react';
import { t } from '../lib/i18n';
import { reportWidthFromPointer } from '../lib/splitResize';

type Props = {
  /** Element whose right edge the report panel is anchored to; the viewport when absent (fixed drawer). */
  containerRef?: RefObject<HTMLElement | null>;
  onResize: (width: number) => void;
  onResizeEnd: () => void;
};

/**
 * Vertical drag handle on the report panel's left edge. Pointer capture keeps
 * the drag alive when the pointer leaves the 6px strip, so no window
 * listeners are needed.
 */
export default function ResizeHandle({ containerRef, onResize, onResizeEnd }: Props) {
  const drag = useRef<{ right: number; available: number } | null>(null);

  const bounds = () => {
    const el = containerRef?.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      return { right: rect.right, available: rect.width };
    }
    return { right: window.innerWidth, available: window.innerWidth };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = bounds();
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add('is-resizing');
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onResize(reportWidthFromPointer(drag.current.right, e.clientX, drag.current.available));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.classList.remove('is-resizing');
    onResizeEnd();
  };

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Resize report panel')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
