import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InterviewWorkflow from './InterviewWorkflow';
import { saveSessions, sessionKey, type Session } from '../lib/interviewSession';

const hooks = vi.hoisted(() => {
  let state: unknown[] = [];
  let cursor = 0;
  return {
    reset(initial: unknown[] = []) { state = initial; cursor = 0; },
    beginRender() { cursor = 0; },
    current() { return state; },
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
    useState: hooks.useState,
    useEffect: () => {},
    useCallback: <T,>(cb: T) => cb,
    useMemo: <T,>(factory: () => T) => factory(),
  };
});

const store = vi.hoisted(() => ({
  startTask: vi.fn(async () => 'task-new'),
  getTask: vi.fn(() => null as unknown),
  useTasks: vi.fn(() => [] as unknown[]),
  cancel: vi.fn(),
}));
vi.mock('../lib/taskStore', () => store);

const api = vi.hoisted(() => ({ languageSettings: vi.fn(async () => null) }));
vi.mock('../api', () => api);
vi.mock('react-markdown', () => ({ default: (props: unknown) => props }));
vi.mock('../components/AgentActivity', () => ({ default: (props: unknown) => props }));
vi.mock('../components/Drawer', () => ({ default: (props: unknown) => props }));
vi.mock('../components/FilePreview', () => ({ default: (props: unknown) => props }));

const storage: Record<string, string> = {};
beforeEach(() => {
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => storage[k] ?? null, setItem: (k: string, v: string) => { storage[k] = v; } },
    confirm: () => true,
  });
});
afterEach(() => { hooks.reset(); vi.clearAllMocks(); vi.unstubAllGlobals(); for (const k of Object.keys(storage)) delete storage[k]; });

type Node = { type?: unknown; props?: Record<string, unknown> & { children?: unknown } };

function findAll(node: unknown, pred: (n: Node) => boolean, out: Node[] = []): Node[] {
  if (Array.isArray(node)) { for (const c of node) findAll(c, pred, out); return out; }
  if (typeof node !== 'object' || node === null) return out;
  const n = node as Node;
  if (pred(n)) out.push(n);
  findAll(n.props?.children, pred, out);
  return out;
}
const text = (node: unknown) => JSON.stringify(node);

function render(props: Partial<Parameters<typeof InterviewWorkflow>[0]> = {}) {
  hooks.beginRender();
  return InterviewWorkflow({ root: '/w', mode: 'interview-plan', company: 'Acme', role: 'PM', onBack: vi.fn(), ...props }) as Node;
}

// State order: session, values, message, languages, jobLanguage, starting, startError, preview, reportWidth
describe('InterviewWorkflow', () => {
  it('lists the files a turn wrote under its reply and opens one in the drawer', () => {
    const session: Session = {
      key: sessionKey('interview-plan', 'Acme', 'PM'), mode: 'interview-plan', company: 'Acme', role: 'PM',
      turns: [{ user: 'x', taskId: 'task-1', reply: 'Plan written.', artifacts: ['interview-prep/acme-pm.md'] }],
    };
    hooks.reset([session]);
    const tree = render();
    const link = findAll(tree, (n) => n.props?.className === 'btn-link' && JSON.stringify(n.props?.children) === '"interview-prep/acme-pm.md"')[0];
    expect(link).toBeDefined();
    (link.props?.onClick as () => void)();
    expect(hooks.current()[7]).toBe('interview-prep/acme-pm.md');
  });

  it('opens on the intake form with Start disabled until the required fields are filled', () => {
    hooks.reset();
    let tree = render();
    expect(text(tree)).toMatch(/Interview date/);
    expect(findAll(tree, (n) => n.props?.type === 'submit')[0].props?.disabled).toBe(true);
    hooks.current()[1] = { date: '2026-09-10', time: '14:00' };
    tree = render();
    expect(findAll(tree, (n) => n.props?.type === 'submit')[0].props?.disabled).toBe(false);
  });

  it('starts the first turn with the intake answers as the prompt context and stores the session', async () => {
    const fresh: Session = {
      key: sessionKey('interview-plan', 'Acme', 'PM'), mode: 'interview-plan', company: 'Acme', role: 'PM', turns: [],
      files: { reportPath: 'reports/019-acme.md', reportNumber: '019' },
    };
    hooks.reset([fresh, { date: '2026-09-10', time: '14:00', round: 'Final round' }]);
    const tree = render();
    const form = findAll(tree, (n) => n.type === 'form')[0];
    await (form.props?.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({ preventDefault: () => {} });
    const [type, args, root, label] = store.startTask.mock.calls[0] as unknown as [string, Record<string, string>, string, string];
    expect([type, root, label]).toEqual(['interview-plan', '/w', 'Interview Prep Plan · Acme']);
    expect(args.company).toBe('Acme');
    expect(args.context).toMatch(/Details provided by the candidate:\n- Interview date: 2026-09-10\n- Start time: 14:00\n- Round type: Final round/);
    expect(args.context).toContain('- Evaluation report: reports/019-acme.md');
    const session = hooks.current()[0] as Session;
    expect(session.turns).toEqual([{ user: '- Interview date: 2026-09-10\n- Start time: 14:00\n- Round type: Final round', taskId: 'task-new', reply: null }]);
    expect(storage['careerops.interviewSessions./w']).toContain('task-new');
  });

  it('restores a stored conversation when reopened from a task chip without company/role', () => {
    const stored: Session = {
      key: sessionKey('interview-plan', 'Acme', 'PM'), mode: 'interview-plan', company: 'Acme', role: 'PM',
      turns: [{ user: '- Interview date: 2026-09-10', taskId: 'task-1', reply: 'Plan written. Which round?' }],
    };
    saveSessions('/w', [stored]);
    hooks.reset();
    const tree = render({ company: '', role: '', initialTaskId: 'task-1' });
    expect(text(tree)).toMatch(/Plan written\. Which round\?/);
    expect(text(tree)).toMatch(/Acme/);
    expect(text(tree)).not.toMatch(/Interview date<\/span>/);
  });

  it('sends a follow-up carrying the exchange so far, and blocks the composer while a turn runs', async () => {
    const session: Session = {
      key: sessionKey('interview-plan', 'Acme', 'PM'), mode: 'interview-plan', company: 'Acme', role: 'PM',
      turns: [{ user: '- Interview date: 2026-09-10', taskId: 'task-1', reply: 'Plan written. Which round?' }],
    };
    hooks.reset([session, {}, 'Hiring manager, 45 minutes.']);
    let tree = render();
    const composer = findAll(tree, (n) => n.props?.className === 'chat-composer')[0];
    await (composer.props?.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({ preventDefault: () => {} });
    const args = (store.startTask.mock.calls[0] as unknown as [string, Record<string, string>])[1];
    expect(args.context).toMatch(/Transcript so far:[\s\S]*Plan written\. Which round\?[\s\S]*The candidate now says:\nHiring manager, 45 minutes\./);
    expect((hooks.current()[0] as Session).turns).toHaveLength(2);

    store.useTasks.mockReturnValue([{ taskId: 'task-new', state: 'running', events: [] }]);
    tree = render();
    expect(findAll(tree, (n) => n.props?.['aria-label'] === 'Message')[0].props?.disabled).toBe(true);
  });

  it('retries the last turn with the task record args', async () => {
    const session: Session = {
      key: sessionKey('interview-plan', 'Acme', 'PM'), mode: 'interview-plan', company: 'Acme', role: 'PM',
      turns: [{ user: 'x', taskId: 'task-1', reply: null }],
    };
    store.getTask.mockReturnValue({ taskId: 'task-1', args: { company: 'Acme', role: 'PM', context: 'ctx' }, label: 'Interview Prep Plan · Acme', languageContext: { analysisLanguage: 'en' } });
    store.useTasks.mockReturnValue([{ taskId: 'task-1', state: 'failed', events: [] }]);
    hooks.reset([session]);
    const tree = render();
    const activity = findAll(tree, (n) => typeof n.props?.onRetry === 'function')[0];
    await (activity.props?.onRetry as () => Promise<void>)();
    expect(store.startTask).toHaveBeenCalledWith('interview-plan', { company: 'Acme', role: 'PM', context: 'ctx' }, '/w', 'Interview Prep Plan · Acme', { analysisLanguage: 'en' });
    expect((hooks.current()[0] as Session).turns[0].taskId).toBe('task-new');
  });
});
