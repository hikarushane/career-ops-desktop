import { afterEach, describe, expect, it, vi } from 'vitest';
import AnalysisLanguageField from './AnalysisLanguageField';
import { setAnalysisLanguage } from '../api';

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
  return { ...actual, useEffect: () => {}, useState: hooks.useState };
});
vi.mock('../api', () => ({ languageSettings: vi.fn(), setAnalysisLanguage: vi.fn() }));

const mockedSetAnalysisLanguage = vi.mocked(setAnalysisLanguage);

afterEach(() => {
  vi.resetAllMocks();
  hooks.reset();
});

type ElementNode = {
  type?: unknown;
  props?: { children?: unknown; onClick?: () => void | Promise<void> };
};

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
  if (element.type === 'button' && element.props?.children === label) return element;
  return findButton(element.props?.children, label);
}

describe('AnalysisLanguageField', () => {
  it('uses the Rust no-follow command and completes only after its write succeeds', async () => {
    const onSaved = vi.fn();
    mockedSetAnalysisLanguage.mockResolvedValue(undefined);
    hooks.reset([[{ code: 'en', name: 'English' }, { code: 'fr', name: 'French' }], 'fr', false, null]);
    hooks.beginRender();
    const tree = AnalysisLanguageField({ root: '/workspace', onSaved }) as ElementNode;

    await findButton(tree, 'Save analysis language')?.props?.onClick?.();

    expect(mockedSetAnalysisLanguage).toHaveBeenCalledWith('/workspace', 'fr');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
