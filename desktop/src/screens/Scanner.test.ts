import { afterEach, describe, expect, it, vi } from 'vitest';
import Scanner from './Scanner';

const hooks = vi.hoisted(() => {
  let state: unknown[] = [];
  let cursor = 0;
  return {
    reset(initial: unknown[] = []) { state = initial; cursor = 0; },
    beginRender() { cursor = 0; },
    useState(initial: unknown) {
      const index = cursor++;
      if (index === state.length) state.push(initial);
      return [state[index], (value: unknown) => { state[index] = value; }];
    },
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: hooks.useState, useCallback: <T,>(cb: T) => cb };
});

const store = vi.hoisted(() => ({
  startTask: vi.fn(async () => 'task-new'),
  getTask: vi.fn(() => null as unknown),
  useRunningTasks: vi.fn(() => [] as { taskType: string }[]),
}));
vi.mock('../lib/taskStore', () => store);
vi.mock('./TaskScreen', () => ({ default: (props: unknown) => props }));

afterEach(() => { hooks.reset(); vi.clearAllMocks(); });

type Element = { props: { taskId?: string | null; onRetry?: () => Promise<void>; children?: unknown } };

// State order: taskId, starting, startError
describe('Scanner', () => {
  it('initializes taskId from initialTaskId so a reopened scan shows its activity', () => {
    hooks.reset(['task-1', false, null]);
    hooks.beginRender();
    const tree = Scanner({ root: '/w', initialTaskId: 'task-1', onDone: vi.fn() }) as unknown as Element;
    expect(tree.props.taskId).toBe('task-1');
  });

  it('retries with the task record args instead of re-deriving from local state', async () => {
    store.getTask.mockReturnValue({
      taskId: 'task-1', taskType: 'scan', label: 'Scan', args: {}, languageContext: undefined,
    });
    hooks.reset(['task-1', false, null]);
    hooks.beginRender();
    const tree = Scanner({ root: '/w', initialTaskId: 'task-1', onDone: vi.fn() }) as unknown as Element;
    await tree.props.onRetry?.();
    expect(store.startTask).toHaveBeenCalledWith('scan', {}, '/w', 'Scan', undefined);
  });

  it('disables Start scanning while another scan task is already running', () => {
    store.useRunningTasks.mockReturnValue([{ taskType: 'scan' }]);
    hooks.reset([null, false, null]);
    hooks.beginRender();
    const tree = Scanner({ root: '/w', onDone: vi.fn() }) as unknown as Element;
    const text = JSON.stringify(tree.props.children);
    expect(text).toMatch(/A scan is already running/);
  });
});
