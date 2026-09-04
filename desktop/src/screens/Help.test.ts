import { afterEach, describe, expect, it, vi } from 'vitest';
import Help, { DESKTOP_REPO_URL, UPSTREAM_REPO_URL } from './Help';

const hooks = vi.hoisted(() => {
  let state: unknown[] = [];
  let cursor = 0;
  return {
    reset(initial: unknown[] = []) { state = initial; cursor = 0; },
    beginRender() { cursor = 0; },
    current() { return state; },
    useState(initial: unknown) {
      const index = cursor++;
      if (index === state.length) state.push(initial);
      return [state[index], (value: unknown) => { state[index] = value; }];
    },
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: hooks.useState, useEffect: () => {} };
});
vi.mock('react-markdown', () => ({ default: (props: unknown) => props }));
vi.mock('../api', () => ({ helpDocument: vi.fn(), languageSettings: vi.fn() }));
const opener = vi.hoisted(() => ({ openExternalUrl: vi.fn(async () => null) }));
vi.mock('../lib/opener', () => opener);

afterEach(() => { hooks.reset(); vi.clearAllMocks(); });

type Node = { type?: unknown; props?: Record<string, unknown> & { children?: unknown } };

function findAll(node: unknown, pred: (n: Node) => boolean, out: Node[] = []): Node[] {
  if (Array.isArray(node)) { for (const c of node) findAll(c, pred, out); return out; }
  if (typeof node !== 'object' || node === null) return out;
  const n = node as Node;
  if (pred(n)) out.push(n);
  findAll(n.props?.children, pred, out);
  return out;
}

// State order: open, document, documentError, guideLanguage, linkError
describe('Help', () => {
  it('lets the reader switch the full guide between Chinese and English', () => {
    hooks.reset([null, null, null, 'en', null]);
    hooks.beginRender();
    const tree = Help({ root: '/w' }) as Node;
    const radios = findAll(tree, (n) => n.props?.role === 'radio');
    expect(radios.map((r) => r.props?.['aria-checked'])).toEqual([false, true]);
    (radios[0].props?.onClick as () => void)();
    expect(hooks.current()[3]).toBe('zh-TW');
  });

  it('links to this fork and credits the upstream project, opening both externally', () => {
    hooks.reset([null, null, null, 'en', null]);
    hooks.beginRender();
    const tree = Help({ root: '/w' }) as Node;
    const links = findAll(tree, (n) => n.type === 'a');
    expect(links.map((l) => l.props?.href)).toEqual([DESKTOP_REPO_URL, UPSTREAM_REPO_URL]);
    const preventDefault = vi.fn();
    (links[1].props?.onClick as (e: { preventDefault: () => void }) => void)({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(opener.openExternalUrl).toHaveBeenCalledWith(UPSTREAM_REPO_URL);
    expect(JSON.stringify(tree)).toMatch(/fork of/);
  });
});
