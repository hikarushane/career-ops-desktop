import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as runner from './runner';
import type { IntakeProposal, TaskFinishedEvent, TaskOutputEvent } from '../api';

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (event: { payload: unknown }) => void>();
  return {
    invokeRunTask: vi.fn(),
    invokeCancelTask: vi.fn(),
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
    proposal: IntakeProposal,
    approvedIds: string[],
  ) => Promise<{ applied: boolean; mergedSourcePaths: string[] }>;
}).applyIntakeProposal;

const previewIntakeProposal = (runner as unknown as {
  previewIntakeProposal: (root: string) => Promise<IntakeProposal>;
}).previewIntakeProposal;

const proposal: IntakeProposal = {
  items: [
    {
      id: 'work-1',
      targetFile: 'cv.md',
      field: 'Experience',
      proposedValue: 'Led a migration',
      sources: ['work/review.txt'],
    },
    {
      id: 'research-1',
      targetFile: 'modes/_profile.md',
      field: 'Domain expertise',
      proposedValue: 'Applied causal inference',
      sources: ['research/paper.md'],
    },
  ],
  sourcePaths: ['work/review.txt', 'research/paper.md'],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listeners.clear();
  mocks.invokeRunTask.mockResolvedValue({ task_id: 'task-1' });
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
});

describe('reviewed intake apply gate', () => {
  it('does not invoke intake-apply when zero proposals are approved', async () => {
    await expect(applyIntakeProposal('/workspace', proposal, [])).resolves.toEqual({
      applied: false,
      mergedSourcePaths: [],
    });

    expect(mocks.invokeRunTask).not.toHaveBeenCalled();
  });

  it('supplies only selected proposal IDs and items to intake-apply', async () => {
    const applying = applyIntakeProposal('/workspace', proposal, ['research-1']);

    await vi.waitFor(() => expect(mocks.invokeRunTask).toHaveBeenCalledOnce());
    const input = mocks.invokeRunTask.mock.calls[0][2] as Record<string, string>;
    expect(JSON.parse(input.approvedProposalIds)).toEqual(['research-1']);
    expect(JSON.parse(input.selectedProposal).items.map((item: { id: string }) => item.id)).toEqual(['research-1']);

    await finishTask();
    await applying;
  });

  it('does not supply a declined source for intake-state commit', async () => {
    const applying = applyIntakeProposal('/workspace', proposal, ['work-1']);

    await vi.waitFor(() => expect(mocks.invokeRunTask).toHaveBeenCalledOnce());
    const input = mocks.invokeRunTask.mock.calls[0][2] as Record<string, string>;
    expect(JSON.parse(input.mergedSourcePaths)).toEqual(['work/review.txt']);

    await finishTask();
    await applying;
  });

  it('reports only merged source paths after a successful apply', async () => {
    const applying = applyIntakeProposal('/workspace', proposal, ['research-1']);

    await finishTask();

    await expect(applying).resolves.toEqual({
      applied: true,
      mergedSourcePaths: ['research/paper.md'],
    });
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
      return { task_id: 'task-1' };
    });

    await expect(previewIntakeProposal('/workspace')).resolves.toEqual({ items: [], sourcePaths: [] });
  });

  it('runs one intake-preview task and returns its validated proposal', async () => {
    const previewing = previewIntakeProposal('/workspace');
    await emitOutput(`---CAREEROPS_INTAKE_PROPOSAL_START---
{"items":[],"sourcePaths":[]}
---CAREEROPS_INTAKE_PROPOSAL_END---`);
    await finishTask();

    await expect(previewing).resolves.toEqual({ items: [], sourcePaths: [] });
    expect(mocks.invokeRunTask).toHaveBeenCalledOnce();
    expect(mocks.invokeRunTask.mock.calls[0][0]).toBe('intake-preview');
  });

  it('keeps malformed output retryable instead of invoking apply', async () => {
    const previewing = previewIntakeProposal('/workspace');
    await emitOutput('malformed provider output');
    await finishTask();

    await expect(previewing).rejects.toThrow(/try again/i);
    expect(mocks.invokeRunTask).toHaveBeenCalledOnce();
  });
});
