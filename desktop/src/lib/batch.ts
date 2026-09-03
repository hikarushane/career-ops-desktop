/**
 * How many inbox entries one agent turn evaluates. The desktop chains turns
 * (see batchDriver.ts) until the inbox is empty, so this only bounds a single
 * turn: small enough to finish well inside any CLI's print-mode limit, and to
 * leave every finished entry on disk if a turn dies. Travels to the Rust
 * batch prompt as the `limit` arg — this constant is the only definition.
 */
export const BATCH_LIMIT = 5;

export function batchArgs(): Record<string, string> {
  return { limit: String(BATCH_LIMIT) };
}

/** Button label. The caller disables it when nothing is pending. */
export function processPendingLabel(_pending: number): string {
  return 'Evaluate all pending';
}

/** Task-chip label: this turn's slice against the whole inbox. */
export function batchTaskLabel(pending: number): string {
  return `Evaluating (next ${Math.min(BATCH_LIMIT, pending)} of ${pending} pending)`;
}
