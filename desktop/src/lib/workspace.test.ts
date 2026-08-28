import { afterEach, describe, expect, it, vi } from 'vitest';
import { load } from '@tauri-apps/plugin-store';
import { loadWorkspacePath } from './workspace';

vi.mock('@tauri-apps/plugin-store', () => ({ load: vi.fn() }));

const mockedLoad = vi.mocked(load);

afterEach(() => {
  mockedLoad.mockReset();
});

describe('workspace settings', () => {
  it('uses workspacePath when present', async () => {
    const store = {
      get: vi.fn()
        .mockResolvedValueOnce('/new')
        .mockResolvedValueOnce('/legacy'),
      set: vi.fn(),
    };
    mockedLoad.mockResolvedValue(store as never);

    await expect(loadWorkspacePath()).resolves.toBe('/new');
    expect(store.set).not.toHaveBeenCalled();
  });

  it('migrates the legacy careerOpsRoot when workspacePath is absent', async () => {
    const store = {
      get: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce('/legacy'),
      set: vi.fn(),
    };
    mockedLoad.mockResolvedValue(store as never);

    await expect(loadWorkspacePath()).resolves.toBe('/legacy');
    expect(store.set).toHaveBeenCalledWith('workspacePath', '/legacy');
  });

  it('returns null when neither key exists', async () => {
    const store = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
    };
    mockedLoad.mockResolvedValue(store as never);

    await expect(loadWorkspacePath()).resolves.toBeNull();
  });
});
