import type { Application } from '../api';
import { getStatusLabels } from './contracts';

/**
 * A card dropped on a status column becomes a status change through the
 * same write path as the StatusSelect (canonical label in, set-status with
 * expectStatus guard). Null means nothing to write: same column, unknown
 * card, or a virtual column like "Top ≥4" that is not a status.
 */
export function resolveDrop(
  apps: Application[],
  reportNumber: string,
  targetStatus: string,
): { app: Application; next: string } | null {
  const label = getStatusLabels()[targetStatus];
  if (!label) return null;
  const app = apps.find((a) => a.reportNumber === reportNumber);
  if (!app || app.normStatus === targetStatus) return null;
  return { app, next: label };
}

/*
 * The board drives its drag from pointer events, not HTML5 drag-and-drop.
 * Tauri installs a native drag-drop handler on the webview (the Background
 * import screen needs it for Finder drops) and, on macOS, that handler
 * answers every NSDraggingDestination callback itself instead of forwarding
 * to WKWebView (wry/src/wkwebview/drag_drop.rs), so the page never receives
 * dragover/drop and a `draggable` card has nowhere to land. Pointer events
 * never leave the page. Everything below is pure so it can be unit-tested
 * without a DOM; KanbanBoard wires it to window listeners.
 */

/** Pointer travel before a press turns into a drag rather than a click. */
export const DRAG_THRESHOLD_PX = 6;

export type DragSession = {
  reportNumber: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** True once the pointer has moved past DRAG_THRESHOLD_PX. */
  active: boolean;
  /** Status of the column under the pointer; only tracked while active. */
  target: string | null;
};

export function beginDrag(reportNumber: string, x: number, y: number): DragSession {
  return { reportNumber, startX: x, startY: y, x, y, active: false, target: null };
}

export function moveDrag(session: DragSession, x: number, y: number, statusAtPoint: string | null): DragSession {
  const active = session.active || Math.hypot(x - session.startX, y - session.startY) >= DRAG_THRESHOLD_PX;
  return { ...session, x, y, active, target: active ? statusAtPoint : null };
}

const DROP_TARGET_SELECTOR = '[data-drop-status]';
const CONTROL_SELECTOR = 'select, button, a, input, textarea';

/** Status of the nearest column or collapsed chip enclosing `element`. */
export function dropStatusAt(element: Element | null): string | null {
  return element?.closest(DROP_TARGET_SELECTOR)?.getAttribute('data-drop-status') ?? null;
}

/** A press on the card body may start a drag; one on a control inside it must not. */
export function startsDragFrom(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  return (target as Element).closest(CONTROL_SELECTOR) === null;
}
