import { afterEach, describe, expect, it, vi } from 'vitest';
import Onboarding from './Onboarding';

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
  return { ...actual, useState: hooks.useState };
});

afterEach(() => hooks.reset());

type ElementNode = {
  type?: unknown;
  props?: {
    onComplete?: () => void;
    children?: unknown;
  };
};

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object' || node === null) return '';
  return textContent((node as ElementNode).props?.children);
}

function render() {
  hooks.beginRender();
  return Onboarding({ root: '/workspace', onComplete: vi.fn() }) as ElementNode;
}

describe('onboarding reviewed intake step', () => {
  it('opens one intake review after the AI provider is configured', () => {
    hooks.reset(['ai']);
    const aiSetup = render();

    aiSetup.props?.onComplete?.();
    const next = render();

    expect((next.type as { name?: string })?.name).toBe('IntakeReview');
  });

  it('reaches Ready when the intake review is skipped with zero approvals', () => {
    hooks.reset(['intake']);
    const intake = render();

    intake.props?.onComplete?.();
    const ready = render();

    expect(textContent(ready)).toContain("You're all set");
  });
});
