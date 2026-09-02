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
    const multi = TaskChip({
      tasks: [t({}), t({ taskId: 'b', taskType: 'scan', label: 'Scan' })],
      onOpen: vi.fn(),
      onDismiss: vi.fn(),
    });
    expect(textContent(multi)).toMatch(/2 tasks running/);
    // Regression: the multi-task chip must reuse the `.task-chip button`
    // padding rule (a bare <button className="task-chip running"> had no
    // padding of its own), so it needs a `.task-chip` wrapper around a
    // `.task-chip-main` button, same shape as the single-task chip.
    const el = multi as { type: string; props: { className: string; children: { type: string; props: { className: string } } } };
    expect(el.type).toBe('span');
    expect(el.props.className).toBe('task-chip running');
    expect(el.props.children.type).toBe('button');
    expect(el.props.children.props.className).toBe('task-chip-main');
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
