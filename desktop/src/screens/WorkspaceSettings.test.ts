import { afterEach, describe, expect, it, vi } from 'vitest';
import { open } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { initializeWorkspace, inspectWorkspace } from '../api';
import { saveWorkspacePath } from '../lib/workspace';
import WorkspaceSettings from './WorkspaceSettings';

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
  return { ...actual, useState: hooks.useState };
});
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openPath: vi.fn() }));
vi.mock('../api', () => ({ initializeWorkspace: vi.fn(), inspectWorkspace: vi.fn() }));
vi.mock('../lib/workspace', () => ({
  openWorkspaceFolder: (path: string) => openPath(path),
  saveWorkspacePath: vi.fn(),
}));

const mockedOpen = vi.mocked(open);
const mockedOpenPath = vi.mocked(openPath);
const mockedInitializeWorkspace = vi.mocked(initializeWorkspace);
const mockedInspectWorkspace = vi.mocked(inspectWorkspace);
const mockedSaveWorkspacePath = vi.mocked(saveWorkspacePath);

afterEach(() => {
  vi.resetAllMocks();
  hooks.reset();
});

type ElementNode = {
  type?: unknown;
  props?: {
    children?: unknown;
    onClick?: () => void | Promise<void>;
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

describe('WorkspaceSettings', () => {
  const currentPath = '/current/path';

  it('renders the current workspace and management actions', () => {
    const tree = renderComponent(() => WorkspaceSettings({ path: currentPath, onWorkspaceChanged: vi.fn() }));

    expect(findElement(tree, (element) => element.type === 'h2')?.props?.children).toBe('Workspace');
    expect(findElement(tree, (element) => element.type === 'code')?.props?.children).toBe(currentPath);
    expect(button(tree, 'Open Folder')).toBeDefined();
    expect(button(tree, 'Change Location')).toBeDefined();
  });

  it('opens the current workspace folder with the Tauri opener', async () => {
    const tree = renderComponent(() => WorkspaceSettings({ path: currentPath, onWorkspaceChanged: vi.fn() }));

    await button(tree, 'Open Folder').props?.onClick?.();

    expect(mockedOpenPath).toHaveBeenCalledWith(currentPath);
  });

  it('surfaces an opener scope failure instead of an unhandled rejection', async () => {
    mockedOpenPath.mockRejectedValue(new Error('ForbiddenPath'));
    const initial = renderComponent(() => WorkspaceSettings({ path: currentPath, onWorkspaceChanged: vi.fn() }));

    await button(initial, 'Open Folder').props?.onClick?.();
    const updated = renderComponent(() => WorkspaceSettings({ path: currentPath, onWorkspaceChanged: vi.fn() }));

    expect(findElement(updated, (element) => element.props?.role === 'alert')?.props?.children).toBe('ForbiddenPath');
  });

  it('activates a selected existing CareerOps workspace', async () => {
    const onWorkspaceChanged = vi.fn().mockResolvedValue(undefined);
    mockedOpen.mockResolvedValue('/existing/path');
    mockedInspectWorkspace.mockResolvedValue({ path: '/existing/path', kind: 'careerops' });
    const tree = renderComponent(() => WorkspaceSettings({ path: currentPath, onWorkspaceChanged }));

    await button(tree, 'Change Location').props?.onClick?.();

    expect(onWorkspaceChanged).toHaveBeenCalledWith('/existing/path');
    expect(mockedInitializeWorkspace).not.toHaveBeenCalled();
  });

  it('initializes and activates a selected empty directory', async () => {
    const onWorkspaceChanged = vi.fn().mockResolvedValue(undefined);
    mockedOpen.mockResolvedValue('/empty/path');
    mockedInspectWorkspace.mockResolvedValue({ path: '/empty/path', kind: 'empty' });
    mockedInitializeWorkspace.mockResolvedValue({ path: '/empty/path', created: true });
    const tree = renderComponent(() => WorkspaceSettings({ path: currentPath, onWorkspaceChanged }));

    await button(tree, 'Change Location').props?.onClick?.();

    expect(mockedInitializeWorkspace).toHaveBeenCalledWith('/empty/path');
    expect(onWorkspaceChanged).toHaveBeenCalledWith('/empty/path');
  });

  it('shows an invalid-directory error without changing the workspace', async () => {
    const onWorkspaceChanged = vi.fn().mockResolvedValue(undefined);
    mockedOpen.mockResolvedValue('/invalid/path');
    mockedInspectWorkspace.mockResolvedValue({ path: '/invalid/path', kind: 'nonempty-invalid' });
    const initial = renderComponent(() => WorkspaceSettings({ path: currentPath, onWorkspaceChanged }));

    await button(initial, 'Change Location').props?.onClick?.();
    const updated = renderComponent(() => WorkspaceSettings({ path: currentPath, onWorkspaceChanged }));

    expect(findElement(updated, (element) => element.props?.role === 'alert')?.props?.children).toBe(
      'This folder already contains files and is not a CareerOps workspace. Choose an empty folder or an existing CareerOps workspace.',
    );
    expect(onWorkspaceChanged).not.toHaveBeenCalled();
  });

  it('does not move, delete, or initialize the current workspace during a location change', async () => {
    const onWorkspaceChanged = vi.fn().mockResolvedValue(undefined);
    mockedOpen.mockResolvedValue('/new/path');
    mockedInspectWorkspace.mockResolvedValue({ path: '/new/path', kind: 'empty' });
    mockedInitializeWorkspace.mockResolvedValue({ path: '/new/path', created: true });
    const tree = renderComponent(() => WorkspaceSettings({ path: currentPath, onWorkspaceChanged }));

    await button(tree, 'Change Location').props?.onClick?.();

    expect(mockedInitializeWorkspace).not.toHaveBeenCalledWith(currentPath);
    expect(mockedSaveWorkspacePath).not.toHaveBeenCalled();
    expect(onWorkspaceChanged).toHaveBeenCalledWith('/new/path');
  });

  it('does not persist a selection when App activation fails', async () => {
    const onWorkspaceChanged = vi.fn().mockRejectedValue(new Error('Activation failed'));
    mockedOpen.mockResolvedValue('/new/path');
    mockedInspectWorkspace.mockResolvedValue({ path: '/new/path', kind: 'careerops' });
    const initial = renderComponent(() => WorkspaceSettings({ path: currentPath, onWorkspaceChanged }));

    await button(initial, 'Change Location').props?.onClick?.();
    const updated = renderComponent(() => WorkspaceSettings({ path: currentPath, onWorkspaceChanged }));

    expect(mockedSaveWorkspacePath).not.toHaveBeenCalled();
    expect(findElement(updated, (element) => element.props?.role === 'alert')?.props?.children).toBe('Activation failed');
  });
});
