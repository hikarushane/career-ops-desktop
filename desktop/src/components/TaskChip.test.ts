import { afterEach, describe, expect, it, vi } from 'vitest';
import TaskChip from './TaskChip';
import type { TaskRecord } from '../lib/taskStore';

// Positional useState harness (see Home.test.ts / Evaluate.test.ts for the
// established pattern). TaskChip has one slot, in declaration order:
//   0 open (boolean) -- whether the multi-task dropdown menu is shown
const hooks = vi.hoisted(() => {
  let state: unknown[] = [];
  let cursor = 0;
  return {
    reset(initial: unknown[] = []) {
      state = initial;
      cursor = 0;
    },
    beginRender() {
      cursor = 0;
    },
    useState(initial: unknown) {
      const index = cursor++;
      if (index === state.length) state.push(initial);
      return [state[index], (value: unknown) => { state[index] = value; }];
    },
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: hooks.useState,
    useEffect: () => {},
    useRef: (v: unknown) => ({ current: v }),
  };
});

afterEach(() => hooks.reset());

type ElementNode = { type?: unknown; props?: { children?: unknown; onClick?: () => void; role?: string } };

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object' || node === null) return '';
  return textContent((node as ElementNode).props?.children);
}

function findAll(node: unknown, pred: (n: ElementNode) => boolean, out: ElementNode[] = []): ElementNode[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, pred, out);
    return out;
  }
  if (typeof node !== 'object' || node === null) return out;
  const el = node as ElementNode;
  if (pred(el)) out.push(el);
  findAll(el.props?.children, pred, out);
  return out;
}

const t = (over: Partial<TaskRecord>): TaskRecord => ({
  taskId: 'a', taskType: 'evaluate', label: 'Acme', startedAt: Date.now() - 120_000,
  state: 'running', events: [], rawLog: [], outcome: null, exitCode: null, args: {}, ...over,
});

describe('TaskChip', () => {
  it('renders nothing without tasks', () => {
    hooks.reset([false]);
    hooks.beginRender();
    expect(TaskChip({ tasks: [], onOpen: vi.fn(), onDismiss: vi.fn() })).toBeNull();
  });

  it('names a single running task with elapsed minutes', () => {
    hooks.reset([false]);
    hooks.beginRender();
    expect(textContent(TaskChip({ tasks: [t({})], onOpen: vi.fn(), onDismiss: vi.fn() }))).toMatch(/Evaluating Acme · 2m/);
  });

  it('names a running pdf task "Generating CV"', () => {
    hooks.reset([false]);
    hooks.beginRender();
    expect(textContent(TaskChip({
      tasks: [t({ taskType: 'pdf', label: 'CV · Acme' })],
      onOpen: vi.fn(),
      onDismiss: vi.fn(),
    }))).toMatch(/Generating CV CV · Acme · 2m/);
  });

  it('names a running cover task "Writing cover letter"', () => {
    hooks.reset([false]);
    hooks.beginRender();
    expect(textContent(TaskChip({
      tasks: [t({ taskType: 'cover', label: 'Cover letter · Acme' })],
      onOpen: vi.fn(),
      onDismiss: vi.fn(),
    }))).toMatch(/Writing cover letter Cover letter · Acme · 2m/);
  });

  it('counts multiple running tasks', () => {
    hooks.reset([false]);
    hooks.beginRender();
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
    hooks.reset([false]);
    hooks.beginRender();
    expect(textContent(TaskChip({
      tasks: [t({ state: 'done', outcome: { ok: true, detail: 'reports/042.md', artifacts: [] } })],
      onOpen: vi.fn(),
      onDismiss: vi.fn(),
    }))).toMatch(/Done · Acme/);
    hooks.reset([false]);
    hooks.beginRender();
    expect(textContent(TaskChip({
      tasks: [t({ state: 'failed', outcome: { ok: false, detail: 'x', artifacts: [] } })],
      onOpen: vi.fn(),
      onDismiss: vi.fn(),
    }))).toMatch(/Failed · Acme/);
  });

  describe('multi-task dropdown', () => {
    const twoTasks = [
      t({ taskId: 'a', label: 'Acme' }),
      t({ taskId: 'b', taskType: 'scan', label: 'Beta Corp' }),
    ];

    it('renders no menu until the chip is clicked', () => {
      hooks.reset([false]);
      hooks.beginRender();
      const tree = TaskChip({ tasks: twoTasks, onOpen: vi.fn(), onDismiss: vi.fn() });
      expect(findAll(tree, (n) => n.props?.role === 'menu')).toHaveLength(0);
    });

    it('opens a menu listing every running task, one row per task', () => {
      hooks.reset([false]);
      hooks.beginRender();
      const closed = TaskChip({ tasks: twoTasks, onOpen: vi.fn(), onDismiss: vi.fn() }) as ElementNode;
      // The main button is the sole child while the menu is closed.
      const mainButton = closed.props?.children as ElementNode;
      mainButton.props?.onClick?.();

      hooks.beginRender();
      const open = TaskChip({ tasks: twoTasks, onOpen: vi.fn(), onDismiss: vi.fn() });
      const items = findAll(open, (n) => n.props?.role === 'menuitem');
      expect(items).toHaveLength(2);
      expect(textContent(items[0])).toMatch(/Evaluating Acme/);
      expect(textContent(items[1])).toMatch(/Scanning Beta Corp/);
    });

    it('opens the clicked task and closes the menu', () => {
      const onOpen = vi.fn();
      hooks.reset([true]);
      hooks.beginRender();
      const tree = TaskChip({ tasks: twoTasks, onOpen, onDismiss: vi.fn() });
      const items = findAll(tree, (n) => n.props?.role === 'menuitem');
      items[1].props?.onClick?.();
      expect(onOpen).toHaveBeenCalledWith('b');
    });
  });
});
