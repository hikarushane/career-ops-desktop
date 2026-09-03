import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({ openUrl: vi.fn(async () => {}) }));
vi.mock('@tauri-apps/plugin-opener', () => plugin);

import { openJobUrl } from './opener';

describe('opening a job posting in the default browser', () => {
  it('grants the opener plugin the http/https url scope', () => {
    // opener:allow-open-url alone has no url scope, so open_url rejects every
    // https:// link with ForbiddenUrl — the "Open posting does nothing" bug.
    const caps = JSON.parse(readFileSync(new URL('../../src-tauri/capabilities/default.json', import.meta.url), 'utf8'));
    expect(caps.permissions).toContain('opener:allow-default-urls');
  });

  it('returns null on success and the error text when the plugin refuses', async () => {
    expect(await openJobUrl('https://a')).toBeNull();
    expect(plugin.openUrl).toHaveBeenCalledWith('https://a');
    plugin.openUrl.mockRejectedValueOnce(new Error('forbidden url'));
    expect(await openJobUrl('https://b')).toMatch(/forbidden url/);
  });
});
