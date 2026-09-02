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
    expect(store.startTask).toHaveBeenCalledWith('batch', {}, '/w', 'Batch (3 pending)');
  });
});
