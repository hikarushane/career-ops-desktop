import { afterEach, describe, expect, it, vi } from 'vitest';
import JdPreview from './JdPreview';
import FilePreview from './FilePreview';

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
      return [state[index], (value: unknown) => { state[index] = typeof value === 'function' ? (value as (v: unknown) => unknown)(state[index]) : value; }];
    },
  };
});
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: hooks.useState, useEffect: () => {} };
});
vi.mock('../api', () => ({ listWorkspaceFiles: vi.fn(), readWorkspaceFile: vi.fn() }));
afterEach(() => hooks.reset());

type Node = { type?: unknown; props?: Record<string, unknown> & { children?: unknown } };
function find(node: unknown, pred: (n: Node) => boolean): Node | undefined {
  if (Array.isArray(node)) { for (const c of node) { const f = find(c, pred); if (f) return f; } return undefined; }
  if (typeof node !== 'object' || node === null) return undefined;
  const n = node as Node;
  return pred(n) ? n : find(n.props?.children, pred);
}

// State order: files, open
describe('JdPreview', () => {
  const jds = [{ path: 'jds/019-2026-09-04_acme_pm.md', name: '019-2026-09-04_acme_pm.md', modified: 1 }];

  it('offers the capture that carries the report number and opens it inline', () => {
    hooks.reset([jds, false]);
    hooks.beginRender();
    let tree = JdPreview({ root: '/w', reportNumber: '19' }) as Node;
    const button = find(tree, (n) => n.type === 'button')!;
    expect(button.props?.disabled).toBe(false);
    expect(JSON.stringify(button.props?.children)).toContain('View job description');
    (button.props?.onClick as () => void)();
    expect(hooks.current()[1]).toBe(true);
    hooks.beginRender();
    tree = JdPreview({ root: '/w', reportNumber: '19' }) as Node;
    expect(find(tree, (n) => n.type === FilePreview)?.props?.relative).toBe('jds/019-2026-09-04_acme_pm.md');
  });

  it('disables the button when the row has no capture', () => {
    hooks.reset([jds, false]);
    hooks.beginRender();
    const tree = JdPreview({ root: '/w', reportNumber: '020' }) as Node;
    const button = find(tree, (n) => n.type === 'button')!;
    expect(button.props?.disabled).toBe(true);
    expect(JSON.stringify(button.props?.children)).toContain('No JD capture');
  });
});
