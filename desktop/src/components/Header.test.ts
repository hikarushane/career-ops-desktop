import { describe, expect, it, vi } from 'vitest';
import Header from './Header';
import type { UpdateState } from '../lib/updater';

type ElementNode = { type?: unknown; props?: Record<string, unknown> & { children?: unknown } };

function findAll(node: unknown, match: (el: ElementNode) => boolean, out: ElementNode[] = []): ElementNode[] {
  if (Array.isArray(node)) { node.forEach((n) => findAll(n, match, out)); return out; }
  if (typeof node !== 'object' || node === null) return out;
  const el = node as ElementNode;
  if (match(el)) out.push(el);
  findAll(el.props?.children, match, out);
  return out;
}

function render(over: Partial<Parameters<typeof Header>[0]> = {}) {
  return Header({
    title: 'Jobs',
    root: 'D:/shane_yeh/Documents/CareerOps',
    onReload: vi.fn(),
    onChangeFolder: vi.fn(),
    tasks: [],
    onOpenTask: vi.fn(),
    onDismissTask: vi.fn(),
    ...over,
  });
}

describe('Header', () => {
  it('reloads without forwarding the click event', () => {
    // App's reload takes an optional workspace path. Handing it the click
    // event made the sidecar call reject silently, so Reload did nothing.
    const onReload = vi.fn();
    const tree = render({ onReload });
    const button = findAll(tree, (el) => el.type === 'button' && el.props?.['aria-label'] === 'Reload')[0];
    expect(button).toBeDefined();
    (button.props?.onClick as (e: unknown) => void)({ type: 'click', target: {} });
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onReload).toHaveBeenCalledWith();
  });

  it('shows the workspace folder name and full path', () => {
    const tree = render();
    const name = findAll(tree, (el) => (el.props?.className as string) === 'workspace-name')[0];
    const path = findAll(tree, (el) => (el.props?.className as string) === 'workspace-path')[0];
    expect(name?.props?.children).toBe('CareerOps');
    expect(path?.props?.children).toBe('D:/shane_yeh/Documents/CareerOps');
  });

  it('renders the update badge only when both state and handler are given', () => {
    const state: UpdateState = { status: 'available', currentVersion: '0.5.1', availableVersion: '0.5.2' };
    const without = render({ updateState: state });
    const withBoth = render({ updateState: state, onUpdateClick: vi.fn() });
    const badgeOf = (tree: unknown) => findAll(tree, (el) => typeof el.type === 'function' && (el.type as { name?: string }).name === 'UpdateBadge');
    expect(badgeOf(without)).toHaveLength(0);
    expect(badgeOf(withBoth)).toHaveLength(1);
  });
});
