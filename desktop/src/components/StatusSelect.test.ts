import { describe, expect, it, vi } from 'vitest';
import StatusSelect from './StatusSelect';
import { ChevronDownIcon } from './icons';

type ElementNode = { type?: unknown; props?: Record<string, unknown> & { children?: unknown } };

function findAll(node: unknown, match: (el: ElementNode) => boolean, out: ElementNode[] = []): ElementNode[] {
  if (Array.isArray(node)) { node.forEach((n) => findAll(n, match, out)); return out; }
  if (typeof node !== 'object' || node === null) return out;
  const el = node as ElementNode;
  if (match(el)) out.push(el);
  findAll(el.props?.children, match, out);
  return out;
}

function render() {
  return StatusSelect({ value: 'Evaluated', normStatus: 'evaluated', disabled: false, onChange: vi.fn() });
}

describe('StatusSelect', () => {
  it('draws its own chevron instead of the platform select arrow', () => {
    // WebView2 (Chromium) and WebKit paint the native <select> arrow
    // differently over a coloured pill; on Windows it broke the pill's
    // right edge. Hide the native one and draw a chevron that inherits the
    // pill text colour, so both platforms look the same.
    const tree = render();
    const select = findAll(tree, (el) => el.type === 'select')[0];
    expect(select).toBeDefined();
    const style = select.props?.style as Record<string, unknown>;
    expect(style.appearance).toBe('none');
    expect(style.WebkitAppearance).toBe('none');
    expect(parseInt(String(style.paddingRight ?? '0'), 10)).toBeGreaterThanOrEqual(24);
    expect(findAll(tree, (el) => el.type === ChevronDownIcon)).toHaveLength(1);
  });

  it('keeps the status colour on the pill and its chevron', () => {
    const tree = render();
    const select = findAll(tree, (el) => el.type === 'select')[0];
    const style = select.props?.style as Record<string, unknown>;
    expect(style.background).toBe('var(--status-evaluated, var(--color-surface-muted))');
    const wrapper = tree as ElementNode;
    expect(wrapper.type).toBe('span');
    expect((wrapper.props?.style as Record<string, unknown>).color).toBe('var(--status-evaluated-on, var(--color-text-primary))');
  });
});
