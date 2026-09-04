import { afterEach, describe, expect, it, vi } from 'vitest';
import Evaluate from './Evaluate';

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
    useCallback: <T,>(callback: T) => callback,
    useRef: (v: unknown) => ({ current: v }),
  };
});

const store = vi.hoisted(() => ({
  startTask: vi.fn(async () => 'task-9'),
  useTask: () => null,
  getTask: vi.fn(() => null as unknown),
  cancel: vi.fn(),
}));
vi.mock('../lib/taskStore', () => store);

const api = vi.hoisted(() => ({
  fetchPosting: vi.fn(),
  saveJobCapture: vi.fn(),
  languageSettings: vi.fn(),
  resolveJobLanguage: vi.fn(),
}));
vi.mock('../api', () => ({
  ...api,
  isError: (r: { ok: boolean }) => r.ok === false,
}));

afterEach(() => {
  hooks.reset();
  vi.clearAllMocks();
});

type ElementNode = {
  type?: unknown;
  props?: {
    children?: unknown;
    onClick?: () => void | Promise<void>;
    onKeyDown?: (e: unknown) => void;
    title?: string;
    onRetry?: () => void | Promise<void>;
    onCancelled?: () => void;
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

function findByType(node: unknown, type: string, skip = 0): ElementNode | undefined {
  let remaining = skip;
  function walk(n: unknown): ElementNode | undefined {
    if (Array.isArray(n)) {
      for (const child of n) {
        const found = walk(child);
        if (found) return found;
      }
      return undefined;
    }
    if (typeof n !== 'object' || n === null) return undefined;
    const element = n as ElementNode;
    if (element.type === type) {
      if (remaining === 0) return element;
      remaining -= 1;
    }
    return walk(element.props?.children);
  }
  return walk(node);
}

// State order: input, jdText, fetchState, taskId, startError, starting, languages, jobLanguage, detectedLanguage

describe('Evaluate', () => {
  it('falls back to a JD textarea when fetching is blocked and does not start a task', async () => {
    api.fetchPosting.mockResolvedValue({ ok: false, error: 'blocked', message: 'the page asks for a login' });
    hooks.reset(['https://www.linkedin.com/jobs/view/1', '', { kind: 'idle' }, null, null, false, null, '', null]);
    hooks.beginRender();
    const tree = Evaluate({ root: '/w', onDone: vi.fn() }) as ElementNode;
    await findButton(tree, 'Analyse')?.props?.onClick?.();
    expect(store.startTask).not.toHaveBeenCalled();
    expect(api.saveJobCapture).not.toHaveBeenCalled();
    hooks.beginRender();
    const after = Evaluate({ root: '/w', onDone: vi.fn() }) as ElementNode;
    expect(textContent(after)).toMatch(/Paste the job description/);
  });

  it('captures a fetched posting and starts evaluate with a local capture', async () => {
    api.fetchPosting.mockResolvedValue({ ok: true, source: 'linkedin-guest', title: 'PM', company: 'Acme', location: 'Berlin', text: 'x'.repeat(500), fetchedAt: 'now' });
    api.saveJobCapture.mockResolvedValue('jds/2026-09-02_acme_pm.md');
    hooks.reset(['https://www.linkedin.com/jobs/view/1', '', { kind: 'idle' }, null, null, false, null, '', null]);
    hooks.beginRender();
    const tree = Evaluate({ root: '/w', onDone: vi.fn() }) as ElementNode;
    await findButton(tree, 'Analyse')?.props?.onClick?.();
    expect(store.startTask).toHaveBeenCalledWith('evaluate',
      { url: 'https://www.linkedin.com/jobs/view/1', url_line: ' Posting URL: https://www.linkedin.com/jobs/view/1.', capture: 'jds/2026-09-02_acme_pm.md' },
      '/w', 'Acme', undefined);
  });

  it('treats pasted text as the JD and skips fetching', async () => {
    api.saveJobCapture.mockResolvedValue('jds/pasted_1.md');
    hooks.reset(['Senior PM at Acme. '.repeat(30), '', { kind: 'idle' }, null, null, false, null, '', null]);
    hooks.beginRender();
    const tree = Evaluate({ root: '/w', onDone: vi.fn() }) as ElementNode;
    await findButton(tree, 'Analyse')?.props?.onClick?.();
    expect(api.fetchPosting).not.toHaveBeenCalled();
    expect(store.startTask).toHaveBeenCalledWith('evaluate', expect.objectContaining({ url_line: '', capture: 'jds/pasted_1.md' }), '/w', 'Pasted job description', undefined);
  });

  it('resets a stale blocked state when the input changes to a different URL', async () => {
    api.fetchPosting.mockResolvedValue({ ok: true, source: 'html', title: 'PM', company: 'NewCo', location: 'Berlin', text: 'y'.repeat(500), fetchedAt: 'now' });
    api.saveJobCapture.mockResolvedValue('jds/2026-09-02_newco_pm.md');
    const staleJdText = 'Stale pasted paragraph that should never be sent. '.repeat(10);
    hooks.reset([
      'https://new.example.com/jobs/2',
      staleJdText,
      { kind: 'blocked', url: 'https://old.example.com/jobs/1', reason: 'the page asks for a login' },
      null, null, false, null, '', null,
    ]);
    hooks.beginRender();
    const tree = Evaluate({ root: '/w', onDone: vi.fn() }) as ElementNode;
    await findButton(tree, 'Analyse')?.props?.onClick?.();

    expect(api.fetchPosting).toHaveBeenCalledWith('https://new.example.com/jobs/2');
    for (const call of api.saveJobCapture.mock.calls) {
      expect(call[2]).not.toContain(staleJdText.trim());
    }
    expect(store.startTask).toHaveBeenCalledWith('evaluate',
      { url: 'https://new.example.com/jobs/2', url_line: ' Posting URL: https://new.example.com/jobs/2.', capture: 'jds/2026-09-02_newco_pm.md' },
      '/w', 'NewCo', undefined);
  });

  it('hands the finished report path to onDone so the Jobs board can open that card', () => {
    store.getTask.mockReturnValue({
      taskId: 'task-e', taskType: 'evaluate', label: 'Acme', startedAt: 0, state: 'done', events: [], rawLog: [],
      outcome: { ok: true, detail: 'reports/019-acme-2026-09-04.md', artifacts: ['jds/019-acme.md', 'reports/019-acme-2026-09-04.md'] },
      exitCode: 0, args: {},
    });
    hooks.reset(['', '', { kind: 'idle' }, 'task-e', null, false, null, '', null]);
    hooks.beginRender();
    const onDone = vi.fn();
    const tree = Evaluate({ root: '/w', initialTaskId: 'task-e', onDone }) as ElementNode;
    (tree.props as { doneAction?: { onClick: () => void } }).doneAction?.onClick();
    expect(onDone).toHaveBeenCalledWith('reports/019-acme-2026-09-04.md');
  });

  it('hands no report path back after a batch turn, which writes several', () => {
    store.getTask.mockReturnValue({
      taskId: 'task-b', taskType: 'batch', label: 'Batch', startedAt: 0, state: 'done', events: [], rawLog: [],
      outcome: { ok: true, detail: 'Processed 3 of 3', artifacts: ['reports/020-a.md', 'reports/021-b.md'] }, exitCode: 0, args: {},
    });
    hooks.reset(['', '', { kind: 'idle' }, 'task-b', null, false, null, '', null]);
    hooks.beginRender();
    const onDone = vi.fn();
    const tree = Evaluate({ root: '/w', initialTaskId: 'task-b', onDone }) as ElementNode;
    (tree.props as { doneAction?: { onClick: () => void } }).doneAction?.onClick();
    expect(onDone).toHaveBeenCalledWith(undefined);
  });

  it('shows a batch title and retries a failed batch by starting a new batch task', async () => {
    store.getTask.mockReturnValue({
      taskId: 'task-b', taskType: 'batch', label: 'Batch (3 pending)', startedAt: 0,
      state: 'failed', events: [], rawLog: [], outcome: null, exitCode: 1,
    });
    hooks.reset(['', '', { kind: 'idle' }, 'task-b', null, false, null, '', null]);
    hooks.beginRender();
    const onDone = vi.fn();
    const tree = Evaluate({ root: '/w', initialTaskId: 'task-b', onDone }) as ElementNode;

    expect(tree.props?.title).toBe('Processing pending jobs');
    expect(tree.props?.onCancelled).toBe(onDone);

    await tree.props?.onRetry?.();
    expect(store.startTask).toHaveBeenCalledWith('batch', { limit: '5' }, '/w', 'Batch (3 pending)');
  });

  it('retries a reopened (failed) evaluate task with its stored args, not a re-derived start', async () => {
    const storedLanguageContext = { analysisLanguage: 'en' };
    store.getTask.mockReturnValue({
      taskId: 'task-e', taskType: 'evaluate', label: 'Acme', startedAt: 0,
      state: 'failed', events: [], rawLog: [], outcome: null, exitCode: 1,
      args: { url: 'https://acme.example/job', url_line: ' Posting URL: https://acme.example/job.', capture: 'jds/x.md' },
      languageContext: storedLanguageContext,
    });
    // input/jdText/languages are all empty here — exactly the state a fresh
    // remount via App's `key={activeTaskId}` starts with when reopened from
    // the header chip, so a correct retry cannot come from re-running start().
    hooks.reset(['', '', { kind: 'idle' }, 'task-e', null, false, null, '', null]);
    hooks.beginRender();
    const tree = Evaluate({ root: '/w', initialTaskId: 'task-e', onDone: vi.fn() }) as ElementNode;

    await tree.props?.onRetry?.();

    expect(store.startTask).toHaveBeenCalledWith(
      'evaluate',
      { url: 'https://acme.example/job', url_line: ' Posting URL: https://acme.example/job.', capture: 'jds/x.md' },
      '/w', 'Acme', storedLanguageContext,
    );
  });

  it('submits on Enter for a single-line URL but not on Shift+Enter', async () => {
    api.fetchPosting.mockResolvedValue({ ok: true, source: 'linkedin-guest', title: 'PM', company: 'Acme', location: 'Berlin', text: 'x'.repeat(500), fetchedAt: 'now' });
    api.saveJobCapture.mockResolvedValue('jds/2026-09-02_acme_pm.md');
    hooks.reset(['https://www.linkedin.com/jobs/view/1', '', { kind: 'idle' }, null, null, false, null, '', null]);
    hooks.beginRender();
    const tree = Evaluate({ root: '/w', onDone: vi.fn() }) as ElementNode;
    const textarea = findByType(tree, 'textarea', 0)!;
    const onKeyDown = textarea.props?.onKeyDown as (e: unknown) => void;

    const shiftEnter = { key: 'Enter', shiftKey: true, preventDefault: vi.fn() };
    onKeyDown(shiftEnter);
    expect(shiftEnter.preventDefault).not.toHaveBeenCalled();
    expect(store.startTask).not.toHaveBeenCalled();

    const plainEnter = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() };
    onKeyDown(plainEnter);
    expect(plainEnter.preventDefault).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.startTask).toHaveBeenCalled();
  });

  it('submits on Cmd/Ctrl+Enter even for multi-line pasted text', async () => {
    api.saveJobCapture.mockResolvedValue('jds/pasted_1.md');
    hooks.reset(['Senior PM at Acme.\nMore JD text here.', '', { kind: 'idle' }, null, null, false, null, '', null]);
    hooks.beginRender();
    const tree = Evaluate({ root: '/w', onDone: vi.fn() }) as ElementNode;
    const textarea = findByType(tree, 'textarea', 0)!;
    const onKeyDown = textarea.props?.onKeyDown as (e: unknown) => void;

    const cmdEnter = { key: 'Enter', metaKey: true, shiftKey: false, preventDefault: vi.fn() };
    onKeyDown(cmdEnter);
    expect(cmdEnter.preventDefault).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.startTask).toHaveBeenCalled();
  });

  it('shows a fetching hint and label while the posting is being fetched', () => {
    hooks.reset(['https://www.linkedin.com/jobs/view/1', '', { kind: 'fetching' }, null, null, true, null, '', null]);
    hooks.beginRender();
    const tree = Evaluate({ root: '/w', onDone: vi.fn() }) as ElementNode;
    expect(textContent(tree)).toMatch(/Fetching the posting…/);
    expect(findButton(tree, 'Fetching…')).toBeDefined();
  });
});
