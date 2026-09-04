/**
 * How many inbox entries one agent turn evaluates. The desktop chains turns
 * (see batchDriver.ts) until the inbox is empty, so this only bounds a single
 * turn: small enough to finish well inside any CLI's print-mode limit, and to
 * leave every finished entry on disk if a turn dies. Travels to the Rust
 * batch prompt as the `limit` arg — this constant is the only definition.
 */
import { t } from './i18n';

export const BATCH_LIMIT = 5;

// TESTING OVERRIDE: cap at 3 per press; revert to BATCH_LIMIT before release
export function batchArgs(): Record<string, string> {
  return { limit: '3' };
}

/**
 * Button label. The caller disables it when nothing is pending; while a batch
 * is already running the same button reopens that run instead of starting one.
 */
export function processPendingLabel(_pending: number, running = false): string {
  return running ? t('View progress') : t('Evaluate all pending');
}

/** Task-chip label: this turn's slice against the whole inbox. */
export function batchTaskLabel(pending: number): string {
  return t('Evaluating (next {n} of {m} pending)', { n: Math.min(BATCH_LIMIT, pending), m: pending });
}
