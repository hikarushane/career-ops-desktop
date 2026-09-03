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
  getModelCatalog: vi.fn(async () => ({ models: [], degraded: false })),
}));
// Real fastModeAllowed so "disables fast mode for non-opus models" actually
// exercises the opus/non-opus distinction instead of trivially passing.
vi.mock('../lib/models', async (orig) => ({
  ...(await orig<typeof import('../lib/models')>()),
  getModelCatalog: modelsLib.getModelCatalog,
}));

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

function findById(node: unknown, id: string): ElementNode | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findById(child, id);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== 'object' || node === null) return undefined;
  const element = node as ElementNode;
  if (element.props?.id === id) return element;
  return findById(element.props?.children, id);
}

// State order: tab, providers, preferredId, model, effort, fastMode, updateCheck,
// catalog, catalogState, customModel, settingsLoaded, rawFilesError
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
  if (element.type === 'button' && textContent(element.props?.children) === label) return element;
  return findButton(element.props?.children, label);
}

const CLAUDE_PROVIDER = { id: 'claude', displayName: 'Claude Code', binary: 'claude', headlessCmd: 'claude -p', state: 'ready' };
const CATALOG = [
  { id: 'opus', label: 'Opus', available: true, fast: true },
  { id: 'haiku', label: 'Haiku', available: true, fast: false },
];

describe('ProfileSettings AI tab', () => {
  it('disables fast mode for non-opus models and lists only available models', () => {
    hooks.reset(['ai', [CLAUDE_PROVIDER], 'claude', 'haiku', 'medium', false, { status: 'idle' },
      CATALOG, 'ready', false, true, null]);
    hooks.beginRender();
    const tree = ProfileSettings({ root: '/w', onWorkspaceChanged: vi.fn() }) as ElementNode;
    const toggle = findByRole(tree, 'switch');
    expect(toggle?.props?.disabled).toBe(true);
    const select = findSelect(tree, 'ai-model');
    expect(textContent(select)).toMatch(/Opus/);
    expect(textContent(select)).toMatch(/Custom/);
  });

  it('enables fast mode for an opus model', () => {
    hooks.reset(['ai', [CLAUDE_PROVIDER], 'claude', 'opus', 'medium', false, { status: 'idle' },
      CATALOG, 'ready', false, true, null]);
    hooks.beginRender();
    const tree = ProfileSettings({ root: '/w', onWorkspaceChanged: vi.fn() }) as ElementNode;
    const toggle = findByRole(tree, 'switch');
    expect(toggle?.props?.disabled).toBe(false);
  });

  it('shows a degraded-probe hint when the catalog could not be verified', () => {
    hooks.reset(['ai', [CLAUDE_PROVIDER], 'claude', 'haiku', 'medium', false, { status: 'idle' },
      CATALOG, 'error', false, true, null]);
    hooks.beginRender();
    const tree = ProfileSettings({ root: '/w', onWorkspaceChanged: vi.fn() }) as ElementNode;
    expect(textContent(tree)).toMatch(/Could not verify models; showing defaults\./);
  });

  // NOTE: this only proves the RENDER honors an already-true customModel;
  // it cannot exercise the derivation effects themselves (useEffect bodies
  // never run under this positional-hook harness), so it does not by itself
  // prove the derivation can no longer flip customModel back to false — that
  // guarantee comes from the source read (`if (...) setCustomModel(true)`
  // never calls setCustomModel(false)).
  it('keeps an explicit Custom selection when the model is already in the catalog', () => {
    hooks.reset(['ai', [CLAUDE_PROVIDER], 'claude', 'haiku', 'medium', false, { status: 'idle' },
      CATALOG, 'ready', true, true, null]);
    hooks.beginRender();
    const tree = ProfileSettings({ root: '/w', onWorkspaceChanged: vi.fn() }) as ElementNode;
    const select = findSelect(tree, 'ai-model');
    expect(select?.props?.value).toBe('__custom');
    const customInput = findById(tree, 'ai-model-custom');
    expect(customInput).toBeDefined();
  });
});

describe('ProfileSettings background tab', () => {
  it('surfaces an opener scope failure when opening raw files fails', async () => {
    workspaceLib.openWorkspaceFolder.mockRejectedValue(new Error('ForbiddenPath'));
    hooks.reset(['background', [], null, '', 'medium', false, { status: 'idle' }, [], 'ready', false, true, null]);
    hooks.beginRender();
    const initial = ProfileSettings({ root: '/w', onWorkspaceChanged: vi.fn() }) as ElementNode;

    await findButton(initial, 'Open raw files')?.props?.onClick?.();

    hooks.beginRender();
    const updated = ProfileSettings({ root: '/w', onWorkspaceChanged: vi.fn() }) as ElementNode;
    expect(findByRole(updated, 'alert')?.props?.children).toBe('ForbiddenPath');
  });
});
