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
  const end = output.indexOf(INTAKE_PROPOSAL_END);
  if (start === -1 || end < start) throw new Error(INTAKE_PROTOCOL_ERROR);
  if (output.lastIndexOf(INTAKE_PROPOSAL_START) !== start) {
    throw new Error(INTAKE_PROTOCOL_ERROR);
  }
  if (output.lastIndexOf(INTAKE_PROPOSAL_END) !== end) {
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
    || !Array.isArray(parsed.items)
    || !Array.isArray(parsed.sourcePaths)
  ) {
    throw new Error(INTAKE_PROTOCOL_ERROR);
  }
  if (!parsed.sourcePaths.every(isSafeSourcePath)) throw new Error(INTAKE_PROTOCOL_ERROR);
  const sourcePaths = new Set(parsed.sourcePaths);
  if (sourcePaths.size !== parsed.sourcePaths.length) throw new Error(INTAKE_PROTOCOL_ERROR);
  // Providers emit `"conflict": null` for "no conflict" even though the protocol
  // says to omit the key. Treat null exactly like an absent conflict.
  for (const item of parsed.items) {
    if (isRecord(item) && item.conflict === null) delete item.conflict;
  }
  if (!parsed.items.every((item) => isProposalItem(item, sourcePaths))) {
    throw new Error(INTAKE_PROTOCOL_ERROR);
  }
  const ids = new Set(parsed.items.map((item) => item.id));
  if (ids.size !== parsed.items.length) throw new Error(INTAKE_PROTOCOL_ERROR);

  // Providers commonly add extra top-level fields ("note", "explanation", ...) even when
  // not asked. Keep only the protocol keys and discard the rest — the Rust bind step
  // deserializes with deny_unknown_fields, and isProposalItem stays strict per item,
  // which is the real security boundary.
  return { items: parsed.items, sourcePaths: parsed.sourcePaths } as IntakeProposal;
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
    const stderr: string[] = [];
    let intakeSessionId: string | undefined;
    void runTask('intake-preview', {}, root, {
      onStarted: (_taskId, sessionId) => {
        intakeSessionId = sessionId;
      },
      onOutput: (stream, data) => {
        if (stream === 'stdout') stdout.push(data);
        if (stream === 'stderr') stderr.push(data);
      },
      onFinished: async (exitCode, success) => {
        if (!success) {
          const stderrText = stderr.join('\n').trim().slice(-500);
          const stdoutText = stdout.join('\n').trim().slice(-300);
          const combined = `${stderrText}\n${stdoutText}`.toLowerCase();
          const isAuthError = /authenticat|expired|login|oauth|unauthorized/.test(combined);
          const parts = [isAuthError
            ? 'AI provider authentication failed. Open Terminal and run: claude login'
            : `Intake preview failed (exit ${exitCode ?? 'unknown'})`];
          if (stderrText) parts.push(stderrText);
          else if (stdoutText) parts.push(stdoutText);
          else if (!isAuthError) parts.push('No output was captured from the AI provider.');
          reject(new Error(parts.join('\n')));
          return;
        }
        try {
          if (!intakeSessionId) throw new Error(INTAKE_PROTOCOL_ERROR);
          const fullOutput = stdout.join('\n');
          const proposal = parseIntakeProposal(fullOutput);
          await invokeBindIntakeProposal(intakeSessionId, proposal);
          resolve({ proposal, intakeSessionId });
        } catch (reason) {
          if (intakeSessionId) void invokeDiscardIntakeSession(intakeSessionId).catch(() => {});
          if (reason instanceof Error && reason.message === INTAKE_PROTOCOL_ERROR) {
            const fullOutput = stdout.join('\n');
            const stderrTail = stderr.join('\n').trim().slice(-400);
            const stdoutTail = fullOutput.slice(-800) || '(empty)';
            const detail = stderrTail
              ? `AI stderr (last 400 chars):\n${stderrTail}\n\nAI stdout (last 800 chars):\n${stdoutTail}`
              : `AI output (last 800 chars):\n${stdoutTail}`;
            reject(new Error(`${INTAKE_PROTOCOL_ERROR}\n\n${detail}`));
          } else {
            reject(reason);
          }
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
    const stderr: string[] = [];
    void runTask('intake-apply', {
      intakeSessionId,
      approvedProposalIds: JSON.stringify(approvedIds),
    }, root, {
      onOutput: (stream, data) => {
        if (stream === 'stderr') stderr.push(data);
      },
      onFinished: (_exitCode, success) => {
        if (success) resolve();
        else {
          const detail = stderr.join('\n').trim().slice(-500);
          reject(new Error(detail || 'The intake changes could not be applied. No sources were recorded; try again.'));
        }
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
