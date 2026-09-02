import { afterEach, describe, expect, it, vi } from 'vitest';
import Onboarding from './Onboarding';
import { EMPTY_PREFERENCES } from '../lib/jobPreferences';

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
    onContinue?: () => void;
    onSaved?: () => void;
    onSkip?: () => void;
    onBack?: () => void;
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
  it('runs profile generation after staged background reaches a ready AI provider', () => {
    hooks.reset(['import', [], EMPTY_PREFERENCES]);
    const tree = render();

    findElement(tree, (el) => Boolean(el.props?.onComplete))?.props?.onComplete?.({
      staged: [
        { sourcePath: '/source/cv.pdf', destinationPath: 'documents/cv/cv.pdf', category: 'cv', duplicate: false },
        { sourcePath: '/source/work.pdf', destinationPath: 'documents/work/work.pdf', category: 'work', duplicate: false },
        { sourcePath: '/source/paper.pdf', destinationPath: 'documents/research/paper.pdf', category: 'research', duplicate: false },
      ],
    });
    const language = render();
    findElement(language, (element) => Boolean(element.props?.onSaved))?.props?.onSaved?.();
    const aiTree = render();
    findElement(aiTree, (el) => Boolean(el.props?.onComplete))?.props?.onComplete?.();

    const prefsTree = render();
    findElement(prefsTree, (el) => Boolean(el.props?.onContinue))?.props?.onContinue?.();

    const genTree = render();
    const gen = findElement(genTree, (el) => (el.type as { name?: string })?.name === 'ProfileGeneration');

    expect((gen?.type as { name?: string })?.name).toBe('ProfileGeneration');

    gen?.props?.onComplete?.();
    expect(textContent(render())).toContain("You're all set");
  });

  it('skips generating and reaches Ready when no background was staged', () => {
    hooks.reset(['import', [], EMPTY_PREFERENCES]);
    const tree = render();

    findElement(tree, (el) => Boolean(el.props?.onComplete))?.props?.onComplete?.({ staged: [] });
    const language = render();
    findElement(language, (element) => Boolean(element.props?.onSaved))?.props?.onSaved?.();
    const aiTree = render();
    findElement(aiTree, (el) => Boolean(el.props?.onComplete))?.props?.onComplete?.();

    const prefsTree = render();
    findElement(prefsTree, (el) => Boolean(el.props?.onContinue))?.props?.onContinue?.();

    expect(textContent(render())).toContain("You're all set");
  });

  it('reaches Ready when profile generation completes', () => {
    hooks.reset(['generating', [], EMPTY_PREFERENCES]);
    const tree = render();
    const gen = findElement(tree, (el) => Boolean(el.props?.onComplete));

    gen?.props?.onComplete?.();
    const ready = render();

    expect(textContent(ready)).toContain("You're all set");
  });

  it('skips generation when nothing was staged', () => {
    hooks.reset(['preferences', [], EMPTY_PREFERENCES]);
    const tree = render();
    findElement(tree, (el) => Boolean(el.props?.onContinue))?.props?.onContinue?.();
    const next = render();
    expect(textContent(next)).toContain("You're all set");
  });
});
