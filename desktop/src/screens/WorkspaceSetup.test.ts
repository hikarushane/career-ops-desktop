import { afterEach, describe, expect, it, vi } from 'vitest';
import { open } from '@tauri-apps/plugin-dialog';
import { doctor, getDefaultWorkspacePath, initializeWorkspace, inspectWorkspace, listApplications } from '../api';
import { loadWorkspacePath, saveWorkspacePath } from '../lib/workspace';
import * as workspaceConfig from '../config';
import { chooseWorkspace, createDefaultWorkspace, loadActiveRoot, pickWorkspace } from '../config';
import App from '../App';
import Header from '../components/Header';
import ProfileSettings from './ProfileSettings';
import WorkspaceSetup from './WorkspaceSetup';

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
    useCallback: <T,>(callback: T) => callback,
    useEffect: () => {},
    useState: hooks.useState,
  };
});
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../api', () => ({
  doctor: vi.fn(),
  getDefaultWorkspacePath: vi.fn(),
  initializeWorkspace: vi.fn(),
  inspectWorkspace: vi.fn(),
  isError: (result: { ok: boolean }) => result.ok === false,
  listApplications: vi.fn(),
}));
vi.mock('../lib/workspace', () => ({ loadWorkspacePath: vi.fn(), saveWorkspacePath: vi.fn() }));
vi.mock('../lib/taskStore', () => ({
  useTasks: () => [],
  initTaskStore: vi.fn(),
  dismiss: vi.fn(),
}));

const mockedOpen = vi.mocked(open);
const mockedDoctor = vi.mocked(doctor);
const mockedDefaultWorkspacePath = vi.mocked(getDefaultWorkspacePath);
const mockedInitializeWorkspace = vi.mocked(initializeWorkspace);
const mockedInspectWorkspace = vi.mocked(inspectWorkspace);
const mockedListApplications = vi.mocked(listApplications);
const mockedLoadWorkspacePath = vi.mocked(loadWorkspacePath);
const mockedSaveWorkspacePath = vi.mocked(saveWorkspacePath);

afterEach(() => {
  vi.resetAllMocks();
  hooks.reset();
});

type ElementNode = {
  type?: unknown;
  props?: {
    children?: unknown;
    disabled?: boolean;
    onClick?: () => void | Promise<void>;
    onChangeFolder?: () => void | Promise<void>;
    onWorkspaceChanged?: (path: string) => Promise<void>;
    role?: string;
  };
};

function renderComponent(component: () => ElementNode) {
  hooks.beginRender();
  return component();
}

function findElement(node: unknown, predicate: (element: ElementNode) => boolean): ElementNode | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== 'object' || node === null) return undefined;

  const element = node as ElementNode;
  if (predicate(element)) return element;
  return findElement(element.props?.children, predicate);
}

function button(tree: ElementNode, label: string) {
  const target = findElement(
    tree,
    (element) => element.type === 'button' && element.props?.children === label,
  );
  if (!target) throw new Error(`Could not find ${label} button`);
  return target;
}

describe('WorkspaceSetup', () => {
  it('renders the first-launch workspace actions when no workspace is saved', () => {
    const tree = renderComponent(() => WorkspaceSetup({ onReady: vi.fn() }));

    expect(button(tree, 'Create workspace')).toBeDefined();
    expect(button(tree, 'Choose another location')).toBeDefined();
  });

  it('inspects a persisted workspace before allowing App to use it', async () => {
    mockedLoadWorkspacePath.mockResolvedValue('/Users/Alice/CareerOps');
    mockedInspectWorkspace.mockResolvedValue({
      path: '/Users/Alice/CareerOps',
      kind: 'careerops',
    });

    await expect(loadActiveRoot()).resolves.toBe('/Users/Alice/CareerOps');
    expect(mockedInspectWorkspace).toHaveBeenCalledWith('/Users/Alice/CareerOps');
    expect(mockedDoctor).not.toHaveBeenCalled();
  });

  it.each(['missing', 'empty', 'nonempty-invalid'] as const)(
    'routes a persisted %s path back to recoverable workspace setup',
    async (kind) => {
      mockedLoadWorkspacePath.mockResolvedValue('/Users/Alice/OldCareerOps');
      mockedInspectWorkspace.mockResolvedValue({ path: '/Users/Alice/OldCareerOps', kind });

      await expect(loadActiveRoot()).resolves.toBeNull();
      expect(mockedDoctor).not.toHaveBeenCalled();
    },
  );

  it('creates the default workspace and awaits activation', async () => {
    let finishActivation: () => void;
    const activation = new Promise<void>((resolve) => { finishActivation = resolve; });
    const onReady = vi.fn().mockReturnValue(activation);
    vi.spyOn(workspaceConfig, 'createDefaultWorkspace').mockResolvedValue('/Users/Alice/Documents/CareerOps');
    const tree = renderComponent(() => WorkspaceSetup({ onReady }));

    const creating = button(tree, 'Create workspace').props?.onClick?.();
    await Promise.resolve();

    expect(onReady).toHaveBeenCalledWith('/Users/Alice/Documents/CareerOps');
    expect(button(renderComponent(() => WorkspaceSetup({ onReady })), 'Create workspace').props?.disabled).toBe(true);
    finishActivation!();
    await creating;
    expect(button(renderComponent(() => WorkspaceSetup({ onReady })), 'Create workspace').props?.disabled).toBe(false);
  });

  it('renders a chooser validation error and does not activate', async () => {
    const onReady = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(workspaceConfig, 'chooseWorkspace').mockRejectedValue(new Error(
      'This folder already contains files and is not a CareerOps workspace. Choose an empty folder or an existing CareerOps workspace.',
    ));
    const initial = renderComponent(() => WorkspaceSetup({ onReady }));

    await button(initial, 'Choose another location').props?.onClick?.();
    const updated = renderComponent(() => WorkspaceSetup({ onReady }));
    const alert = findElement(updated, (element) => element.props?.role === 'alert');

    expect(alert?.props?.children).toBe(
      'This folder already contains files and is not a CareerOps workspace. Choose an empty folder or an existing CareerOps workspace.',
    );
    expect(onReady).not.toHaveBeenCalled();
  });

  it('creates, saves, and returns the default workspace', async () => {
    mockedDefaultWorkspacePath.mockResolvedValue('/Users/Alice/Documents/CareerOps');
    mockedInitializeWorkspace.mockResolvedValue({
      path: '/Users/Alice/Documents/CareerOps',
      created: true,
    });

    await expect(createDefaultWorkspace()).resolves.toBe('/Users/Alice/Documents/CareerOps');
    expect(mockedInitializeWorkspace).toHaveBeenCalledWith('/Users/Alice/Documents/CareerOps');
    expect(mockedSaveWorkspacePath).toHaveBeenCalledWith('/Users/Alice/Documents/CareerOps');
  });

  it('activates an existing CareerOps workspace selected from the chooser', async () => {
    mockedOpen.mockResolvedValue('/Users/Alice/CareerOps');
    mockedInspectWorkspace.mockResolvedValue({ path: '/Users/Alice/CareerOps', kind: 'careerops' });

    await expect(chooseWorkspace()).resolves.toBe('/Users/Alice/CareerOps');
    expect(mockedOpen).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: 'Choose CareerOps workspace location',
    });
    expect(mockedInitializeWorkspace).not.toHaveBeenCalled();
    expect(mockedSaveWorkspacePath).toHaveBeenCalledWith('/Users/Alice/CareerOps');
  });

  it('returns a validated workspace from the shared picker without saving it', async () => {
    mockedOpen.mockResolvedValue('/Users/Alice/CareerOps');
    mockedInspectWorkspace.mockResolvedValue({ path: '/Users/Alice/CareerOps', kind: 'careerops' });

    await expect(pickWorkspace()).resolves.toBe('/Users/Alice/CareerOps');

    expect(mockedSaveWorkspacePath).not.toHaveBeenCalled();
  });

  it.each(['empty', 'missing'] as const)(
    'initializes and activates a selected %s directory',
    async (kind) => {
      mockedOpen.mockResolvedValue('/Users/Alice/Workspace');
      mockedInspectWorkspace.mockResolvedValue({ path: '/Users/Alice/Workspace', kind });
      mockedInitializeWorkspace.mockResolvedValue({ path: '/Users/Alice/Workspace', created: true });

      await expect(chooseWorkspace()).resolves.toBe('/Users/Alice/Workspace');
      expect(mockedInitializeWorkspace).toHaveBeenCalledWith('/Users/Alice/Workspace');
      expect(mockedSaveWorkspacePath).toHaveBeenCalledWith('/Users/Alice/Workspace');
    },
  );

  it('rejects a nonempty invalid directory without saving it', async () => {
    mockedOpen.mockResolvedValue('/Users/Alice/NotCareerOps');
    mockedInspectWorkspace.mockResolvedValue({ path: '/Users/Alice/NotCareerOps', kind: 'nonempty-invalid' });

    await expect(chooseWorkspace()).rejects.toThrow(
      'This folder already contains files and is not a CareerOps workspace. Choose an empty folder or an existing CareerOps workspace.',
    );
    expect(mockedSaveWorkspacePath).not.toHaveBeenCalled();
  });

  it('keeps the active app visible when its workspace chooser rejects', async () => {
    vi.spyOn(workspaceConfig, 'pickWorkspace').mockRejectedValue(new Error(
      'This folder already contains files and is not a CareerOps workspace. Choose an empty folder or an existing CareerOps workspace.',
    ));
    hooks.reset([
      '/Users/Alice/CareerOps',
      true,
      { ok: true, careerOpsPath: '/Users/Alice/CareerOps', trackerPath: null, missing: [], ready: true },
      null,
      null,
      { applications: [], metrics: {}, progress: {} },
      'home', true, undefined, undefined, 'interview-plan', '', '', {}, false,
    ]);
    const initial = renderComponent(() => App());
    const header = findElement(initial, (element) => element.type === Header);

    await header?.props?.onChangeFolder?.();
    const updated = renderComponent(() => App());

    expect(findElement(updated, (element) => element.type === Header)).toBeDefined();
    const alert = findElement(updated, (element) => element.props?.role === 'alert');
    expect(findElement(alert, (element) => element.type === 'p')?.props?.children).toBe(
      'This folder already contains files and is not a CareerOps workspace. Choose an empty folder or an existing CareerOps workspace.',
    );
  });

  it('persists a settings workspace only when App receives the selected path', async () => {
    const nextPath = '/new/path';
    mockedDoctor.mockResolvedValue({
      ok: true,
      careerOpsPath: nextPath,
      trackerPath: null,
      missing: [],
      ready: true,
    });
    mockedListApplications.mockResolvedValue({
      ok: true,
      applications: [],
      metrics: { Total: 0, ByStatus: {}, AvgScore: 0, TopScore: 0, WithPDF: 0, Actionable: 0 },
      progress: {
        FunnelStages: [], ScoreBuckets: [], WeeklyActivity: [], ResponseRate: 0, InterviewRate: 0,
        OfferRate: 0, AvgScore: 0, TopScore: 0, TotalOffers: 0, ActiveApps: 0,
      },
    });
    hooks.reset([
      '/current/path',
      true,
      { ok: true, careerOpsPath: '/current/path', trackerPath: null, missing: [], ready: true },
      null,
      null,
      { applications: [], metrics: {}, progress: {} },
      'profile', true, undefined, undefined, 'interview-plan', '', '', {}, false,
    ]);
    const tree = renderComponent(() => App());
    const settings = findElement(tree, (element) => element.type === ProfileSettings);

    expect(mockedSaveWorkspacePath).not.toHaveBeenCalled();
    await settings?.props?.onWorkspaceChanged?.(nextPath);

    expect(mockedSaveWorkspacePath).toHaveBeenCalledTimes(1);
    expect(mockedSaveWorkspacePath).toHaveBeenCalledWith(nextPath);
    expect(mockedDoctor).toHaveBeenCalledWith(nextPath);
    expect(mockedListApplications).toHaveBeenCalledWith(nextPath);
  });
});
