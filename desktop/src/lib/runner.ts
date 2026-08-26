import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  runTask as invokeRunTask,
  cancelTask as invokeCancelTask,
  type TaskType,
  type TaskOutputEvent,
  type TaskFinishedEvent,
} from '../api';
import { getPreferredProvider } from './providers';

export type TaskCallbacks = {
  onOutput?: (stream: 'stdout' | 'stderr', data: string) => void;
  onFinished?: (exitCode: number | null, success: boolean) => void;
};

export async function runTask(
  taskType: TaskType,
  args: Record<string, string>,
  path: string,
  callbacks?: TaskCallbacks,
): Promise<{ taskId: string; unlisten: () => void }> {
  const provider = await getPreferredProvider();
  if (!provider) throw new Error('No AI provider available. Install Claude Code or another supported CLI.');

  const { task_id } = await invokeRunTask(taskType, provider.id, args, path);

  const unlisteners: UnlistenFn[] = [];

  if (callbacks?.onOutput) {
    const cb = callbacks.onOutput;
    const u = await listen<TaskOutputEvent>('task-output', (e) => {
      if (e.payload.task_id === task_id) cb(e.payload.stream, e.payload.data);
    });
    unlisteners.push(u);
  }

  if (callbacks?.onFinished) {
    const cb = callbacks.onFinished;
    const u = await listen<TaskFinishedEvent>('task-finished', (e) => {
      if (e.payload.task_id === task_id) {
        cb(e.payload.exit_code, e.payload.success);
        unlisten();
      }
    });
    unlisteners.push(u);
  }

  function unlisten() {
    for (const u of unlisteners) u();
  }

  return { taskId: task_id, unlisten };
}

export async function cancelTask(taskId: string): Promise<void> {
  await invokeCancelTask(taskId);
}
