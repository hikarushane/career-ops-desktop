import { afterEach, describe, expect, it, vi } from 'vitest';
import ProfileGeneration from './ProfileGeneration';
import { EMPTY_PREFERENCES } from '../lib/jobPreferences';
import type { GenerationResult } from '../api';

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
    useState: hooks.useState,
    useEffect: () => {},
    useCallback: (fn: unknown) => fn,
    useRef: (v: unknown) => ({ current: v }),
  };
});

const api = vi.hoisted(() => ({
  generateProfile: vi.fn(),
  applyGeneration: vi.fn(),
  discardGeneration: vi.fn(),
  cancelTask: vi.fn(),
  languageSettings: vi.fn(),
}));
vi.mock('../lib/runner', () => ({ generateProfile: api.generateProfile, cancelTask: api.cancelTask }));
vi.mock('../api', () => ({ applyGeneration: api.applyGeneration, discardGeneration: api.discardGeneration, languageSettings: api.languageSettings }));

afterEach(() => hooks.reset());

type ElementNode = {
  type?: unknown;
  props?: {
    onClick?: () => void | Promise<void>;
    onComplete?: () => void;
    onSkip?: () => void;
    disabled?: boolean;
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

const completeResult: GenerationResult = {
  taskId: 'task-1',
  complete: true,
  files: [
    { path: 'cv.md', content: '# CV\n', valid: true, issue: null },
    { path: 'config/profile.yml', content: 'candidate: {}\n', valid: true, issue: null },
    { path: 'modes/_profile.md', content: '# Profile\n', valid: true, issue: null },
    { path: 'portals.yml', content: 'title_filter: {}\n', valid: true, issue: null },
  ],
};

function render() {
  hooks.beginRender();
  return ProfileGeneration({ root: '/w', preferences: EMPTY_PREFERENCES, onComplete: vi.fn(), onSkip: vi.fn() }) as ElementNode;
}

describe('ProfileGeneration', () => {
  it('shows a preview with one tab per generated file when generation completes', () => {
    hooks.reset(['preview', 'task-1', ['cv.md'], completeResult, 'cv.md', null, false, false, '']);
    const tree = render();
    const text = textContent(tree);
    expect(text).toContain('Review your profile');
    expect(text).toContain('portals.yml');
    expect(text).toContain('# CV');
    expect(findElement(tree, (el) => textContent(el) === 'Apply')).toBeTruthy();
  });

  it('flags files the deterministic check rejected', () => {
    const invalid = { ...completeResult, complete: false, files: completeResult.files.map((f, i) => (i === 1 ? { ...f, valid: false, issue: 'YAML does not parse' } : f)) };
    hooks.reset(['preview', 'task-1', [], invalid, 'config/profile.yml', null, false, false, '']);
    const text = textContent(render());
    expect(text).toContain('YAML does not parse');
  });

  it('applies the staged files and completes', async () => {
    api.applyGeneration.mockResolvedValue(['cv.md']);
    const onComplete = vi.fn();
    hooks.reset(['preview', 'task-1', [], completeResult, 'cv.md', null, false, false, '']);
    const tree = ProfileGeneration({ root: '/w', preferences: EMPTY_PREFERENCES, onComplete, onSkip: vi.fn() }) as ElementNode;
    const apply = findElement(tree, (el) => textContent(el) === 'Apply');
    await (apply?.props as { onClick?: () => Promise<void> }).onClick?.();
    expect(api.applyGeneration).toHaveBeenCalledWith('task-1');
    expect(onComplete).toHaveBeenCalled();
  });

  it('shows the error with retry and skip when generation fails', () => {
    hooks.reset(['error', null, [], null, 'cv.md', 'AI provider authentication failed.', false, false, '']);
    const tree = render();
    expect(textContent(tree)).toContain('authentication failed');
    expect(findElement(tree, (el) => textContent(el) === 'Try again')).toBeTruthy();
    expect(findElement(tree, (el) => textContent(el) === 'Skip for now')).toBeTruthy();
  });

  it('counts written files while running', () => {
    hooks.reset(['running', 'task-1', ['cv.md', 'config/profile.yml'], null, 'cv.md', null, false, false, '']);
    hooks.beginRender();
    const tree = ProfileGeneration({ root: '/w', preferences: EMPTY_PREFERENCES, onComplete: vi.fn(), onSkip: vi.fn() }) as ElementNode;
    expect(textContent(tree)).toMatch(/2 of 4 files written/);
  });

  it('opens the feedback dialog and regenerates with the typed instructions', async () => {
    const result: GenerationResult = { taskId: 'task-1', complete: true, files: [
      { path: 'cv.md', content: '# CV', valid: true, issue: null },
      { path: 'config/profile.yml', content: 'a: 1', valid: true, issue: null },
      { path: 'modes/_profile.md', content: '# P', valid: true, issue: null },
      { path: 'portals.yml', content: 'b: 2', valid: true, issue: null },
    ] };
    hooks.reset(['preview', 'task-1', [], result, 'cv.md', null, false, true, 'Shorter summary']);
    hooks.beginRender();
    api.languageSettings.mockResolvedValue({ analysisLanguage: 'en', options: [] });
    api.generateProfile.mockResolvedValue(result);
    api.discardGeneration.mockResolvedValue(undefined);
    const tree = ProfileGeneration({ root: '/w', preferences: EMPTY_PREFERENCES, onComplete: vi.fn(), onSkip: vi.fn() }) as ElementNode;
    const send = findElement(tree, (el) => textContent(el) === 'Regenerate');
    expect(send).toBeDefined();
    await send?.props?.onClick?.();
    expect(api.generateProfile).toHaveBeenCalledWith('/w', expect.any(String), 'en', expect.any(Object),
      expect.objectContaining({ instructions: 'Shorter summary', previous: expect.objectContaining({ 'cv.md': '# CV' }) }),
      'profile-generate');
    // Let the success path's deferred discardGeneration(previous.taskId) settle so it
    // cannot leak into a later test's assertions on the same shared mock.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('keeps the reviewed draft on screen when a feedback regeneration fails', async () => {
    const failure = new Error('AI provider authentication failed.');
    api.discardGeneration.mockClear();
    hooks.reset(['preview', 'task-1', [], completeResult, 'cv.md', null, false, true, 'Shorter summary']);
    hooks.beginRender();
    api.languageSettings.mockResolvedValue({ analysisLanguage: 'en', options: [] });
    api.generateProfile.mockRejectedValueOnce(failure);
    const tree = ProfileGeneration({ root: '/w', preferences: EMPTY_PREFERENCES, onComplete: vi.fn(), onSkip: vi.fn() }) as ElementNode;
    const send = findElement(tree, (el) => textContent(el) === 'Regenerate');
    expect(send).toBeDefined();
    await send?.props?.onClick?.();
    // Flush the rest of the failed generate() chain (the catch block runs one
    // microtask tick after generateProfile's rejection is observed).
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.discardGeneration).not.toHaveBeenCalledWith('task-1');

    hooks.beginRender();
    const restored = ProfileGeneration({ root: '/w', preferences: EMPTY_PREFERENCES, onComplete: vi.fn(), onSkip: vi.fn() }) as ElementNode;
    const text = textContent(restored);
    expect(text).toContain('Review your profile');
    expect(text).toContain('# CV');
    expect(text).toContain(failure.message);
  });
});
