import { describe, expect, it, vi } from 'vitest';
import InboxTable from './InboxTable';
import type { InboxEntry } from '../api';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

const entries: InboxEntry[] = [
  { url: 'https://a', company: 'n8n', role: 'Head of Solutions', location: 'Berlin', postedAt: '2026-07-28', state: 'pending' },
  { url: 'https://b', company: 'Broken Co', role: 'Eng', location: 'Hamburg', postedAt: '', state: 'failed' },
];

function render(over: Partial<Parameters<typeof InboxTable>[0]> = {}) {
  return JSON.stringify(InboxTable({ entries, query: '', onProcessPending: vi.fn(), batchStarting: false, onOpenError: vi.fn(), ...over }));
}

describe('InboxTable', () => {
  it('lists every entry with company, role, location and posted date', () => {
    const text = render();
    for (const s of ['n8n', 'Head of Solutions', 'Berlin', '2026-07-28', 'Broken Co']) expect(text).toContain(s);
  });

  it('marks failed rows as needing attention', () => {
    expect(render()).toMatch(/Needs attention/);
  });

  it('filters rows by the toolbar query', () => {
    const text = render({ query: 'hamburg' });
    expect(text).toContain('Broken Co');
    expect(text).not.toContain('n8n');
  });

  it('shows an empty state instead of an empty table', () => {
    expect(render({ entries: [] })).toMatch(/Inbox is empty/);
  });
});
