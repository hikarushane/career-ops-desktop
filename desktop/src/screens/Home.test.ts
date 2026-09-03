import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from './Home';

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
      return [state[index], (value: unknown) => { state[index] = value; }];
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

afterEach(() => hooks.reset());

type ElementNode = {
  type?: unknown;
  props?: {
    children?: unknown;
    onClick?: () => void | Promise<void>;
    disabled?: boolean;
  };
};

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object' || node === null) return '';
  return textContent((node as ElementNode).props?.children);
}

function findButton(node: unknown, label: string): ElementNode | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child, label);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== 'object' || node === null) return undefined;
  const element = node as ElementNode;
  if (element.type === 'button' && textContent(element) === label) return element;
  return findButton(element.props?.children, label);
}

describe('Home', () => {
  it('shows a batch card with the pending count and navigates to batch', () => {
    const onNavigate = vi.fn();
    hooks.reset(['']);
    hooks.beginRender();
    const tree = Home({
      root: '/w',
      data: {
        ok: true,
        applications: [],
        metrics: { Total: 0, ByStatus: {}, AvgScore: 0, TopScore: 0, WithPDF: 0, Actionable: 0 },
        progress: {} as never,
        pipelineSummary: { pending: 7, processed: 0, failed: 0 },
      },
      onNavigate,
    }) as ElementNode;
    expect(textContent(tree)).toMatch(/7 pending/);
    findButton(tree, 'Evaluate all pending')?.props?.onClick?.();
    expect(onNavigate).toHaveBeenCalledWith('batch');
  });

  it('disables the batch button when there is nothing pending', () => {
    hooks.reset(['']);
    hooks.beginRender();
    const tree = Home({
      root: '/w',
      data: {
        ok: true,
        applications: [],
        metrics: { Total: 0, ByStatus: {}, AvgScore: 0, TopScore: 0, WithPDF: 0, Actionable: 0 },
        progress: {} as never,
        pipelineSummary: { pending: 0, processed: 0, failed: 0 },
      },
      onNavigate: vi.fn(),
    }) as ElementNode;
    expect(findButton(tree, 'Evaluate all pending')?.props?.disabled).toBe(true);
  });

  it('surfaces failed pipeline entries needing attention', () => {
    hooks.reset(['']);
    hooks.beginRender();
    const tree = Home({
      root: '/w',
      data: {
        ok: true,
        applications: [],
        metrics: { Total: 0, ByStatus: {}, AvgScore: 0, TopScore: 0, WithPDF: 0, Actionable: 0 },
        progress: {} as never,
        pipelineSummary: { pending: 5, processed: 0, failed: 2 },
      },
      onNavigate: vi.fn(),
    }) as ElementNode;
    expect(textContent(tree)).toMatch(/2 need attention/);
  });
});
