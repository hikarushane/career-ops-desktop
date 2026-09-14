import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from './Home';
import Drawer from '../components/Drawer';
import ReportPane from '../components/ReportPane';

// Positional useState harness (see InterviewWorkflow.test.ts / Evaluate.test.ts
// for the established pattern). Slot order, in declaration order in Home.tsx:
//   0 url (string)
//   1 selected (report number | null) -- recent-activity drawer selection
//   2 reportWidth (number)
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
      if (index === state.length) state.push(typeof initial === 'function' ? (initial as () => unknown)() : initial);
      return [state[index], (value: unknown) => { state[index] = value; }];
    },
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: <T,>(callback: T) => callback,
    useEffect: () => {},
    useMemo: <T,>(factory: () => T) => factory(),
    useState: hooks.useState,
  };
});

// Home's status-write/task-start plumbing is the shared useReportActions
// hook (also used by Pipeline); stub it the way heavy children are stubbed
// elsewhere so these tests only exercise Home's own wiring.
const reportActions = vi.hoisted(() => ({
  pendingRow: null as string | null,
  onStartTask: vi.fn(),
  runningTaskFor: vi.fn(() => null),
  changeStatus: vi.fn(),
}));
vi.mock('../lib/useReportActions', () => ({
  useReportActions: () => reportActions,
}));

vi.mock('../components/Drawer', () => ({ default: (props: unknown) => props }));
vi.mock('../components/ReportPane', () => ({ default: (props: unknown) => props }));

afterEach(() => hooks.reset());

type ElementNode = {
  type?: unknown;
  props?: {
    children?: unknown;
    onClick?: () => void | Promise<void>;
    disabled?: boolean;
    className?: string;
    open?: boolean;
    app?: unknown;
  };
};

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object' || node === null) return '';
  return textContent((node as ElementNode).props?.children);
}

function findButton(node: unknown, label: string): ElementNode | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child, label);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== 'object' || node === null) return undefined;
  const element = node as ElementNode;
  if (element.type === 'button' && textContent(element) === label) return element;
  return findButton(element.props?.children, label);
}

function findAll(node: unknown, pred: (n: ElementNode) => boolean, out: ElementNode[] = []): ElementNode[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, pred, out);
    return out;
  }
  if (typeof node !== 'object' || node === null) return out;
  const element = node as ElementNode;
  if (pred(element)) out.push(element);
  findAll(element.props?.children, pred, out);
  return out;
}

function findByType(node: unknown, type: unknown): ElementNode | undefined {
  return findAll(node, (n) => n.type === type)[0];
}

// Loosely typed to avoid retyping ListResult's full shape in every test.
const baseData = {
  ok: true,
  applications: [] as { number: number; reportNumber: string; company: string; role: string; normStatus: string }[],
  metrics: { Total: 0, ByStatus: {}, AvgScore: 0, TopScore: 0, WithPDF: 0, Actionable: 0 },
  progress: {} as never,
  pipelineSummary: { pending: 0, processed: 0, failed: 0 },
  inbox: [],
};

describe('Home', () => {
  it('shows a batch card with the pending count and navigates to batch', () => {
    const onNavigate = vi.fn();
    hooks.reset(['', null, 640]);
    hooks.beginRender();
    const tree = Home({
      root: '/w',
      data: { ...baseData, pipelineSummary: { pending: 7, processed: 0, failed: 0 } },
      onNavigate,
      onReload: vi.fn(async () => {}),
    } as never) as ElementNode;
    expect(textContent(tree)).toMatch(/7 pending/);
    findButton(tree, 'Evaluate all pending')?.props?.onClick?.();
    expect(onNavigate).toHaveBeenCalledWith('batch');
  });

  it('turns the batch button into View progress while a batch is running', () => {
    const onNavigate = vi.fn();
    hooks.reset(['', null, 640]);
    hooks.beginRender();
    const tree = Home({
      root: '/w',
      data: { ...baseData, pipelineSummary: { pending: 0, processed: 3, failed: 0 } },
      onNavigate,
      onReload: vi.fn(async () => {}),
      batchRunning: true,
    } as never) as ElementNode;
    const button = findButton(tree, 'View progress');
    expect(button?.props?.disabled).toBe(false);
    button?.props?.onClick?.();
    expect(onNavigate).toHaveBeenCalledWith('batch');
  });

  it('disables the batch button when there is nothing pending', () => {
    hooks.reset(['', null, 640]);
    hooks.beginRender();
    const tree = Home({
      root: '/w',
      data: baseData,
      onNavigate: vi.fn(),
      onReload: vi.fn(async () => {}),
    } as never) as ElementNode;
    expect(findButton(tree, 'Evaluate all pending')?.props?.disabled).toBe(true);
  });

  it('surfaces failed pipeline entries needing attention', () => {
    hooks.reset(['', null, 640]);
    hooks.beginRender();
    const tree = Home({
      root: '/w',
      data: { ...baseData, pipelineSummary: { pending: 5, processed: 0, failed: 2 } },
      onNavigate: vi.fn(),
      onReload: vi.fn(async () => {}),
    } as never) as ElementNode;
    expect(textContent(tree)).toMatch(/2 need attention/);
  });

  describe('recent activity drawer', () => {
    const apps = [
      { number: 1, reportNumber: '042', company: 'Acme', role: 'Engineer', normStatus: 'applied' },
      { number: 2, reportNumber: '043', company: 'Beta', role: 'Designer', normStatus: 'evaluated' },
    ];

    it('renders nothing when no row is selected', () => {
      hooks.reset(['', null, 640]);
      hooks.beginRender();
      const tree = Home({
        root: '/w',
        data: { ...baseData, applications: apps },
        onNavigate: vi.fn(),
        onReload: vi.fn(async () => {}),
      } as never);

      const drawer = findByType(tree, Drawer);
      expect(drawer?.props?.open).toBe(false);
      const pane = findByType(tree, ReportPane);
      expect(pane?.props?.app).toBeNull();
    });

    it('opens the report drawer instead of navigating when a row is clicked', () => {
      const onNavigate = vi.fn();
      hooks.reset(['', null, 640]);
      hooks.beginRender();
      const tree = Home({
        root: '/w',
        data: { ...baseData, applications: apps },
        onNavigate,
        onReload: vi.fn(async () => {}),
      } as never);

      const rows = findAll(tree, (n) => n.props?.className === 'recent-item');
      expect(rows).toHaveLength(2);
      rows[0].props?.onClick?.();
      expect(onNavigate).not.toHaveBeenCalledWith('pipeline', expect.anything());

      // Re-render with the click's state change applied (the harness drives
      // state the same way Home.test.ts's other stateful assertions do).
      hooks.beginRender();
      const reopened = Home({
        root: '/w',
        data: { ...baseData, applications: apps },
        onNavigate,
        onReload: vi.fn(async () => {}),
      } as never);

      const drawer = findByType(reopened, Drawer);
      expect(drawer?.props?.open).toBe(true);
      const pane = findByType(reopened, ReportPane);
      expect((pane?.props?.app as { reportNumber?: string } | null)?.reportNumber).toBe('042');
    });
  });
});
