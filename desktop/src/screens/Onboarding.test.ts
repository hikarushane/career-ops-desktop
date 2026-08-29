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
    onComplete?: (result?: unknown) => void;
    onSaved?: () => void;
    children?: unknown;
  };
};

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object' || node === null) return '';
  return textContent((node as ElementNode).props?.children);
}

function findElement(node: unknown, predicate: (element: ElementNode) => boolean): ElementNode | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== 'object' || node === null) return undefined;
  const element = node as ElementNode;
  return predicate(element) ? element : findElement(element.props?.children, predicate);
}

function render() {
  hooks.beginRender();
  return Onboarding({ root: '/workspace', onComplete: vi.fn() }) as ElementNode;
}

describe('onboarding reviewed intake step', () => {
  it('runs one review after staged background reaches a ready AI provider', () => {
    hooks.reset(['import', []]);
    const backgroundImport = render();

    backgroundImport.props?.onComplete?.({
      staged: [
        { sourcePath: '/source/cv.pdf', destinationPath: 'documents/cv/cv.pdf', category: 'cv', duplicate: false },
        { sourcePath: '/source/work.pdf', destinationPath: 'documents/work/work.pdf', category: 'work', duplicate: false },
        { sourcePath: '/source/paper.pdf', destinationPath: 'documents/research/paper.pdf', category: 'research', duplicate: false },
      ],
    });
    const language = render();
    findElement(language, (element) => Boolean(element.props?.onSaved))?.props?.onSaved?.();
    const aiSetup = render();
    aiSetup.props?.onComplete?.();
    const intake = render();

    expect((intake.type as { name?: string })?.name).toBe('IntakeReview');

    intake.props?.onComplete?.();
    expect(textContent(render())).toContain("You're all set");
  });

  it('skips intake and reaches Ready when no background was staged', () => {
    hooks.reset(['import', []]);
    const backgroundImport = render();

    backgroundImport.props?.onComplete?.({ staged: [] });
    const language = render();
    findElement(language, (element) => Boolean(element.props?.onSaved))?.props?.onSaved?.();
    const aiSetup = render();
    aiSetup.props?.onComplete?.();

    expect(textContent(render())).toContain("You're all set");
  });

  it('reaches Ready when the intake review is skipped with zero approvals', () => {
    hooks.reset(['intake', []]);
    const intake = render();

    intake.props?.onComplete?.();
    const ready = render();

    expect(textContent(ready)).toContain("You're all set");
  });
});
