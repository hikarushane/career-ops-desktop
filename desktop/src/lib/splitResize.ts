/**
 * Report panel width, shared by the Flat view's split pane and the Kanban
 * view's drawer so the report reads the same in both. The user drags the
 * boundary; the width is clamped so neither side collapses, and remembered
 * per browser profile (localStorage — a per-viewer convenience, not data).
 */

/** Matches --drawer-width in theme.css, the width before the user drags. */
export const DEFAULT_REPORT_WIDTH = 640;
/** Narrower than this and the Block A-F tables in the report wrap badly. */
export const MIN_REPORT_WIDTH = 420;
/** Space kept for the table or board beside the report. */
export const MIN_OTHER_WIDTH = 320;

const STORAGE_KEY = 'careerops.reportWidth';

export function clampReportWidth(px: number, available: number): number {
  const max = Math.max(MIN_REPORT_WIDTH, available - MIN_OTHER_WIDTH);
  return Math.round(Math.min(max, Math.max(MIN_REPORT_WIDTH, px)));
}

/**
 * The report sits on the right, so its width is the distance from the
 * pointer to the container's right edge.
 */
export function reportWidthFromPointer(containerRight: number, pointerX: number, available: number): number {
  return clampReportWidth(containerRight - pointerX, available);
}

export function loadReportWidth(available: number): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? clampReportWidth(parsed, available) : clampReportWidth(DEFAULT_REPORT_WIDTH, available);
  } catch {
    return clampReportWidth(DEFAULT_REPORT_WIDTH, available);
  }
}

export function saveReportWidth(px: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(px));
  } catch {
    // Storage blocked (private window, disk full): the width still applies for this visit.
  }
}
