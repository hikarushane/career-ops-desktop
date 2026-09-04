import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import Scanner from './screens/Scanner';
import Evaluate from './screens/Evaluate';
import Home from './screens/Home';
import Interview from './screens/Interview';
import { initialState } from './lib/updater';

const mocks = vi.hoisted(() => ({
  doctor: vi.fn(),
  listApplications: vi.fn(),
  prepareOnboardingWorkspace: vi.fn(),
}));

const hooks = vi.hoisted(() => {
  let state: unknown[] = [];
  let cursor = 0;
  return {
    reset(initial: unknown[]) {
      state = initial;
      cursor = 0;
    },
    beginRender() {
      cursor = 0;
    },
    current() {
      return state;
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
    useCallback: <T,>(callback: T) => callback,
    useEffect: () => {},
    useState: hooks.useState,
  };
});
vi.mock('./api', () => ({
  doctor: mocks.doctor,
  isError: (value: { ok: boolean }) => !value.ok,
  listApplications: mocks.listApplications,
  prepareOnboardingWorkspace: mocks.prepareOnboardingWorkspace,
}));
const taskStore = vi.hoisted(() => ({
  running: [] as { taskId: string; taskType: string; args: Record<string, string> }[],
  startTask: vi.fn(),
}));
vi.mock('./lib/taskStore', () => ({
  useTasks: () => [],
  useRunningTasks: () => taskStore.running,
  initTaskStore: vi.fn(),
  dismiss: vi.fn(),
  startTask: taskStore.startTask,
}));

afterEach(() => {
  hooks.reset([]);
  taskStore.running = [];
  vi.resetAllMocks();
});

type ElementNode = {
  type?: unknown;
  props?: { onComplete?: () => void | Promise<void> };
};

const data = {
  applications: [],
  metrics: { Total: 0, ByStatus: {}, AvgScore: 0, TopScore: 0, WithPDF: 0, Actionable: 0 },
  progress: {
    FunnelStages: [], ScoreBuckets: [], WeeklyActivity: [], ResponseRate: 0, InterviewRate: 0,
    OfferRate: 0, AvgScore: 0, TopScore: 0, TotalOffers: 0, ActiveApps: 0,
  },
  pipelineSummary: { pending: 0, processed: 0, failed: 0 },
  inbox: [],
};

// Walks an unrendered element tree looking for the first element of `type`.
function findByType(node: unknown, type: unknown): ElementNode | null {
  if (!node || typeof node !== 'object') return null;
  const el = node as ElementNode & { props?: { children?: unknown } };
  if (el.type === type) return el;
  const children = el.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findByType(child, type);
    if (found) return found;
  }
  return null;
}

function render(probe: { missing: string[]; ready: boolean }, onboarded = probe.missing.length === 0) {
  hooks.reset([
    '/workspace', true, { ok: true, careerOpsPath: '/workspace', trackerPath: null, ...probe },
    null, null, null, 'home', onboarded, undefined, undefined,
    'interview-plan', '', '', null,
  ]);
  hooks.beginRender();
  return App() as ElementNode;
}

describe('workspace onboarding routing', () => {
  it('does not show onboarding for an existing workspace with prerequisites', () => {
    const tree = render({ missing: [], ready: true });

    expect((tree.type as { name?: string })?.name).not.toBe('Onboarding');
  });

  it('shows onboarding when an existing tracker lacks a profile prerequisite', () => {
    const tree = render({ missing: ['config/profile.yml'], ready: true }, false);

    expect((tree.type as { name?: string })?.name).toBe('Onboarding');
  });

  it('refreshes from the Ready callback before entering the app', async () => {
    mocks.prepareOnboardingWorkspace.mockResolvedValue(undefined);
    mocks.doctor.mockResolvedValue({
      ok: true,
      careerOpsPath: '/workspace',
      trackerPath: '/workspace/data/applications.md',
      missing: [],
      ready: true,
    });
    mocks.listApplications.mockResolvedValue({ ok: true, ...data });
    const initial = render({ missing: ['cv.md', 'config/profile.yml'], ready: true }, false);

    expect((initial.type as { name?: string })?.name).toBe('Onboarding');
    await initial.props?.onComplete?.();

    expect(mocks.prepareOnboardingWorkspace).toHaveBeenCalledWith('/workspace');
    expect(mocks.doctor).toHaveBeenCalledWith('/workspace');

    const completed = (() => {
      hooks.beginRender();
      return App() as ElementNode;
    })();
    expect(completed.type).toBe('div');
  });

  it('does not enter the shell or reload when the fresh doctor call fails', async () => {
    mocks.prepareOnboardingWorkspace.mockResolvedValue(undefined);
    mocks.doctor.mockResolvedValue({
      ok: false,
      error: 'doctor-failed',
      message: 'Fresh workspace validation failed.',
    });
    const initial = render({ missing: ['cv.md'], ready: true }, false);

    await initial.props?.onComplete?.();

    expect(mocks.listApplications).not.toHaveBeenCalled();
    hooks.beginRender();
    expect((App() as ElementNode).type).toBe('main');
  });
});

describe('evaluate done routing', () => {
  it('opens the Jobs board with the freshly written report selected', async () => {
    const row = { number: 19, reportNumber: '019', reportPath: 'reports/019-acme-2026-09-04.md', company: 'Acme', role: 'PM' };
    mocks.listApplications.mockResolvedValue({ ok: true, ...data, applications: [row] });
    hooks.reset([
      '/workspace', true, { ok: true, careerOpsPath: '/workspace', trackerPath: null, missing: [], ready: true },
      null, null, data, 'evaluate', true, undefined, undefined,
      'interview-plan', '', '', 'task-e', initialState, false, 'inbox',
    ]);
    hooks.beginRender();
    const tree = App() as ElementNode;
    const evaluate = findByType(tree, Evaluate) as { props: { onDone: (reportPath?: string) => Promise<void> } } | null;
    expect(evaluate).not.toBeNull();
    await evaluate!.props.onDone('reports/019-acme-2026-09-04.md');
    const state = hooks.current();
    expect(state[6]).toBe('pipeline');
    expect(state[9]).toBe('019');
    expect(state[state.length - 1]).toBeUndefined();
  });

  it('opens the Jobs board with nothing selected when no report path comes back', async () => {
    mocks.listApplications.mockResolvedValue({ ok: true, ...data });
    hooks.reset([
      '/workspace', true, { ok: true, careerOpsPath: '/workspace', trackerPath: null, missing: [], ready: true },
      null, null, data, 'evaluate', true, undefined, '007',
      'interview-plan', '', '', 'task-b', initialState, false, undefined,
    ]);
    hooks.beginRender();
    const tree = App() as ElementNode;
    const evaluate = findByType(tree, Evaluate) as { props: { onDone: (reportPath?: string) => Promise<void> } } | null;
    await evaluate!.props.onDone(undefined);
    const state = hooks.current();
    expect(state[6]).toBe('pipeline');
    expect(state[9]).toBeUndefined();
  });
});

// State slots: 0 root, 1 rootLoaded, 2 probe, 3 error, 4 workspaceError, 5 data,
// 6 screen, 7 onboarded, 8 evalUrl, 9 pipelineSelected, 10 iwMode, 11 iwCompany,
// 12 iwRole, 13 activeTaskId, 14 updateState, 15 showUpdateModal, 16 pipelineFilter
function renderAt(screen: string) {
  hooks.reset([
    '/workspace', true, { ok: true, careerOpsPath: '/workspace', trackerPath: null, missing: [], ready: true },
    null, null, { ...data, pipelineSummary: { pending: 3, processed: 0, failed: 0 } }, screen, true, undefined, undefined,
    'interview-plan', '', '', null, initialState, false, undefined,
  ]);
  hooks.beginRender();
  return App() as ElementNode;
}

describe('coming back to a running task', () => {
  it('reopens the running scan when Find matching jobs is visited again', () => {
    taskStore.running = [{ taskId: 'task-s', taskType: 'scan', args: {} }];
    const home = findByType(renderAt('home'), Home) as { props: { onNavigate: (s: string) => void } } | null;
    home!.props.onNavigate('scanner');
    const state = hooks.current();
    expect(state[6]).toBe('scanner');
    expect(state[13]).toBe('task-s');
  });

  it('reopens the running batch instead of starting another one', () => {
    taskStore.running = [{ taskId: 'task-b', taskType: 'batch', args: { limit: '3' } }];
    const home = findByType(renderAt('home'), Home) as { props: { onNavigate: (s: string) => void; batchRunning?: boolean } } | null;
    expect(home!.props.batchRunning).toBe(true);
    home!.props.onNavigate('batch');
    const state = hooks.current();
    expect(state[6]).toBe('evaluate');
    expect(state[13]).toBe('task-b');
    expect(taskStore.startTask).not.toHaveBeenCalled();
  });

  it('shows the running scan or batch when Home is pressed, and Back reaches the plain Home', () => {
    taskStore.running = [{ taskId: 'task-s', taskType: 'scan', args: {} }];
    expect(findByType(renderAt('pipeline'), Home)).toBeNull();
    const nav = findByType(renderAt('pipeline'), 'nav') as unknown as { props: { children: { props: { onClick: () => void } }[] } } | null;
    nav!.props.children[0].props.onClick();
    let state = hooks.current();
    expect(state[6]).toBe('scanner');
    expect(state[13]).toBe('task-s');
    hooks.beginRender();
    const scanner = findByType(App() as ElementNode, Scanner) as unknown as { props: { onBack: () => void } } | null;
    scanner!.props.onBack();
    expect(hooks.current()[6]).toBe('home');

    taskStore.running = [{ taskId: 'task-b', taskType: 'batch', args: {} }];
    const homeScreen = findByType(renderAt('home'), Home) as unknown as { props: { onNavigate: (s: string) => void } } | null;
    homeScreen!.props.onNavigate('home');
    state = hooks.current();
    expect(state[6]).toBe('evaluate');
    expect(state[13]).toBe('task-b');
  });

  it('titles the header after the parent of a sub-screen', () => {
    const tree = renderAt('scanner') as ElementNode & { props?: { children?: unknown } };
    const header = findByType(tree, 'header') ?? (tree.props?.children as ElementNode[])?.[0];
    expect(JSON.stringify(header)).toContain('"title":"Home"');
  });

  it('reopens the running prep for the same company from the Interview screen', () => {
    taskStore.running = [{ taskId: 'task-i', taskType: 'interview-plan', args: { company: 'Acme', role: 'PM' } }];
    const interview = findByType(renderAt('interview'), Interview) as { props: { onAction: (a: string, app: { company: string; role: string }) => void } } | null;
    interview!.props.onAction('interview-plan', { company: 'Acme', role: 'PM' });
    expect(hooks.current()[13]).toBe('task-i');
    interview!.props.onAction('interview-plan', { company: 'Other', role: 'PM' });
    expect(hooks.current()[13]).toBeNull();
  });
});

describe('scanner done routing', () => {
  it('opens the Jobs board on its INBOX tab, where scan results land', () => {
    mocks.listApplications.mockResolvedValue({ ok: true, ...data });
    hooks.reset([
      '/workspace', true, { ok: true, careerOpsPath: '/workspace', trackerPath: null, missing: [], ready: true },
      null, null, data, 'scanner', true, undefined, undefined,
      'interview-plan', '', '', null, initialState, false, undefined,
    ]);
    hooks.beginRender();
    const tree = App() as ElementNode;
    const scanner = findByType(tree, Scanner) as { props: { onDone: () => void } } | null;
    expect(scanner).not.toBeNull();
    scanner!.props.onDone();
    const state = hooks.current();
    expect(state[6]).toBe('pipeline');
    expect(state[state.length - 1]).toBe('inbox');
  });
});
