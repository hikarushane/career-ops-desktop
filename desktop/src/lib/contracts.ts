import { contracts, isError, type StateEntry } from '../api';

const FALLBACK: StateEntry[] = [
  { id: 'evaluated', label: 'Evaluated', terminal: false, priority: 5, group: 'evaluated' },
  { id: 'applied', label: 'Applied', terminal: false, priority: 4, group: 'applied' },
  { id: 'responded', label: 'Responded', terminal: false, priority: 3, group: 'responded' },
  { id: 'interview', label: 'Interview', terminal: false, priority: 0, group: 'interview' },
  { id: 'offer', label: 'Offer', terminal: true, priority: 1, group: 'offer' },
  { id: 'hired', label: 'Hired', terminal: true, priority: 2, group: 'hired' },
  { id: 'rejected', label: 'Rejected', terminal: true, priority: 7, group: 'rejected' },
  { id: 'discarded', label: 'Discarded', terminal: true, priority: 8, group: 'discarded' },
  { id: 'skip', label: 'SKIP', terminal: true, priority: 6, group: 'skip' },
];

let cached: StateEntry[] = FALLBACK;

export async function loadContracts(): Promise<void> {
  const r = await contracts();
  if (!isError(r)) cached = r.states;
}

export function getStates(): readonly StateEntry[] {
  return cached;
}

export function getGroupOrder(): string[] {
  return [...cached].sort((a, b) => a.priority - b.priority).map((s) => s.id);
}

export function getStatusLabels(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const s of cached) m[s.id] = s.label;
  return m;
}

export function getCanonicalLabels(): string[] {
  return cached.map((s) => s.label);
}
