import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { open } from '@tauri-apps/plugin-dialog';
import { getDefaultWorkspacePath, initializeWorkspace, inspectWorkspace } from '../api';
import { saveWorkspacePath } from '../lib/workspace';
import { chooseWorkspace, createDefaultWorkspace } from '../config';
import WorkspaceSetup from './WorkspaceSetup';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../api', () => ({
  getDefaultWorkspacePath: vi.fn(),
  initializeWorkspace: vi.fn(),
  inspectWorkspace: vi.fn(),
}));
vi.mock('../lib/workspace', () => ({ saveWorkspacePath: vi.fn() }));

const mockedOpen = vi.mocked(open);
const mockedDefaultWorkspacePath = vi.mocked(getDefaultWorkspacePath);
const mockedInitializeWorkspace = vi.mocked(initializeWorkspace);
const mockedInspectWorkspace = vi.mocked(inspectWorkspace);
const mockedSaveWorkspacePath = vi.mocked(saveWorkspacePath);

afterEach(() => {
  vi.resetAllMocks();
});

describe('WorkspaceSetup', () => {
  it('renders the first-launch workspace actions when no workspace is saved', () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceSetup, { onReady: vi.fn() }));

    expect(markup).toContain('Create workspace');
    expect(markup).toContain('Choose another location');
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
});
