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
