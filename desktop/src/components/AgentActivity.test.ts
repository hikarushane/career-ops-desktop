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
  rawLog: ['line'], outcome: null, exitCode: null, args: {} };

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

  it('falls back to raw provider output when there are no structured events', () => {
    const textOnly = { ...base, events: [], rawLog: ['starting up', 'reading job posting', 'writing report to reports/042-acme.md'] };
    const text = textContent(AgentActivity({ task: textOnly, onCancel: vi.fn(), onRetry: vi.fn() }));
    expect(text).toMatch(/Provider output \(raw\)/);
    expect(text).toMatch(/writing report to reports\/042-acme\.md/);
    expect(text).toMatch(/Running · 1m 0[45]s · writing report to reports\/042-acme\.md/);
  });

  it('truncates a long raw line to 80 characters in the headline', () => {
    const longLine = 'x'.repeat(120);
    const textOnly = { ...base, events: [], rawLog: [longLine] };
    const text = textContent(AgentActivity({ task: textOnly, onCancel: vi.fn(), onRetry: vi.fn() }));
    expect(text).toMatch(new RegExp(`· ${'x'.repeat(80)}…`));
  });

  it('does not show raw output when task has text events but no status/tool events', () => {
    const textEvents = { ...base, events: [{ task_id: 't', kind: 'text' as const, summary: 'Hello', tool: null, target: null, is_error: null }], rawLog: ['{"type":"assistant"}'] };
    const text = textContent(AgentActivity({ task: textEvents, onCancel: vi.fn(), onRetry: vi.fn() }));
    expect(text).not.toMatch(/Provider output \(raw\)/);
    expect(text).not.toMatch(/{"type"/);
    expect(text).toMatch(/Waiting for the AI provider to start/);
  });
});
