import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  runTask as invokeRunTask,
  cancelTask as invokeCancelTask,
  getGenerationResult,
  type TaskType,
  type TaskOutputEvent,
  type TaskFinishedEvent,
  type LanguageContext,
  type GenerationProgressEvent,
  type GenerationResult,
  type GenerationTarget,
  type ModelOptions,
} from '../api';
import { getEffort, getFastMode, getModel, getPreferredProvider } from './providers';

export async function currentModelOptions(): Promise<ModelOptions> {
  const [model, effort, fastMode] = await Promise.all([getModel(), getEffort(), getFastMode()]);
  return { model, effort, fastMode };
}

export type TaskCallbacks = {
  onStarted?: (taskId: string) => void;
  onOutput?: (stream: 'stdout' | 'stderr', data: string) => void;
  onFinished?: (exitCode: number | null, success: boolean) => void;
};

export async function runTask(
  taskType: TaskType,
  args: Record<string, string>,
  path: string,
  callbacks?: TaskCallbacks,
  languageContext?: LanguageContext,
): Promise<{ taskId: string; unlisten: () => void }> {
  const provider = await getPreferredProvider();
  if (!provider) throw new Error('No AI provider available. Install Claude Code or another supported CLI.');

  const unlisteners: UnlistenFn[] = [];
  const pendingOutput: TaskOutputEvent[] = [];
  const pendingFinished: TaskFinishedEvent[] = [];
  let taskId: string | null = null;

  function unlisten() {
    for (const listener of unlisteners) listener();
  }

  function handleOutput(payload: TaskOutputEvent) {
    if (taskId === null) {
      pendingOutput.push(payload);
    } else if (payload.task_id === taskId) {
      callbacks?.onOutput?.(payload.stream, payload.data);
    }
  }

  function handleFinished(payload: TaskFinishedEvent) {
    if (taskId === null) {
      pendingFinished.push(payload);
    } else if (payload.task_id === taskId) {
      callbacks?.onFinished?.(payload.exit_code, payload.success);
      unlisten();
    }
  }

  if (callbacks?.onOutput) {
    const u = await listen<TaskOutputEvent>('task-output', (e) => {
      handleOutput(e.payload);
    });
    unlisteners.push(u);
  }

  if (callbacks?.onFinished) {
    const u = await listen<TaskFinishedEvent>('task-finished', (e) => {
      handleFinished(e.payload);
    });
    unlisteners.push(u);
  }

  try {
    const started = await invokeRunTask(taskType, provider.id, args, path, languageContext, await currentModelOptions());
    taskId = started.task_id;
    callbacks?.onStarted?.(taskId);
  } catch (reason) {
    unlisten();
    throw reason;
  }

  for (const payload of pendingOutput) handleOutput(payload);
  for (const payload of pendingFinished) handleFinished(payload);

  return { taskId, unlisten };
}

export async function cancelTask(taskId: string): Promise<void> {
  await invokeCancelTask(taskId);
}

export type GenerateProfileCallbacks = {
  onStarted?: (taskId: string) => void;
  onFileWritten?: (file: GenerationTarget) => void;
  onOutput?: (stream: 'stdout' | 'stderr', data: string) => void;
};

export type GenerationFeedback = {
  instructions: string;
  previous: Record<GenerationTarget, string | null>;
};

const PREVIOUS_KEYS: Record<GenerationTarget, string> = {
  'cv.md': 'previous_cv',
  'config/profile.yml': 'previous_profile_yml',
  'modes/_profile.md': 'previous_profile_md',
  'portals.yml': 'previous_portals',
};

export function feedbackArgs(feedback?: GenerationFeedback): Record<string, string> {
  if (!feedback || !feedback.instructions.trim()) return {};
  const out: Record<string, string> = { feedback: feedback.instructions.trim() };
  for (const [target, key] of Object.entries(PREVIOUS_KEYS) as [GenerationTarget, string][]) {
    out[key] = feedback.previous[target] ?? '(not written)';
  }
  return out;
}

function describeProviderFailure(exitCode: number | null, stderr: string[], stdout: string[]): string {
  const stderrText = stderr.join('\n').trim().slice(-500);
  const stdoutText = stdout.join('\n').trim().slice(-300);
  const combined = `${stderrText}\n${stdoutText}`.toLowerCase();
  const isAuthError = /authenticat|expired|login|oauth|unauthorized|not logged in/.test(combined);
  const parts = [isAuthError
    ? 'AI provider authentication failed. Open Terminal, log in to the provider, then try again.'
    : `Profile generation failed (exit ${exitCode ?? 'unknown'}) and no files were written.`];
  if (stderrText) parts.push(stderrText);
  else if (stdoutText) parts.push(stdoutText);
  return parts.join('\n');
}

export function generateProfile(
  root: string,
  preferences: string,
  analysisLanguage: string,
  callbacks?: GenerateProfileCallbacks,
  feedback?: GenerationFeedback,
): Promise<GenerationResult> {
  return new Promise<GenerationResult>((resolve, reject) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    let taskId: string | null = null;
    const pendingProgress: GenerationProgressEvent[] = [];
    let unlistenProgress: UnlistenFn | undefined;

    function handleProgress(payload: GenerationProgressEvent) {
      if (taskId === null) pendingProgress.push(payload);
      else if (payload.task_id === taskId) callbacks?.onFileWritten?.(payload.file);
    }

    void listen<GenerationProgressEvent>('generation-progress', (e) => handleProgress(e.payload))
      .then((unlisten) => { unlistenProgress = unlisten; });

    void runTask('profile-generate', { preferences, analysisLanguage, ...feedbackArgs(feedback) }, root, {
      onStarted: (id) => {
        taskId = id;
        callbacks?.onStarted?.(id);
        for (const payload of pendingProgress) handleProgress(payload);
        pendingProgress.length = 0;
      },
      onOutput: (stream, data) => {
        (stream === 'stderr' ? stderr : stdout).push(data);
        callbacks?.onOutput?.(stream, data);
      },
      onFinished: async (exitCode, success) => {
        unlistenProgress?.();
        if (taskId === null) {
          reject(new Error('Profile generation did not start.'));
          return;
        }
        try {
          const result = await getGenerationResult(taskId);
          const wroteAnything = result.files.some((file) => file.content !== null);
          if (!success && !wroteAnything) {
            reject(new Error(describeProviderFailure(exitCode, stderr, stdout)));
            return;
          }
          resolve(result);
        } catch (reason) {
          reject(reason);
        }
      },
    }).catch((reason) => {
      unlistenProgress?.();
      reject(reason);
    });
  });
}
