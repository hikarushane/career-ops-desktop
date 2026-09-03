import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import type { Application } from '../api';
import type { TaskRecord } from '../lib/taskStore';
import ReportPane from './ReportPane';
import StatusSelect from './StatusSelect';

// Positional useState harness (see WorkspaceSettings.test.ts / BackgroundImport.test.ts
// for the established pattern in this codebase). Slot order, in declaration order in
// ReportPane.tsx:
//   0 report (ReportResult | null)
//   1 error (string | null)
//   2 missing (boolean)
//   3 coverFormOpen (boolean)
//   4 why (string)
//   5 problem (string)
//   6 approach (string)
//   7 tone (string)
const hooks = vi.hoisted(() => {
  let state: unknown[] = [];
  let cursor = 0;
  // The reset-on-app-change effect is captured, not auto-run, so every
  // existing test keeps behaving exactly as before (the effect never fires
  // unless a test explicitly calls runLastEffect()) while a dedicated test
  // can invoke it to verify what happens when React re-runs it after a
  // dependency (the selected report) changes.
  let lastEffect: (() => void) | null = null;
  return {
    reset(initial: unknown[] = []) {
      state = initial;
      cursor = 0;
      lastEffect = null;
    },
    beginRender() {
      cursor = 0;
    },
    useState(initial: unknown) {
      const index = cursor++;
      if (index === state.length) state.push(initial);
      return [state[index], (value: unknown) => { state[index] = value; }];
    },
    useEffect(fn: () => void) {
      lastEffect = fn;
    },
    runLastEffect() {
      lastEffect?.();
    },
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: hooks.useState,
    useEffect: hooks.useEffect,
  };
});
vi.mock('react-markdown', () => ({ default: () => null }));
vi.mock('remark-gfm', () => ({ default: () => null }));
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
  revealItemInDir: vi.fn(),
}));
vi.mock('../api', () => ({
  isError: (r: unknown) => !!r && typeof r === 'object' && 'error' in (r as object),
  readReport: vi.fn(),
}));

const mockedRevealItemInDir = vi.mocked(revealItemInDir);

afterEach(() => {
  hooks.reset();
  vi.clearAllMocks();
});

type ElementNode = {
  type?: unknown;
  props?: {
    children?: unknown;
    onClick?: () => void | Promise<void>;
    onSubmit?: (e: { preventDefault: () => void }) => void;
    onChange?: (next: string) => void;
    value?: string;
    disabled?: boolean;
    title?: string;
  };
};

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object' || node === null) return '';
  return textContent((node as ElementNode).props?.children);
}

function findAll(node: unknown, predicate: (el: ElementNode) => boolean, out: ElementNode[] = []): ElementNode[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, out);
    return out;
  }
  if (typeof node !== 'object' || node === null) return out;
  const element = node as ElementNode;
  if (predicate(element)) out.push(element);
  findAll(element.props?.children, predicate, out);
  return out;
}

function findButton(node: unknown, label: string): ElementNode | undefined {
  return findAll(node, (el) => el.type === 'button' && textContent(el) === label)[0];
}

function findForm(node: unknown): ElementNode | undefined {
  return findAll(node, (el) => el.type === 'form')[0];
}

function baseApp(over: Partial<Application> = {}): Application {
  return {
    number: 42,
    date: '2026-07-01',
    company: 'Acme',
    role: 'Staff Engineer',
    status: 'Evaluated',
    normStatus: 'evaluated',
    statusPriority: 4,
    score: 4.0,
    scoreRaw: '4.0/5',
    hasPdf: false,
    pdfPath: '',
    coverLetterPath: '',
    reportPath: '',
    reportNumber: '042',
    notes: '',
    jobUrl: '',
    archetype: '',
    tldr: '',
    remote: '',
    compEstimate: '',
    ...over,
  };
}

const DEFAULT_STATE = [null, null, false, false, '', '', '', 'Formal'];

describe('ReportPane CV / cover letter actions', () => {
  it('starts the pdf task when no CV exists yet', () => {
    const onStartTask = vi.fn();
    const runningTaskFor = vi.fn(() => null);
    hooks.reset(DEFAULT_STATE);
    hooks.beginRender();
    const tree = ReportPane({ root: '/w', app: baseApp(), onStartTask, runningTaskFor, onStatusChange: vi.fn(), pending: false }) as ElementNode;

    findButton(tree, 'Generate CV')?.props?.onClick?.();

    expect(onStartTask).toHaveBeenCalledWith('pdf', { report: '042' }, 'CV · Acme');
  });

  it('opens the CV with revealItemInDir when it already exists', async () => {
    hooks.reset(DEFAULT_STATE);
    hooks.beginRender();
    const tree = ReportPane({
      root: '/w',
      app: baseApp({ pdfPath: 'output/cv-acme.pdf' }),
      onStartTask: vi.fn(),
      runningTaskFor: vi.fn(() => null),
      onStatusChange: vi.fn(),
      pending: false,
    }) as ElementNode;

    await findButton(tree, 'View CV')?.props?.onClick?.();

    expect(mockedRevealItemInDir).toHaveBeenCalledWith('/w/output/cv-acme.pdf');
  });

  it('shows a disabled "Generating CV…" button while a pdf task is running', () => {
    hooks.reset(DEFAULT_STATE);
    hooks.beginRender();
    const tree = ReportPane({
      root: '/w',
      app: baseApp(),
      onStartTask: vi.fn(),
      runningTaskFor: vi.fn((t: string) => (t === 'pdf' ? ({ taskId: 't1' } as TaskRecord) : null)),
      onStatusChange: vi.fn(),
      pending: false,
    }) as ElementNode;

    const btn = findButton(tree, 'Generating CV…');
    expect(btn).toBeDefined();
    expect(btn?.props?.disabled).toBe(true);
  });

  it('submits the cover letter form with the four answers and the report number', () => {
    const onStartTask = vi.fn();
    hooks.reset([null, null, false, true, 'Loves the mission', 'Scale the eval pipeline', 'Ship a thin slice first', 'Direct']);
    hooks.beginRender();
    const tree = ReportPane({ root: '/w', app: baseApp(), onStartTask, runningTaskFor: vi.fn(() => null), onStatusChange: vi.fn(), pending: false }) as ElementNode;

    findForm(tree)?.props?.onSubmit?.({ preventDefault: () => {} });

    expect(onStartTask).toHaveBeenCalledWith(
      'cover',
      { report: '042', why: 'Loves the mission', problem: 'Scale the eval pipeline', approach: 'Ship a thin slice first', tone: 'Direct' },
      'Cover letter · Acme',
    );
  });

  it('opens the cover letter with revealItemInDir when it already exists', async () => {
    hooks.reset(DEFAULT_STATE);
    hooks.beginRender();
    const tree = ReportPane({
      root: '/w',
      app: baseApp({ coverLetterPath: 'output/acme-cover.pdf' }),
      onStartTask: vi.fn(),
      runningTaskFor: vi.fn(() => null),
      onStatusChange: vi.fn(),
      pending: false,
    }) as ElementNode;

    await findButton(tree, 'View cover letter')?.props?.onClick?.();

    expect(mockedRevealItemInDir).toHaveBeenCalledWith('/w/output/acme-cover.pdf');
  });

  it('disables "Generate cover letter" with "No report number" when reportNumber is empty', () => {
    hooks.reset(DEFAULT_STATE);
    hooks.beginRender();
    const tree = ReportPane({
      root: '/w',
      app: baseApp({ reportNumber: '' }),
      onStartTask: vi.fn(),
      runningTaskFor: vi.fn(() => null),
      onStatusChange: vi.fn(),
      pending: false,
    }) as ElementNode;

    const btn = findButton(tree, 'Generate cover letter');
    expect(btn?.props?.disabled).toBe(true);
    expect(btn?.props?.title).toBe('No report number');
  });

  it('surfaces an onStartTask rejection when generating the CV', async () => {
    const onStartTask = vi.fn().mockRejectedValue(new Error('No AI provider available.'));
    hooks.reset(DEFAULT_STATE);
    hooks.beginRender();
    const tree = ReportPane({ root: '/w', app: baseApp(), onStartTask, runningTaskFor: vi.fn(() => null), onStatusChange: vi.fn(), pending: false }) as ElementNode;

    await findButton(tree, 'Generate CV')?.props?.onClick?.();

    hooks.beginRender();
    const updated = ReportPane({ root: '/w', app: baseApp(), onStartTask, runningTaskFor: vi.fn(() => null), onStatusChange: vi.fn(), pending: false }) as ElementNode;
    expect(textContent(updated)).toContain('No AI provider available.');
  });

  it('keeps the cover-letter form open and shows the error when onStartTask rejects', async () => {
    const onStartTask = vi.fn().mockRejectedValue(new Error('ForbiddenPath'));
    hooks.reset([null, null, false, true, 'Loves the mission', 'Scale the eval pipeline', 'Ship a thin slice first', 'Direct']);
    hooks.beginRender();
    const tree = ReportPane({ root: '/w', app: baseApp(), onStartTask, runningTaskFor: vi.fn(() => null), onStatusChange: vi.fn(), pending: false }) as ElementNode;

    await findForm(tree)?.props?.onSubmit?.({ preventDefault: () => {} });

    hooks.beginRender();
    const updated = ReportPane({ root: '/w', app: baseApp(), onStartTask, runningTaskFor: vi.fn(() => null), onStatusChange: vi.fn(), pending: false }) as ElementNode;
    expect(findForm(updated)).toBeDefined();
    expect(textContent(updated)).toContain('ForbiddenPath');
  });

  it('resets the cover-letter form when a different report is selected', () => {
    hooks.reset([null, null, false, true, 'Loves the mission', 'Scale the eval pipeline', 'Ship a thin slice first', 'Direct']);
    hooks.beginRender();
    ReportPane({ root: '/w', app: baseApp({ reportNumber: '042' }), onStartTask: vi.fn(), runningTaskFor: vi.fn(() => null), onStatusChange: vi.fn(), pending: false });

    // Select a different report -- React would re-run the effect because
    // reportNumber (a dependency) changed.
    hooks.beginRender();
    ReportPane({
      root: '/w',
      app: baseApp({ reportNumber: '043', company: 'Globex' }),
      onStartTask: vi.fn(),
      runningTaskFor: vi.fn(() => null),
      onStatusChange: vi.fn(),
      pending: false,
    });
    hooks.runLastEffect();

    hooks.beginRender();
    const updated = ReportPane({
      root: '/w',
      app: baseApp({ reportNumber: '043', company: 'Globex' }),
      onStartTask: vi.fn(),
      runningTaskFor: vi.fn(() => null),
      onStatusChange: vi.fn(),
      pending: false,
    }) as ElementNode;

    expect(findForm(updated)).toBeUndefined();
    expect(findButton(updated, 'Generate cover letter')).toBeDefined();
  });
});

describe('ReportPane status select', () => {
  function findStatusSelect(tree: unknown): ElementNode | undefined {
    return findAll(tree, (el) => el.type === StatusSelect)[0];
  }

  it('changes the status from the report header through the same write path as the board', () => {
    const onStatusChange = vi.fn();
    const app = baseApp();
    hooks.reset(DEFAULT_STATE);
    hooks.beginRender();
    const tree = ReportPane({ root: '/w', app, onStartTask: vi.fn(), runningTaskFor: vi.fn(() => null), onStatusChange, pending: false }) as ElementNode;

    const select = findStatusSelect(tree);
    expect(select?.props?.value).toBe('Evaluated');
    expect(select?.props?.disabled).toBe(false);
    select?.props?.onChange?.('Applied');

    expect(onStatusChange).toHaveBeenCalledWith(app, 'Applied');
  });

  it('disables the header status select while a write for this row is pending', () => {
    hooks.reset(DEFAULT_STATE);
    hooks.beginRender();
    const tree = ReportPane({ root: '/w', app: baseApp(), onStartTask: vi.fn(), runningTaskFor: vi.fn(() => null), onStatusChange: vi.fn(), pending: true }) as ElementNode;

    expect(findStatusSelect(tree)?.props?.disabled).toBe(true);
  });

  it('disables the header status select for a row without a report number', () => {
    hooks.reset(DEFAULT_STATE);
    hooks.beginRender();
    const tree = ReportPane({ root: '/w', app: baseApp({ reportNumber: '' }), onStartTask: vi.fn(), runningTaskFor: vi.fn(() => null), onStatusChange: vi.fn(), pending: false }) as ElementNode;

    expect(findStatusSelect(tree)?.props?.disabled).toBe(true);
  });
});
