import { afterEach, describe, expect, it, vi } from 'vitest';
import ProfileSettings from './ProfileSettings';

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
    useCallback: <T,>(callback: T) => callback,
  };
});

const providersLib = vi.hoisted(() => ({
  detectProviders: vi.fn(async () => []),
  getPreferredId: vi.fn(async () => null),
  setPreferredId: vi.fn(async () => {}),
  getModel: vi.fn(async () => ''),
  setModel: vi.fn(async () => {}),
  getEffort: vi.fn(async () => 'medium'),
  setEffort: vi.fn(async () => {}),
  getFastMode: vi.fn(async () => false),
  setFastMode: vi.fn(async () => {}),
}));
vi.mock('../lib/providers', () => providersLib);

const modelsLib = vi.hoisted(() => ({
  getModelCatalog: vi.fn(async () => []),
  fastModeAllowed: vi.fn(() => false),
}));
vi.mock('../lib/models', () => modelsLib);

const updaterLib = vi.hoisted(() => ({
  initialState: vi.fn(() => ({ status: 'idle' })),
  checkForUpdate: vi.fn(async () => {}),
}));
vi.mock('../lib/updater', () => updaterLib);

const workspaceLib = vi.hoisted(() => ({
  openWorkspaceFolder: vi.fn(async () => {}),
}));
vi.mock('../lib/workspace', () => workspaceLib);

vi.mock('../components/AnalysisLanguageField', () => ({ default: () => null }));
vi.mock('./WorkspaceSettings', () => ({ default: () => null }));

afterEach(() => {
  hooks.reset();
  vi.clearAllMocks();
});

type ElementNode = {
  type?: unknown;
  props?: {
    children?: unknown;
    id?: string;
    role?: string;
    disabled?: boolean;
    value?: unknown;
    onClick?: () => void | Promise<void>;
  };
};

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object' || node === null) return '';
  return textContent((node as ElementNode).props?.children);
}

function findByRole(node: unknown, role: string): ElementNode | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByRole(child, role);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== 'object' || node === null) return undefined;
  const element = node as ElementNode;
  if (element.props?.role === role) return element;
  return findByRole(element.props?.children, role);
}

function findSelect(node: unknown, id: string): ElementNode | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findSelect(child, id);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== 'object' || node === null) return undefined;
  const element = node as ElementNode;
  if (element.type === 'select' && element.props?.id === id) return element;
  return findSelect(element.props?.children, id);
}

describe('ProfileSettings AI tab', () => {
  it('disables fast mode for non-opus models and lists only available models', () => {
    hooks.reset(['ai', [{ id: 'claude', displayName: 'Claude Code', binary: 'claude', headlessCmd: 'claude -p', state: 'ready' }], 'claude', 'haiku', 'medium', false, { status: 'idle' },
      [{ id: 'opus', label: 'Opus', available: true, fast: true }, { id: 'haiku', label: 'Haiku', available: true, fast: false }], 'ready', false]);
    hooks.beginRender();
    const tree = ProfileSettings({ root: '/w', onWorkspaceChanged: vi.fn() }) as ElementNode;
    const toggle = findByRole(tree, 'switch');
    expect(toggle?.props?.disabled).toBe(true);
    const select = findSelect(tree, 'ai-model');
    expect(textContent(select)).toMatch(/Opus/);
    expect(textContent(select)).toMatch(/Custom/);
  });
});
