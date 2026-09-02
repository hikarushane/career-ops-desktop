import { afterEach, describe, expect, it, vi } from 'vitest';
import InterviewWorkflow from './InterviewWorkflow';

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
  return { ...actual, useState: hooks.useState, useEffect: () => {}, useCallback: <T,>(cb: T) => cb };
});

const store = vi.hoisted(() => ({
  startTask: vi.fn(async () => 'task-new'),
  getTask: vi.fn(() => null as unknown),
  useRunningTasks: vi.fn(() => [] as { taskType: string }[]),
}));
vi.mock('../lib/taskStore', () => store);

const api = vi.hoisted(() => ({ languageSettings: vi.fn(async () => null) }));
vi.mock('../api', () => api);

vi.mock('./TaskScreen', () => ({ default: (props: unknown) => props }));

afterEach(() => { hooks.reset(); vi.clearAllMocks(); });

type Element = { props: { taskId?: string | null; onRetry?: () => Promise<void>; children?: unknown } };

// State order: taskId, languages, jobLanguage, starting, startError
describe('InterviewWorkflow', () => {
  it('initializes taskId from initialTaskId so a reopened task shows its activity', () => {
    hooks.reset(['task-1', null, '', false, null]);
    hooks.beginRender();
    const tree = InterviewWorkflow({
      root: '/w', mode: 'interview-plan', company: '', role: '', initialTaskId: 'task-1', onBack: vi.fn(),
    }) as unknown as Element;
    expect(tree.props.taskId).toBe('task-1');
  });

  it('shows the task label as the subtitle when reopened without company/role props', () => {
    store.getTask.mockReturnValue({ taskId: 'task-1', taskType: 'interview-plan', label: 'Interview Prep Plan · Acme' });
    hooks.reset(['task-1', null, '', false, null]);
    hooks.beginRender();
    const tree = InterviewWorkflow({
      root: '/w', mode: 'interview-plan', company: '', role: '', initialTaskId: 'task-1', onBack: vi.fn(),
    }) as unknown as Element;
    expect(JSON.stringify(tree.props.children)).toMatch(/Interview Prep Plan · Acme/);
  });

  it('retries with the task record args instead of re-deriving from props', async () => {
    store.getTask.mockReturnValue({
      taskId: 'task-1', taskType: 'interview-plan', label: 'Interview Prep Plan · Acme',
      args: { company: 'Acme', role: 'PM' }, languageContext: { analysisLanguage: 'en' },
    });
    hooks.reset(['task-1', null, '', false, null]);
    hooks.beginRender();
    const tree = InterviewWorkflow({
      root: '/w', mode: 'interview-plan', company: '', role: '', initialTaskId: 'task-1', onBack: vi.fn(),
    }) as unknown as Element;
    await tree.props.onRetry?.();
    expect(store.startTask).toHaveBeenCalledWith(
      'interview-plan', { company: 'Acme', role: 'PM' }, '/w', 'Interview Prep Plan · Acme', { analysisLanguage: 'en' },
    );
  });

  it('disables Start while another task of the same mode is already running', () => {
    store.useRunningTasks.mockReturnValue([{ taskType: 'interview-plan' }]);
    hooks.reset([null, null, '', false, null]);
    hooks.beginRender();
    const tree = InterviewWorkflow({
      root: '/w', mode: 'interview-plan', company: 'Acme', role: 'PM', onBack: vi.fn(),
    }) as unknown as Element;
    expect(JSON.stringify(tree.props.children)).toMatch(/already running/);
  });
});
