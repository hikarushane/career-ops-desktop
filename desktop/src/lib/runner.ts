import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  runTask as invokeRunTask,
  cancelTask as invokeCancelTask,
  bindIntakeProposal as invokeBindIntakeProposal,
  getPendingIntakeChanges as invokeGetPendingIntakeChanges,
  confirmIntakeChanges as invokeConfirmIntakeChanges,
  discardIntakeSession as invokeDiscardIntakeSession,
  type TaskType,
  type TaskOutputEvent,
  type TaskFinishedEvent,
  type LanguageContext,
  type IntakeProposal,
  type IntakeProposalItem,
  type IntakeExactFileChange,
} from '../api';
import { getPreferredProvider } from './providers';

const INTAKE_PROPOSAL_START = '---CAREEROPS_INTAKE_PROPOSAL_START---';
const INTAKE_PROPOSAL_END = '---CAREEROPS_INTAKE_PROPOSAL_END---';
const INTAKE_PROTOCOL_ERROR = 'The AI provider returned an invalid intake proposal. Try again.';
const TARGET_FILES = new Set(['cv.md', 'config/profile.yml', 'modes/_profile.md']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function isSafeSourcePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\') || value.includes('\0')) {
    return false;
  }
  if (value.startsWith('/') || value.startsWith('-')) return false;
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function isProposalItem(value: unknown, sourcePaths: Set<string>): value is IntakeProposalItem {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ['id', 'targetFile', 'field', 'proposedValue', 'sources', 'conflict'])) return false;
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.id)) return false;
  if (typeof value.targetFile !== 'string' || !TARGET_FILES.has(value.targetFile)) return false;
  if (typeof value.field !== 'string' || value.field.length === 0) return false;
  if (typeof value.proposedValue !== 'string' || value.proposedValue.length === 0) return false;
  if (!Array.isArray(value.sources) || value.sources.length === 0) return false;
  if (!value.sources.every((source) => isSafeSourcePath(source) && sourcePaths.has(source))) return false;
  if (value.conflict !== undefined) {
    if (!isRecord(value.conflict)) return false;
    if (!hasOnlyKeys(value.conflict, ['existingValue', 'proposedValue'])) return false;
    if (typeof value.conflict.existingValue !== 'string' || typeof value.conflict.proposedValue !== 'string') {
      return false;
    }
    if (value.conflict.proposedValue !== value.proposedValue) return false;
  }
  return true;
}

export function parseIntakeProposal(output: string): IntakeProposal {
  const start = output.indexOf(INTAKE_PROPOSAL_START);
  const end = output.indexOf(INTAKE_PROPOSAL_END, start + INTAKE_PROPOSAL_START.length);
  if (start === -1 || end === -1) throw new Error(INTAKE_PROTOCOL_ERROR);
  if (output.indexOf(INTAKE_PROPOSAL_START, start + INTAKE_PROPOSAL_START.length) !== -1) {
    throw new Error(INTAKE_PROTOCOL_ERROR);
  }
  if (output.indexOf(INTAKE_PROPOSAL_END, end + INTAKE_PROPOSAL_END.length) !== -1) {
    throw new Error(INTAKE_PROTOCOL_ERROR);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(output.slice(start + INTAKE_PROPOSAL_START.length, end).trim());
  } catch {
    throw new Error(INTAKE_PROTOCOL_ERROR);
  }

  if (
    !isRecord(parsed)
    || !hasOnlyKeys(parsed, ['items', 'sourcePaths'])
    || !Array.isArray(parsed.items)
    || !Array.isArray(parsed.sourcePaths)
  ) {
    throw new Error(INTAKE_PROTOCOL_ERROR);
  }
  if (!parsed.sourcePaths.every(isSafeSourcePath)) throw new Error(INTAKE_PROTOCOL_ERROR);
  const sourcePaths = new Set(parsed.sourcePaths);
  if (sourcePaths.size !== parsed.sourcePaths.length) throw new Error(INTAKE_PROTOCOL_ERROR);
  if (!parsed.items.every((item) => isProposalItem(item, sourcePaths))) {
    throw new Error(INTAKE_PROTOCOL_ERROR);
  }
  const ids = new Set(parsed.items.map((item) => item.id));
  if (ids.size !== parsed.items.length) throw new Error(INTAKE_PROTOCOL_ERROR);

  return parsed as IntakeProposal;
}

export type TaskCallbacks = {
  onStarted?: (taskId: string, intakeSessionId?: string) => void;
  onOutput?: (stream: 'stdout' | 'stderr', data: string) => void;
  onFinished?: (exitCode: number | null, success: boolean) => void;
};

export async function runTask(
  taskType: TaskType,
  args: Record<string, string>,
  path: string,
  callbacks?: TaskCallbacks,
  languageContext?: LanguageContext,
): Promise<{ taskId: string; intakeSessionId?: string; unlisten: () => void }> {
  const provider = await getPreferredProvider();
  if (!provider) throw new Error('No AI provider available. Install Claude Code or another supported CLI.');

  const unlisteners: UnlistenFn[] = [];
  const pendingOutput: TaskOutputEvent[] = [];
  const pendingFinished: TaskFinishedEvent[] = [];
  let taskId: string | null = null;
  let intakeSessionId: string | undefined;

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
    const started = await invokeRunTask(taskType, provider.id, args, path, languageContext);
    taskId = started.task_id;
    intakeSessionId = started.intake_session_id;
    callbacks?.onStarted?.(taskId, intakeSessionId);
  } catch (reason) {
    unlisten();
    throw reason;
  }

  for (const payload of pendingOutput) handleOutput(payload);
  for (const payload of pendingFinished) handleFinished(payload);

  return { taskId, intakeSessionId, unlisten };
}

export async function cancelTask(taskId: string): Promise<void> {
  await invokeCancelTask(taskId);
}

export async function discardIntakePreview(intakeSessionId: string): Promise<void> {
  await invokeDiscardIntakeSession(intakeSessionId);
}

export type IntakePreviewSession = {
  proposal: IntakeProposal;
  intakeSessionId: string;
};

export async function previewIntakeProposal(root: string): Promise<IntakePreviewSession> {
  return new Promise<IntakePreviewSession>((resolve, reject) => {
    const stdout: string[] = [];
    let intakeSessionId: string | undefined;
    void runTask('intake-preview', {}, root, {
      onStarted: (_taskId, sessionId) => {
        intakeSessionId = sessionId;
      },
      onOutput: (stream, data) => {
        if (stream === 'stdout') stdout.push(data);
      },
      onFinished: async (_exitCode, success) => {
        if (!success) {
          reject(new Error('The intake preview could not be completed. Try again.'));
          return;
        }
        try {
          if (!intakeSessionId) throw new Error(INTAKE_PROTOCOL_ERROR);
          const proposal = parseIntakeProposal(stdout.join('\n'));
          await invokeBindIntakeProposal(intakeSessionId, proposal);
          resolve({ proposal, intakeSessionId });
        } catch (reason) {
          if (intakeSessionId) void invokeDiscardIntakeSession(intakeSessionId).catch(() => {});
          reject(reason);
        }
      },
    }).catch(reject);
  });
}

export async function applyIntakeProposal(
  root: string,
  intakeSessionId: string,
  approvedIds: string[],
): Promise<{ applied: boolean; exactChanges: IntakeExactFileChange[] }> {
  if (approvedIds.length === 0) return { applied: false, exactChanges: [] };

  await new Promise<void>((resolve, reject) => {
    void runTask('intake-apply', {
      intakeSessionId,
      approvedProposalIds: JSON.stringify(approvedIds),
    }, root, {
      onFinished: (_exitCode, success) => {
        if (success) resolve();
        else reject(new Error('The intake changes could not be applied. No sources were recorded; try again.'));
      },
    }).catch(reject);
  });

  const exactChanges = await invokeGetPendingIntakeChanges(intakeSessionId);
  return { applied: false, exactChanges };
}

export async function confirmIntakeProposal(
  intakeSessionId: string,
): Promise<{ applied: true; committedSourcePaths: string[] }> {
  const committedSourcePaths = await invokeConfirmIntakeChanges(intakeSessionId);
  return { applied: true, committedSourcePaths };
}
