import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateProfile, runTask } from './runner';
import type { GenerationResult, TaskFinishedEvent, TaskOutputEvent } from '../api';

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (event: { payload: unknown }) => void>();
  return {
    invokeRunTask: vi.fn(),
    invokeCancelTask: vi.fn(),
    getGenerationResult: vi.fn(),
    getPreferredProvider: vi.fn(),
    listeners,
    listen: vi.fn(async (event: string, callback: (event: { payload: unknown }) => void) => {
      listeners.set(event, callback);
      return vi.fn();
    }),
  };
});

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    runTask: mocks.invokeRunTask,
    cancelTask: mocks.invokeCancelTask,
    getGenerationResult: mocks.getGenerationResult,
  };
});
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('./providers', () => ({ getPreferredProvider: mocks.getPreferredProvider }));

const completeResult: GenerationResult = {
  taskId: 'task-1',
  complete: true,
  files: [
    { path: 'cv.md', content: '# CV\n', valid: true, issue: null },
    { path: 'config/profile.yml', content: 'candidate: {}\n', valid: true, issue: null },
    { path: 'modes/_profile.md', content: '# Profile\n', valid: true, issue: null },
    { path: 'portals.yml', content: 'title_filter: {}\n', valid: true, issue: null },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listeners.clear();
  mocks.invokeRunTask.mockResolvedValue({ task_id: 'task-1' });
  mocks.getGenerationResult.mockResolvedValue(completeResult);
  mocks.getPreferredProvider.mockResolvedValue({
    id: 'claude',
    displayName: 'Claude Code',
    binary: 'claude',
    headlessCmd: 'claude -p',
    state: 'ready',
  });
});

function emit(event: string, payload: unknown) {
  mocks.listeners.get(event)?.({ payload });
}

async function finishTask(success = true) {
  await vi.waitFor(() => expect(mocks.listeners.has('task-finished')).toBe(true));
  emit('task-finished', { task_id: 'task-1', exit_code: success ? 0 : 1, success } satisfies TaskFinishedEvent);
}

async function emitOutput(stream: 'stdout' | 'stderr', data: string) {
  await vi.waitFor(() => expect(mocks.listeners.has('task-output')).toBe(true));
  emit('task-output', { task_id: 'task-1', stream, data } satisfies TaskOutputEvent);
}

describe('runTask', () => {
  it('buffers provider events emitted before the task-start response resolves', async () => {
    const output: string[] = [];
    const finished = vi.fn();
    mocks.invokeRunTask.mockImplementationOnce(async () => {
      emit('task-output', { task_id: 'task-1', stream: 'stdout', data: 'early' } satisfies TaskOutputEvent);
      emit('task-finished', { task_id: 'task-1', exit_code: 0, success: true } satisfies TaskFinishedEvent);
      return { task_id: 'task-1' };
    });

    await runTask('scan', {}, '/workspace', {
      onOutput: (_stream, data) => output.push(data),
      onFinished: finished,
    });

    expect(output).toEqual(['early']);
    expect(finished).toHaveBeenCalledWith(0, true);
  });
});

describe('generateProfile', () => {
  it('runs one profile-generate task with the preferences and language, then returns the staging result', async () => {
    const written: string[] = [];
    const generating = generateProfile('/workspace', '- Regions: Germany', 'zh-TW', {
      onFileWritten: (file) => written.push(file),
    });

    await vi.waitFor(() => expect(mocks.listeners.has('generation-progress')).toBe(true));
    emit('generation-progress', { task_id: 'task-1', file: 'cv.md' });
    emit('generation-progress', { task_id: 'task-9', file: 'portals.yml' });
    await finishTask();

    await expect(generating).resolves.toEqual(completeResult);
    expect(mocks.invokeRunTask).toHaveBeenCalledOnce();
    expect(mocks.invokeRunTask.mock.calls[0].slice(0, 4)).toEqual([
      'profile-generate',
      'claude',
      { preferences: '- Regions: Germany', analysisLanguage: 'zh-TW' },
      '/workspace',
    ]);
    expect(written).toEqual(['cv.md']);
    expect(mocks.getGenerationResult).toHaveBeenCalledWith('task-1');
  });

  it('still returns a partial result when the provider exits non-zero but wrote files', async () => {
    const partial: GenerationResult = {
      ...completeResult,
      complete: false,
      files: completeResult.files.map((file, index) => (index === 3 ? { ...file, content: null, valid: false, issue: 'missing' } : file)),
    };
    mocks.getGenerationResult.mockResolvedValue(partial);

    const generating = generateProfile('/workspace', '', 'en');
    await emitOutput('stderr', 'provider crashed late');
    await finishTask(false);

    await expect(generating).resolves.toEqual(partial);
  });

  it('rejects with the provider stderr when nothing was written', async () => {
    mocks.getGenerationResult.mockResolvedValue({
      taskId: 'task-1',
      complete: false,
      files: completeResult.files.map((file) => ({ ...file, content: null, valid: false, issue: 'missing' })),
    });

    const generating = generateProfile('/workspace', '', 'en');
    await emitOutput('stderr', 'Not logged in. Please run /login');
    await finishTask(false);

    await expect(generating).rejects.toThrow(/authentication failed/i);
  });
});
