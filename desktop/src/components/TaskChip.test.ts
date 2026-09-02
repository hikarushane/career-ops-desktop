import { describe, expect, it, vi } from 'vitest';
import TaskChip from './TaskChip';
import type { TaskRecord } from '../lib/taskStore';

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object' || node === null) return '';
  return textContent((node as { props?: { children?: unknown } }).props?.children);
}

const t = (over: Partial<TaskRecord>): TaskRecord => ({
  taskId: 'a', taskType: 'evaluate', label: 'Acme', startedAt: Date.now() - 120_000,
  state: 'running', events: [], rawLog: [], outcome: null, exitCode: null, args: {}, ...over,
});

describe('TaskChip', () => {
  it('renders nothing without tasks', () => {
    expect(TaskChip({ tasks: [], onOpen: vi.fn(), onDismiss: vi.fn() })).toBeNull();
  });

  it('names a single running task with elapsed minutes', () => {
    expect(textContent(TaskChip({ tasks: [t({})], onOpen: vi.fn(), onDismiss: vi.fn() }))).toMatch(/Evaluating Acme · 2m/);
  });

  it('counts multiple running tasks', () => {
    expect(textContent(TaskChip({
      tasks: [t({}), t({ taskId: 'b', taskType: 'scan', label: 'Scan' })],
      onOpen: vi.fn(),
      onDismiss: vi.fn(),
    }))).toMatch(/2 tasks running/);
  });

  it('shows done and failed labels', () => {
    expect(textContent(TaskChip({
      tasks: [t({ state: 'done', outcome: { ok: true, detail: 'reports/042.md', artifacts: [] } })],
      onOpen: vi.fn(),
      onDismiss: vi.fn(),
    }))).toMatch(/Done · Acme/);
    expect(textContent(TaskChip({
      tasks: [t({ state: 'failed', outcome: { ok: false, detail: 'x', artifacts: [] } })],
      onOpen: vi.fn(),
      onDismiss: vi.fn(),
    }))).toMatch(/Failed · Acme/);
  });
});
