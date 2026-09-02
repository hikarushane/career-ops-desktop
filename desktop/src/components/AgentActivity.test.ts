import { describe, expect, it, vi } from 'vitest';
import AgentActivity from './AgentActivity';
import type { TaskRecord } from '../lib/taskStore';

vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useState: (v: unknown) => [typeof v === 'function' ? (v as () => unknown)() : v, () => {}], useEffect: () => {} }));

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object' || node === null) return '';
  return textContent((node as { props?: { children?: unknown } }).props?.children);
}

const base: TaskRecord = { taskId: 't', taskType: 'evaluate', label: 'Acme', startedAt: Date.now() - 65_000, state: 'running',
  events: [{ task_id: 't', kind: 'tool', summary: 'Write', tool: 'Write', target: '/w/reports/042-acme.md', is_error: null }],
  rawLog: ['line'], outcome: null, exitCode: null };

describe('AgentActivity', () => {
  it('shows the latest real activity while running', () => {
    const text = textContent(AgentActivity({ task: base, onCancel: vi.fn(), onRetry: vi.fn() }));
    expect(text).toMatch(/Running · 1m 0[45]s · Writing reports\/042-acme\.md/);
    expect(text).not.toMatch(/Generating evaluation/);
  });
  it('shows the outcome detail when failed with exit 0', () => {
    const failed = { ...base, state: 'failed' as const, exitCode: 0, outcome: { ok: false, detail: 'The AI finished without producing a report.', artifacts: [] },
      events: [...base.events, { task_id: 't', kind: 'text' as const, summary: 'I will use an agent to run the pipeline.', tool: null, target: null, is_error: null }] };
    const text = textContent(AgentActivity({ task: failed, onCancel: vi.fn(), onRetry: vi.fn() }));
    expect(text).toMatch(/without producing a report/);
    expect(text).toMatch(/I will use an agent/);
    expect(text).toMatch(/Retry/);
  });
});
