import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskSnapshot } from '../api';

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (e: { payload: unknown }) => void>();
  return {
    listeners,
    listen: vi.fn(async (name: string, cb: (e: { payload: unknown }) => void) => { listeners.set(name, cb); return () => {}; }),
    invokeRunTask: vi.fn(async () => ({ task_id: 'task-1' })),
    invokeCancelTask: vi.fn(async () => {}),
    listTasks: vi.fn(async (): Promise<TaskSnapshot[]> => []),
    getPreferredProvider: vi.fn(async () => ({ id: 'claude', state: 'ready' })),
    getModel: vi.fn(async () => ''), getEffort: vi.fn(async () => 'medium'), getFastMode: vi.fn(async () => false),
  };
});
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), runTask: mocks.invokeRunTask, cancelTask: mocks.invokeCancelTask, listTasks: mocks.listTasks }));
vi.mock('./providers', () => ({ getPreferredProvider: mocks.getPreferredProvider, getModel: mocks.getModel, getEffort: mocks.getEffort, getFastMode: mocks.getFastMode }));

import { getTask, getTasks, initTaskStore, startTask, dismiss, __resetForTests } from './taskStore';

const emit = (name: string, payload: unknown) => mocks.listeners.get(name)?.({ payload });

beforeEach(async () => { __resetForTests(); mocks.listeners.clear(); await initTaskStore(); });

describe('taskStore', () => {
  it('routes events to the task they belong to and marks completion from outcome', async () => {
    const id = await startTask('evaluate', { url: 'https://x' }, '/w', 'Acme');
    emit('task-event', { task_id: id, kind: 'tool', summary: 'Write', tool: 'Write', target: '/w/reports/042.md', is_error: null });
    emit('task-event', { task_id: 'task-other', kind: 'text', summary: 'nope', tool: null, target: null, is_error: null });
    emit('task-output', { task_id: id, stream: 'stdout', data: '{"raw":1}' });
    emit('task-finished', { task_id: id, exit_code: 0, success: false, outcome: { ok: false, detail: 'The AI finished without producing a report.', artifacts: [] } });
    const task = getTask(id)!;
    expect(task.events).toHaveLength(1);
    expect(task.rawLog).toEqual(['{"raw":1}']);
    expect(task.state).toBe('failed');
    expect(task.outcome?.detail).toMatch(/without producing a report/);
  });

  it('caps events at 500 and dismisses finished tasks', async () => {
    const id = await startTask('scan', {}, '/w', 'Scan');
    for (let i = 0; i < 600; i++) emit('task-event', { task_id: id, kind: 'status', summary: `s${i}`, tool: null, target: null, is_error: null });
    expect(getTask(id)!.events).toHaveLength(500);
    emit('task-finished', { task_id: id, exit_code: 0, success: true, outcome: { ok: true, detail: 'Pipeline updated.', artifacts: ['data/pipeline.md'] } });
    dismiss(id);
    expect(getTasks()).toHaveLength(0);
  });

  it('stores the args and languageContext a task was started with', async () => {
    const languageContext = { analysisLanguage: 'en' };
    const id = await startTask('evaluate', { url: 'https://x', capture: 'jds/x.md' }, '/w', 'Acme', languageContext);
    const task = getTask(id)!;
    expect(task.args).toEqual({ url: 'https://x', capture: 'jds/x.md' });
    expect(task.languageContext).toEqual(languageContext);
  });

  it('caps rawLog at the last 2000 lines', async () => {
    const id = await startTask('scan', {}, '/w', 'Scan');
    for (let i = 0; i < 2100; i++) emit('task-output', { task_id: id, stream: 'stdout', data: `line-${i}` });
    const task = getTask(id)!;
    expect(task.rawLog).toHaveLength(2000);
    expect(task.rawLog[0]).toBe('line-100');
    expect(task.rawLog[1999]).toBe('line-2099');
  });

  it('dismiss is a no-op for a still-running task', async () => {
    const id = await startTask('evaluate', { url: 'https://x' }, '/w', 'Acme');
    dismiss(id);
    expect(getTask(id)).not.toBeNull();
    expect(getTasks()).toHaveLength(1);
  });

  it('replays task events buffered while hydrating from the backend registry', async () => {
    // Simulate a webview reload: the store re-initialises from `listTasks()`
    // while a backend task is still running, and that task finishes before
    // `listTasks()` resolves. The finished event must not be lost.
    __resetForTests();
    mocks.listeners.clear();
    let resolveListTasks!: (snapshots: TaskSnapshot[]) => void;
    mocks.listTasks.mockImplementationOnce(
      () => new Promise<TaskSnapshot[]>((resolve) => { resolveListTasks = resolve; }),
    );

    const initPromise = initTaskStore();
    // Let the microtask queue drain past `await Promise.all([...listen])` so
    // `listTasks()` has actually been invoked (and `resolveListTasks` bound)
    // before we emit — `listen()`'s own callback registration happens
    // synchronously, but the `await` in front of it still yields.
    await new Promise((resolve) => setTimeout(resolve, 0));
    emit('task-finished', {
      task_id: 'task-7',
      exit_code: 0,
      success: true,
      outcome: { ok: true, detail: 'Scan complete.', artifacts: [] },
    });
    resolveListTasks([
      { task_id: 'task-7', task_type: 'scan', label: 'Scan', started_at: 1, state: 'running', last_summary: '' },
    ]);
    await initPromise;

    const task = getTask('task-7')!;
    expect(task.state).toBe('done');
    expect(task.outcome?.detail).toBe('Scan complete.');
  });
});

describe('hydrated tasks', () => {
  it('flags records restored from the backend registry so drivers never chain off a previous session', async () => {
    __resetForTests();
    mocks.listTasks.mockResolvedValueOnce([
      { task_id: 'old', task_type: 'scan', label: 'Scan', started_at: 1, state: 'done', last_summary: 'x' } as TaskSnapshot,
    ]);
    await initTaskStore();
    expect(getTask('old')?.hydrated).toBe(true);
  });
});
