import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntakeExactFileChange, IntakeProposal } from '../api';
import {
  applyIntakeProposal, confirmIntakeProposal, discardIntakePreview, previewIntakeProposal,
} from '../lib/runner';
import IntakeReview from './IntakeReview';

const hooks = vi.hoisted(() => {
  let state: unknown[] = [];
  let cursor = 0;
  return {
    reset(initial: unknown[] = []) {
      state = initial;
      cursor = 0;
    },
    beginRender() {
      cursor = 0;
    },
    useState(initial: unknown) {
      const index = cursor++;
      if (index === state.length) state.push(initial);
      return [state[index], (value: unknown) => {
        state[index] = typeof value === 'function'
          ? (value as (current: unknown) => unknown)(state[index])
          : value;
      }];
    },
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: <T,>(callback: T) => callback,
    useEffect: () => {},
    useRef: <T,>(initial: T) => ({ current: initial }),
    useState: hooks.useState,
  };
});
vi.mock('../lib/runner', () => ({
  applyIntakeProposal: vi.fn(),
  confirmIntakeProposal: vi.fn(),
  discardIntakePreview: vi.fn(),
  previewIntakeProposal: vi.fn(),
}));

const mockedApply = vi.mocked(applyIntakeProposal);
const mockedConfirm = vi.mocked(confirmIntakeProposal);
const mockedDiscard = vi.mocked(discardIntakePreview);
const mockedPreview = vi.mocked(previewIntakeProposal);

const proposal: IntakeProposal = {
  items: [
    {
      id: 'work-1',
      targetFile: 'cv.md',
      field: 'Experience',
      proposedValue: 'Senior Engineer',
      sources: ['work/review.txt'],
      conflict: {
        existingValue: 'Engineer',
        proposedValue: 'Senior Engineer',
      },
    },
    {
      id: 'research-1',
      targetFile: 'modes/_profile.md',
      field: 'Domain expertise',
      proposedValue: 'Causal inference',
      sources: ['research/paper.md'],
    },
  ],
  sourcePaths: ['work/review.txt', 'research/paper.md'],
};

beforeEach(() => {
  vi.resetAllMocks();
  hooks.reset();
  mockedPreview.mockResolvedValue({ proposal, intakeSessionId: 'intake-1' });
  mockedApply.mockResolvedValue({ applied: false, exactChanges: [{
    targetFile: 'cv.md',
    beforeContent: '# CV\n\nEngineer\n',
    afterContent: '# CV\n\nSenior Engineer\nFABRICATED EXTRA\n',
  }] });
  mockedConfirm.mockResolvedValue({ applied: true, committedSourcePaths: ['work/review.txt'] });
  mockedDiscard.mockResolvedValue(undefined);
});

type ElementNode = {
  type?: unknown;
  props?: {
    children?: unknown;
    checked?: boolean;
    disabled?: boolean;
    onChange?: () => void;
    onClick?: () => void | Promise<void>;
    role?: string;
  };
};

function render(
  approved: string[] = [],
  onComplete = vi.fn(),
  exactChanges: IntakeExactFileChange[] | null = null,
) {
  hooks.reset([
    { proposal, intakeSessionId: 'intake-1' },
    new Set(approved),
    exactChanges,
    false,
    false,
    null,
  ]);
  hooks.beginRender();
  return {
    tree: IntakeReview({ root: '/workspace', onBack: vi.fn(), onComplete }) as ElementNode,
    onComplete,
  };
}

function findAll(node: unknown, predicate: (element: ElementNode) => boolean): ElementNode[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
  if (typeof node !== 'object' || node === null) return [];
  const element = node as ElementNode;
  return [
    ...(predicate(element) ? [element] : []),
    ...findAll(element.props?.children, predicate),
  ];
}

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object' || node === null) return '';
  return textContent((node as ElementNode).props?.children);
}

function button(tree: ElementNode, label: string) {
  const target = findAll(tree, (element) => (
    element.type === 'button' && textContent(element) === label
  ))[0];
  if (!target) throw new Error(`Could not find ${label} button`);
  return target;
}

describe('IntakeReview', () => {
  it('renders one consolidated review with targets, sources, and explicit conflict values', () => {
    const { tree } = render(['work-1']);
    const text = textContent(tree);

    expect(text).toContain('cv.md');
    expect(text).toContain('Experience');
    expect(text).toContain('work/review.txt');
    expect(text).toContain('Current value');
    expect(text).toContain('Engineer');
    expect(text).toContain('Proposed value');
    expect(text).toContain('Senior Engineer');
    expect(button(tree, 'Approve all')).toBeDefined();
    expect(button(tree, 'Prepare selected changes')).toBeDefined();
    expect(button(tree, 'Back')).toBeDefined();
    expect(button(tree, 'Skip for now')).toBeDefined();
  });

  it('keeps apply disabled and inert when zero items are approved', async () => {
    const { tree } = render();
    const apply = button(tree, 'Prepare selected changes');

    expect(apply.props?.disabled).toBe(true);
    await apply.props?.onClick?.();
    expect(mockedApply).not.toHaveBeenCalled();
  });

  it('prepares only checked proposal IDs without completing', async () => {
    const onComplete = vi.fn();
    const { tree } = render(['research-1'], onComplete);

    await button(tree, 'Prepare selected changes').props?.onClick?.();

    expect(mockedApply).toHaveBeenCalledWith('/workspace', 'intake-1', ['research-1']);
    expect(onComplete).not.toHaveBeenCalled();
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('shows exact current and proposed file bytes before a separate confirmation', async () => {
    const onComplete = vi.fn();
    const exactChanges: IntakeExactFileChange[] = [{
      targetFile: 'cv.md',
      beforeContent: '# CV\n\nEngineer\n',
      afterContent: '# CV\n\nSenior Engineer\nFABRICATED EXTRA\n',
    }];
    const { tree } = render(['work-1'], onComplete, exactChanges);
    const text = textContent(tree);

    expect(text).toContain('Confirm exact file changes');
    expect(text).toContain('Current file');
    expect(text).toContain('Proposed file');
    expect(text).toContain('FABRICATED EXTRA');
    await button(tree, 'Confirm exact file changes').props?.onClick?.();

    expect(mockedConfirm).toHaveBeenCalledWith('intake-1');
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('lets the user reject every proposal and finish without apply or commit', async () => {
    const onComplete = vi.fn();
    const { tree } = render([], onComplete);

    await button(tree, 'Skip for now').props?.onClick?.();

    expect(mockedApply).not.toHaveBeenCalled();
    expect(mockedDiscard).toHaveBeenCalledWith('intake-1');
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('approve all checks every proposal item', () => {
    const initial = render().tree;
    button(initial, 'Approve all').props?.onClick?.();

    hooks.beginRender();
    const updated = IntakeReview({ root: '/workspace', onBack: vi.fn(), onComplete: vi.fn() }) as ElementNode;
    const checkboxes = findAll(updated, (element) => element.type === 'input');
    expect(checkboxes.map((checkbox) => checkbox.props?.checked)).toEqual([true, true]);
  });
});
