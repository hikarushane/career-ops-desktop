import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiSetup from './AiSetup';
import type { ProviderEntry } from '../api';

const hooks = vi.hoisted(() => {
  let state: unknown[] = [];
  let refs: { current: unknown }[] = [];
  let cursor = 0;
  let refCursor = 0;
  return {
    reset(initial: unknown[] = []) {
      state = initial;
      refs = [];
      cursor = 0;
      refCursor = 0;
    },
    beginRender() {
      cursor = 0;
      refCursor = 0;
    },
    useState(initial: unknown) {
      const index = cursor++;
      if (index === state.length) state.push(initial);
      return [state[index], (value: unknown) => { state[index] = value; }];
    },
    // Refs must survive a re-render, or the poll handle would be lost and
    // nothing could ever clear the interval.
    useRef(initial: unknown) {
      const index = refCursor++;
      if (index === refs.length) refs.push({ current: initial });
      return refs[index];
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
    useRef: hooks.useRef,
  };
});

const api = vi.hoisted(() => ({
  openProviderInstaller: vi.fn(),
  detectProviders: vi.fn(),
  getReadyProviders: vi.fn(() => []),
  setPreferredId: vi.fn(),
  openUrl: vi.fn(),
}));
vi.mock('../api', () => ({ openProviderInstaller: api.openProviderInstaller }));
vi.mock('../lib/providers', () => ({
  detectProviders: api.detectProviders,
  getReadyProviders: api.getReadyProviders,
  setPreferredId: api.setPreferredId,
}));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: api.openUrl }));

const NOT_INSTALLED: ProviderEntry = {
  id: 'claude',
  displayName: 'Claude Code',
  binary: 'claude',
  headlessCmd: 'claude -p',
  state: 'not_installed',
  website: 'https://docs.anthropic.com/en/docs/claude-code/getting-started',
};
const READY: ProviderEntry = { ...NOT_INSTALLED, state: 'ready', version: '2.0.0' };
const LAUNCHED = 'irm https://claude.ai/install.ps1 | iex ; claude auth login';

beforeEach(() => {
  api.openProviderInstaller.mockReset();
  api.detectProviders.mockReset().mockResolvedValue([NOT_INSTALLED]);
  api.getReadyProviders.mockReset().mockReturnValue([]);
});
afterEach(() => {
  hooks.reset();
  vi.useRealTimers();
});

type ElementNode = {
  type?: unknown;
  props?: { onClick?: () => void | Promise<void>; children?: unknown };
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

/** State order in AiSetup: providers, loading, selected, install. */
function seed(providers: ProviderEntry[] = [NOT_INSTALLED], install: unknown = null) {
  hooks.reset([providers, false, null, install]);
}

function render() {
  hooks.beginRender();
  return AiSetup({ onComplete: vi.fn() }) as ElementNode;
}

function installButton(tree: ElementNode) {
  return findElement(tree, (el) => el.type === 'button' && textContent(el).trim() === 'Install');
}

describe('AiSetup install button', () => {
  it('asks Rust to open a terminal for the clicked provider', async () => {
    api.openProviderInstaller.mockResolvedValue(LAUNCHED);
    seed();

    await installButton(render())?.props?.onClick?.();

    expect(api.openProviderInstaller).toHaveBeenCalledWith('claude');
  });

  it('shows the terminal hint and the launched command line on success', async () => {
    api.openProviderInstaller.mockResolvedValue(LAUNCHED);
    seed();

    await installButton(render())?.props?.onClick?.();
    const text = textContent(render());

    expect(text).toContain('Installer opened in a terminal window');
    expect(text).toContain(LAUNCHED);
    expect(text).not.toContain('Most providers install');
  });

  it('shows the error and the website fallback when the terminal cannot open', async () => {
    api.openProviderInstaller.mockRejectedValue(new Error('unknown provider: claude'));
    seed();

    await installButton(render())?.props?.onClick?.();
    const text = textContent(render());

    expect(text).toContain('unknown provider: claude');
    expect(text).toContain('visit website');
  });

  it('stops re-detecting once the provider reports ready', async () => {
    vi.useFakeTimers();
    api.openProviderInstaller.mockResolvedValue(LAUNCHED);
    seed();

    await installButton(render())?.props?.onClick?.();
    expect(api.detectProviders).not.toHaveBeenCalled();

    // Still not installed: polling continues.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(api.detectProviders).toHaveBeenCalledTimes(1);

    api.detectProviders.mockResolvedValue([READY]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(api.detectProviders).toHaveBeenCalledTimes(2);

    // The interval is cleared, so no further detection happens.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.detectProviders).toHaveBeenCalledTimes(2);
  });
});
