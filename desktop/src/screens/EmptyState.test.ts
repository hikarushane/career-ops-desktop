import { describe, expect, it, vi } from 'vitest';
import EmptyState from './EmptyState';

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object' || node === null) return '';
  return textContent((node as { props?: { children?: unknown } }).props?.children);
}

describe('EmptyState', () => {
  it('describes recoverable Desktop workspace setup without obsolete CLI onboarding copy', () => {
    const tree = EmptyState({
      root: '/workspace',
      missing: ['data/applications.md'],
      onPick: vi.fn(),
    });
    const text = textContent(tree);

    expect(text).toContain('CareerOps Desktop');
    expect(text).toContain('choose its current location');
    expect(text).not.toContain('Onboarding happens in the CLI');
    expect(text).not.toContain('AI coding CLI');
  });
});
