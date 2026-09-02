import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (e: { payload: unknown }) => void>();
  return {
    listeners,
    listen: vi.fn(async (name: string, cb: (e: { payload: unknown }) => void) => { listeners.set(name, cb); return () => {}; }),
    invokeRunTask: vi.fn(async () => ({ task_id: 'task-1' })),
    invokeCancelTask: vi.fn(async () => {}),
    listTasks: vi.fn(async () => []),
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
});
