import { afterEach, describe, expect, it, vi } from 'vitest';
import BackgroundImport from './BackgroundImport';

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
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../api', () => ({ stageIntakeFiles: vi.fn(), listIntakeCandidates: vi.fn() }));

afterEach(() => hooks.reset());

type ElementNode = {
  type?: unknown;
  props?: {
    children?: unknown;
    onClick?: () => void | Promise<void>;
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

describe('BackgroundImport', () => {
  it('returns the staged-file metadata when setup continues', () => {
    const staged = [{
      sourcePath: '/source/cv.pdf',
      destinationPath: 'documents/cv/cv.pdf',
      category: 'cv' as const,
      duplicate: false,
    }];
    const onComplete = vi.fn();
    hooks.reset([[], false, false, staged, null]);
    hooks.beginRender();
    const tree = BackgroundImport({ root: '/workspace', initialStaged: [], onComplete }) as ElementNode;

    const continueSetup = findButton(tree, 'Continue setup');
    expect(continueSetup).toBeDefined();
    continueSetup?.props?.onClick?.();

    expect(onComplete).toHaveBeenCalledWith({ staged });
  });

  it('reports unavailable PDF extraction while keeping the PDF staged', () => {
    const staged = [{
      sourcePath: '/source/cv.pdf',
      destinationPath: 'documents/cv/cv.pdf',
      category: 'cv' as const,
      duplicate: false,
    }];
    hooks.reset([[], false, false, staged, null]);
    hooks.beginRender();

    const tree = BackgroundImport({ root: '/workspace', initialStaged: [], onComplete: vi.fn() }) as ElementNode;
    const copy = textContent(tree);

    expect(copy).toContain('PDF text extraction is unavailable in this build');
    expect(copy).toContain('still staged');
    expect(copy).not.toMatch(/brew|Homebrew|poppler/i);
  });

  it('renders the staged summary immediately when files were staged earlier', () => {
    const initialStaged = [{
      sourcePath: '/s/cv.md',
      destinationPath: '/w/documents/cv/cv.md',
      category: 'cv' as const,
      duplicate: false,
    }];
    hooks.reset([[], false, false, initialStaged, null]);
    hooks.beginRender();
    const tree = BackgroundImport({ root: '/w', initialStaged, onComplete: vi.fn() }) as ElementNode;

    const text = textContent(tree);
    expect(text).toMatch(/1\s+file\s+staged for review/);
    expect(findButton(tree, 'Continue setup')).toBeDefined();
  });

  it('lists Other as a destination category', () => {
    hooks.reset([[], false, false, null, null]);
    hooks.beginRender();
    const tree = BackgroundImport({ root: '/w', initialStaged: [], onComplete: vi.fn() }) as ElementNode;
    expect(textContent(tree)).toContain('Other');
  });
});
