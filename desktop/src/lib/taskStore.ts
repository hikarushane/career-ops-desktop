import { listen } from '@tauri-apps/api/event';
import { useSyncExternalStore } from 'react';
import {
  cancelTask as invokeCancelTask, listTasks, runTask as invokeRunTask,
  type LanguageContext, type TaskEvent, type TaskFinishedEvent, type TaskOutcome, type TaskOutputEvent, type TaskType,
} from '../api';
import { getEffort, getFastMode, getModel, getPreferredProvider } from './providers';

export type TaskRecord = {
  taskId: string; taskType: TaskType; label: string; startedAt: number;
  state: 'running' | 'done' | 'failed'; events: TaskEvent[]; rawLog: string[];
  outcome: TaskOutcome | null; exitCode: number | null;
};

const MAX_EVENTS = 500;
let tasks: TaskRecord[] = [];
let runningCache: TaskRecord[] = [];
const listeners = new Set<() => void>();
let initialised: Promise<void> | null = null;
const pending: { name: string; payload: unknown }[] = [];

function notify() {
  tasks = [...tasks];
  runningCache = tasks.filter((t) => t.state === 'running');
  for (const l of listeners) l();
}
function find(id: string) { return tasks.find((t) => t.taskId === id); }

function apply(name: string, payload: unknown) {
  const id = (payload as { task_id: string }).task_id;
  const index = tasks.findIndex((t) => t.taskId === id);
  if (index === -1) { pending.push({ name, payload }); return; }
  const task = tasks[index];
  let next: TaskRecord;
  if (name === 'task-event') {
    next = { ...task, events: [...task.events.slice(-(MAX_EVENTS - 1)), payload as TaskEvent] };
  } else if (name === 'task-output') {
    next = { ...task, rawLog: [...task.rawLog, (payload as TaskOutputEvent).data] };
  } else {
    const fin = payload as TaskFinishedEvent;
    next = { ...task, state: fin.success ? 'done' : 'failed', outcome: fin.outcome, exitCode: fin.exit_code };
  }
  tasks = tasks.slice();
  tasks[index] = next;
  notify();
}

export function initTaskStore(): Promise<void> {
  if (!initialised) {
    initialised = (async () => {
      await Promise.all(['task-event', 'task-output', 'task-finished'].map((name) =>
        listen(name, (e) => apply(name, e.payload))));
      try {
        for (const snap of await listTasks()) {
          if (!find(snap.task_id)) tasks.push({
            taskId: snap.task_id, taskType: snap.task_type, label: snap.label, startedAt: snap.started_at,
            state: snap.state, events: [], rawLog: [], exitCode: null,
            outcome: snap.state === 'running' ? null : { ok: snap.state === 'done', detail: snap.last_summary, artifacts: [] },
          });
        }
        notify();
      } catch { /* registry unavailable in tests */ }
    })();
  }
  return initialised;
}

export async function startTask(
  taskType: TaskType, args: Record<string, string>, root: string, label: string, languageContext?: LanguageContext,
): Promise<string> {
  await initTaskStore();
  const provider = await getPreferredProvider();
  if (!provider) throw new Error('No AI provider available. Install Claude Code or another supported CLI.');
  const [model, effort, fastMode] = await Promise.all([getModel(), getEffort(), getFastMode()]);
  const started = await invokeRunTask(taskType, provider.id, args, root, languageContext, { model, effort, fastMode }, label);
  tasks = [
    { taskId: started.task_id, taskType, label, startedAt: Date.now(), state: 'running', events: [], rawLog: [], outcome: null, exitCode: null },
    ...tasks,
  ];
  notify();
  const replay = pending.splice(0);
  for (const p of replay) apply(p.name, p.payload);
  return started.task_id;
}

export async function cancel(taskId: string) { await invokeCancelTask(taskId); }
export function dismiss(taskId: string) { tasks = tasks.filter((t) => t.taskId !== taskId || t.state === 'running'); notify(); }
export function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getTasks() { return tasks; }
export function getTask(taskId: string) { return find(taskId) ?? null; }
export function useTask(taskId: string | null) { return useSyncExternalStore(subscribe, () => (taskId ? getTask(taskId) : null)); }
export function useRunningTasks() { return useSyncExternalStore(subscribe, () => runningCache); }
export function useTasks() { return useSyncExternalStore(subscribe, getTasks); }
export function __resetForTests() { tasks = []; runningCache = []; listeners.clear(); initialised = null; pending.length = 0; }
