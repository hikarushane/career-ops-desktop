import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntakeProposal } from '../api';
import { applyIntakeProposal, previewIntakeProposal } from '../lib/runner';
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
    useState: hooks.useState,
  };
});
vi.mock('../lib/runner', () => ({
  applyIntakeProposal: vi.fn(),
  previewIntakeProposal: vi.fn(),
}));

const mockedApply = vi.mocked(applyIntakeProposal);
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
  mockedPreview.mockResolvedValue(proposal);
  mockedApply.mockResolvedValue({ applied: true, mergedSourcePaths: [] });
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

function render(approved: string[] = [], onComplete = vi.fn()) {
  hooks.reset([proposal, new Set(approved), false, false, null]);
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
    expect(button(tree, 'Apply selected changes')).toBeDefined();
    expect(button(tree, 'Back')).toBeDefined();
  });

  it('keeps apply disabled and inert when zero items are approved', async () => {
    const { tree } = render();
    const apply = button(tree, 'Apply selected changes');

    expect(apply.props?.disabled).toBe(true);
    await apply.props?.onClick?.();
    expect(mockedApply).not.toHaveBeenCalled();
  });

  it('supplies only checked proposal IDs and completes after apply', async () => {
    const onComplete = vi.fn();
    const { tree } = render(['research-1'], onComplete);

    await button(tree, 'Apply selected changes').props?.onClick?.();

    expect(mockedApply).toHaveBeenCalledWith('/workspace', proposal, ['research-1']);
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
