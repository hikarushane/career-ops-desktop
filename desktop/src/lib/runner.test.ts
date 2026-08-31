import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as runner from './runner';
import type { IntakeExactFileChange, IntakeProposal, TaskFinishedEvent, TaskOutputEvent } from '../api';

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (event: { payload: unknown }) => void>();
  return {
    invokeRunTask: vi.fn(),
    invokeCancelTask: vi.fn(),
    bindIntakeProposal: vi.fn(),
    discardIntakeSession: vi.fn(),
    getPendingIntakeChanges: vi.fn(),
    confirmIntakeChanges: vi.fn(),
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
    bindIntakeProposal: mocks.bindIntakeProposal,
    discardIntakeSession: mocks.discardIntakeSession,
    getPendingIntakeChanges: mocks.getPendingIntakeChanges,
    confirmIntakeChanges: mocks.confirmIntakeChanges,
  };
});
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('./providers', () => ({ getPreferredProvider: mocks.getPreferredProvider }));

const parseIntakeProposal = (runner as unknown as {
  parseIntakeProposal: (output: string) => IntakeProposal;
}).parseIntakeProposal;

const applyIntakeProposal = (runner as unknown as {
  applyIntakeProposal: (
    root: string,
    intakeSessionId: string,
    approvedIds: string[],
  ) => Promise<{ applied: boolean; exactChanges: IntakeExactFileChange[] }>;
}).applyIntakeProposal;

const confirmIntakeProposal = (runner as unknown as {
  confirmIntakeProposal: (
    intakeSessionId: string,
  ) => Promise<{ applied: true; committedSourcePaths: string[] }>;
}).confirmIntakeProposal;

const previewIntakeProposal = (runner as unknown as {
  previewIntakeProposal: (root: string) => Promise<{
    proposal: IntakeProposal;
    intakeSessionId: string;
  }>;
}).previewIntakeProposal;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listeners.clear();
  mocks.invokeRunTask.mockResolvedValue({ task_id: 'task-1', intake_session_id: 'intake-1' });
  mocks.bindIntakeProposal.mockResolvedValue(undefined);
  mocks.discardIntakeSession.mockResolvedValue(undefined);
  mocks.getPendingIntakeChanges.mockResolvedValue([{
    targetFile: 'cv.md',
    beforeContent: '# CV\n',
    afterContent: '# CV\nSenior Engineer\n',
  }]);
  mocks.confirmIntakeChanges.mockResolvedValue(['work/review.txt']);
  mocks.getPreferredProvider.mockResolvedValue({
    id: 'claude',
    displayName: 'Claude Code',
    binary: 'claude',
    headlessCmd: 'claude -p',
    state: 'ready',
  });
});

async function finishTask(success = true) {
  await vi.waitFor(() => expect(mocks.listeners.has('task-finished')).toBe(true));
  mocks.listeners.get('task-finished')?.({
    payload: {
      task_id: 'task-1',
      exit_code: success ? 0 : 1,
      success,
    } satisfies TaskFinishedEvent,
  });
}

async function emitOutput(data: string) {
  await vi.waitFor(() => expect(mocks.listeners.has('task-output')).toBe(true));
  mocks.listeners.get('task-output')?.({
    payload: {
      task_id: 'task-1',
      stream: 'stdout',
      data,
    } satisfies TaskOutputEvent,
  });
}

describe('intake proposal protocol', () => {
  it('returns a validated proposal from the delimited provider response', () => {
    const output = `provider preamble
---CAREEROPS_INTAKE_PROPOSAL_START---
{"items":[{"id":"work-1","targetFile":"cv.md","field":"Experience","proposedValue":"Led a migration","sources":["work/review.txt"]}],"sourcePaths":["work/review.txt"]}
---CAREEROPS_INTAKE_PROPOSAL_END---`;

    expect(parseIntakeProposal(output)).toEqual({
      items: [{
        id: 'work-1',
        targetFile: 'cv.md',
        field: 'Experience',
        proposedValue: 'Led a migration',
        sources: ['work/review.txt'],
      }],
      sourcePaths: ['work/review.txt'],
    });
  });

  it('rejects malformed provider output with a retryable error', () => {
    expect(() => parseIntakeProposal('not the intake protocol')).toThrow(/try again/i);
  });

  it('rejects source paths that could escape documents', () => {
    const output = `---CAREEROPS_INTAKE_PROPOSAL_START---
{"items":[{"id":"bad-1","targetFile":"cv.md","field":"Experience","proposedValue":"value","sources":["../config/profile.yml"]}],"sourcePaths":["../config/profile.yml"]}
---CAREEROPS_INTAKE_PROPOSAL_END---`;

    expect(() => parseIntakeProposal(output)).toThrow(/try again/i);
  });

  it('rejects a conflict whose proposed value disagrees with the item', () => {
    const output = `---CAREEROPS_INTAKE_PROPOSAL_START---
{"items":[{"id":"bad-1","targetFile":"cv.md","field":"Experience","proposedValue":"Senior Engineer","sources":["work/review.txt"],"conflict":{"existingValue":"Engineer","proposedValue":"Principal Engineer"}}],"sourcePaths":["work/review.txt"]}
---CAREEROPS_INTAKE_PROPOSAL_END---`;

    expect(() => parseIntakeProposal(output)).toThrow(/try again/i);
  });

  it('rejects duplicate proposal end delimiters', () => {
    const output = `---CAREEROPS_INTAKE_PROPOSAL_START---
{"items":[],"sourcePaths":[]}
---CAREEROPS_INTAKE_PROPOSAL_END---
---CAREEROPS_INTAKE_PROPOSAL_END---`;

    expect(() => parseIntakeProposal(output)).toThrow(/try again/i);
  });

  it('rejects an end delimiter before an otherwise valid proposal', () => {
    const output = `---CAREEROPS_INTAKE_PROPOSAL_END---
---CAREEROPS_INTAKE_PROPOSAL_START---
{"items":[],"sourcePaths":[]}
---CAREEROPS_INTAKE_PROPOSAL_END---`;

    expect(() => parseIntakeProposal(output)).toThrow(/try again/i);
  });

  it.each([
    '{"items":[],"sourcePaths":[],"unexpected":true}',
    '{"items":[{"id":"work-1","targetFile":"cv.md","field":"Experience","proposedValue":"Senior Engineer","sources":["work/review.txt"],"unexpected":true}],"sourcePaths":["work/review.txt"]}',
    '{"items":[{"id":"work-1","targetFile":"cv.md","field":"Experience","proposedValue":"Senior Engineer","sources":["work/review.txt"],"conflict":{"existingValue":"Engineer","proposedValue":"Senior Engineer","unexpected":true}}],"sourcePaths":["work/review.txt"]}',
  ])('rejects unknown intake proposal fields', (json) => {
    const output = `---CAREEROPS_INTAKE_PROPOSAL_START---
${json}
---CAREEROPS_INTAKE_PROPOSAL_END---`;

    expect(() => parseIntakeProposal(output)).toThrow(/try again/i);
  });
});

describe('reviewed intake apply gate', () => {
  it('does not invoke intake-apply when zero proposals are approved', async () => {
    await expect(applyIntakeProposal('/workspace', 'intake-1', [])).resolves.toEqual({
      applied: false,
      exactChanges: [],
    });

    expect(mocks.invokeRunTask).not.toHaveBeenCalled();
  });

  it('supplies only the bound session and selected proposal IDs to intake-apply', async () => {
    const applying = applyIntakeProposal('/workspace', 'intake-1', ['research-1']);

    await vi.waitFor(() => expect(mocks.invokeRunTask).toHaveBeenCalledOnce());
    const input = mocks.invokeRunTask.mock.calls[0][2] as Record<string, string>;
    expect(JSON.parse(input.approvedProposalIds)).toEqual(['research-1']);
    expect(input.intakeSessionId).toBe('intake-1');
    expect(input).not.toHaveProperty('selectedProposal');
    expect(input).not.toHaveProperty('mergedSourcePaths');

    await finishTask();
    await applying;
  });

  it('returns exact candidate bytes without confirming them', async () => {
    const applying = applyIntakeProposal('/workspace', 'intake-1', ['research-1']);

    await finishTask();

    await expect(applying).resolves.toEqual({
      applied: false,
      exactChanges: [{
        targetFile: 'cv.md',
        beforeContent: '# CV\n',
        afterContent: '# CV\nSenior Engineer\n',
      }],
    });
    expect(mocks.getPendingIntakeChanges).toHaveBeenCalledWith('intake-1');
    expect(mocks.confirmIntakeChanges).not.toHaveBeenCalled();
  });

  it('promotes only through the separate exact confirmation command', async () => {
    await expect(confirmIntakeProposal('intake-1')).resolves.toEqual({
      applied: true,
      committedSourcePaths: ['work/review.txt'],
    });
    expect(mocks.confirmIntakeChanges).toHaveBeenCalledWith('intake-1');
  });
});

describe('intake preview session', () => {
  it('buffers provider events emitted before the task-start response resolves', async () => {
    mocks.invokeRunTask.mockImplementationOnce(async () => {
      if (!mocks.listeners.has('task-output') || !mocks.listeners.has('task-finished')) {
        throw new Error('runner subscribed too late');
      }
      mocks.listeners.get('task-output')?.({
        payload: {
          task_id: 'task-1',
          stream: 'stdout',
          data: `---CAREEROPS_INTAKE_PROPOSAL_START---
{"items":[],"sourcePaths":[]}
---CAREEROPS_INTAKE_PROPOSAL_END---`,
        } satisfies TaskOutputEvent,
      });
      mocks.listeners.get('task-finished')?.({
        payload: { task_id: 'task-1', exit_code: 0, success: true } satisfies TaskFinishedEvent,
      });
      return { task_id: 'task-1', intake_session_id: 'intake-1' };
    });

    await expect(previewIntakeProposal('/workspace')).resolves.toEqual({
      proposal: { items: [], sourcePaths: [] },
      intakeSessionId: 'intake-1',
    });
    expect(mocks.bindIntakeProposal).toHaveBeenCalledWith('intake-1', { items: [], sourcePaths: [] });
  });

  it('runs one intake-preview task and returns its validated proposal', async () => {
    const previewing = previewIntakeProposal('/workspace');
    await emitOutput(`---CAREEROPS_INTAKE_PROPOSAL_START---
{"items":[],"sourcePaths":[]}
---CAREEROPS_INTAKE_PROPOSAL_END---`);
    await finishTask();

    await expect(previewing).resolves.toEqual({
      proposal: { items: [], sourcePaths: [] },
      intakeSessionId: 'intake-1',
    });
    expect(mocks.invokeRunTask).toHaveBeenCalledOnce();
    expect(mocks.invokeRunTask.mock.calls[0][0]).toBe('intake-preview');
    expect(mocks.bindIntakeProposal).toHaveBeenCalledWith('intake-1', { items: [], sourcePaths: [] });
  });

  it('keeps malformed output retryable instead of invoking apply', async () => {
    const previewing = previewIntakeProposal('/workspace');
    await emitOutput('malformed provider output');
    await finishTask();

    await expect(previewing).rejects.toThrow(/try again/i);
    expect(mocks.invokeRunTask).toHaveBeenCalledOnce();
    expect(mocks.discardIntakeSession).toHaveBeenCalledWith('intake-1');
  });
});
