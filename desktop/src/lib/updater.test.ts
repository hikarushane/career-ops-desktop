import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createUpdaterController,
  initialState,
  type UpdateState,
  type UpdateStatus,
} from './updater';

describe('updater', () => {
  const currentVersion = '0.1.0';
  let states: UpdateState[];
  let onStateChange: (state: UpdateState) => void;

  beforeEach(() => {
    states = [];
    onStateChange = (state) => states.push(state);
  });

  it('initialState returns idle with empty version', () => {
    const s = initialState();
    expect(s.status).toBe('idle');
    expect(s.currentVersion).toBe('');
  });

  it('all status values are valid UpdateStatus', () => {
    const valid: UpdateStatus[] = [
      'idle', 'checking', 'up_to_date', 'available',
      'downloading', 'installing', 'error',
    ];
    expect(valid).toHaveLength(7);
  });

  it('UpdateState with available has required fields', () => {
    const s: UpdateState = {
      status: 'available',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
      releaseNotes: 'Bug fixes',
      releaseDate: '2026-08-27',
    };
    expect(s.availableVersion).toBe('0.2.0');
    expect(s.releaseNotes).toBe('Bug fixes');
  });

  it('UpdateState error has error field', () => {
    const s: UpdateState = {
      status: 'error',
      currentVersion: '0.1.0',
      error: 'Network unreachable',
    };
    expect(s.error).toBe('Network unreachable');
  });

  it('moves from checking to up_to_date when no update exists', async () => {
    const controller = createUpdaterController({ check: vi.fn().mockResolvedValue(null), relaunch: vi.fn() });
    await controller.checkForUpdate(onStateChange, currentVersion, false);
    expect(states.map((state) => state.status)).toEqual(['checking', 'up_to_date']);
  });

  it('keeps an available update visible when the same version is polled again', async () => {
    const update = { version: '0.2.0', body: 'Fixes', date: '2026-08-27', downloadAndInstall: vi.fn() };
    const controller = createUpdaterController({ check: vi.fn().mockResolvedValue(update), relaunch: vi.fn() });
    await controller.checkForUpdate(onStateChange, currentVersion, false);
    await controller.checkForUpdate(onStateChange, currentVersion, false);
    expect(states[states.length - 1]).toMatchObject({ status: 'available', availableVersion: '0.2.0' });
  });

  it('preserves a known available update after a background failure', async () => {
    const update = { version: '0.2.0', downloadAndInstall: vi.fn() };
    const check = vi.fn().mockResolvedValueOnce(update).mockRejectedValueOnce(new Error('offline'));
    const controller = createUpdaterController({ check, relaunch: vi.fn() });
    await controller.checkForUpdate(onStateChange, currentVersion, false);
    await controller.checkForUpdate(onStateChange, currentVersion, false);
    expect(states[states.length - 1]).toMatchObject({ status: 'available', availableVersion: '0.2.0' });
  });

  it('reports a manual check failure', async () => {
    const controller = createUpdaterController({
      check: vi.fn().mockRejectedValue(new Error('offline')),
      relaunch: vi.fn(),
    });
    await controller.checkForUpdate(onStateChange, currentVersion, true);
    expect(states[states.length - 1]).toMatchObject({ status: 'error', error: 'Error: offline' });
  });

  it('deduplicates overlapping manual and background checks', async () => {
    let resolveCheck!: (value: null) => void;
    const check = vi.fn(() => new Promise<null>((resolve) => { resolveCheck = resolve; }));
    const controller = createUpdaterController({ check, relaunch: vi.fn() });
    const background = controller.checkForUpdate(onStateChange, currentVersion, false);
    const manual = controller.checkForUpdate(onStateChange, currentVersion, true);
    expect(check).toHaveBeenCalledTimes(1);
    resolveCheck(null);
    await Promise.all([background, manual]);
  });

  it('supports Later without mutating the available state', async () => {
    const update = { version: '0.2.0', downloadAndInstall: vi.fn() };
    const controller = createUpdaterController({ check: vi.fn().mockResolvedValue(update), relaunch: vi.fn() });
    await controller.checkForUpdate(onStateChange, currentVersion, false);
    const available = states[states.length - 1];
    controller.deferUpdate();
    expect(controller.getState()).toEqual(available);
  });

  it('downloads, installs, and relaunches exactly once', async () => {
    const update = { version: '0.2.0', downloadAndInstall: vi.fn().mockResolvedValue(undefined) };
    const relaunch = vi.fn().mockResolvedValue(undefined);
    const controller = createUpdaterController({ check: vi.fn().mockResolvedValue(update), relaunch });
    await controller.checkForUpdate(onStateChange, currentVersion, false);
    await controller.downloadAndInstall(onStateChange, currentVersion);
    expect(states.slice(-2).map((state) => state.status)).toEqual(['downloading', 'installing']);
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it('reports install failure and retains the available version', async () => {
    const update = {
      version: '0.2.0',
      downloadAndInstall: vi.fn().mockRejectedValue(new Error('install failed')),
    };
    const controller = createUpdaterController({ check: vi.fn().mockResolvedValue(update), relaunch: vi.fn() });
    await controller.checkForUpdate(onStateChange, currentVersion, false);
    await controller.downloadAndInstall(onStateChange, currentVersion);
    expect(states[states.length - 1]).toMatchObject({
      status: 'error',
      availableVersion: '0.2.0',
      error: 'Error: install failed',
    });
  });

  it('reports relaunch failure after installation', async () => {
    const update = { version: '0.2.0', downloadAndInstall: vi.fn().mockResolvedValue(undefined) };
    const controller = createUpdaterController({
      check: vi.fn().mockResolvedValue(update),
      relaunch: vi.fn().mockRejectedValue(new Error('relaunch failed')),
    });
    await controller.checkForUpdate(onStateChange, currentVersion, false);
    await controller.downloadAndInstall(onStateChange, currentVersion);
    expect(states[states.length - 1]).toMatchObject({ status: 'error', error: 'Error: relaunch failed' });
  });
});
