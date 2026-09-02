import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock('@tauri-apps/plugin-store', () => ({
  load: async () => ({
    get: async (k: string) => (m.store.has(k) ? m.store.get(k) : undefined),
    set: async (k: string, v: unknown) => { m.store.set(k, v); },
    delete: async (k: string) => m.store.delete(k),
  }),
}));

import {
  getModel, setModel, getFastMode, setFastMode, setPreferredId,
} from './providers';

beforeEach(() => { m.store.clear(); });

describe('per-provider model/fast-mode storage', () => {
  it('isolates model and fast-mode settings between providers', async () => {
    await setPreferredId('claude');
    await setModel('opus');
    await setFastMode(true);

    await setPreferredId('codex');
    expect(await getModel()).toBe('');
    expect(await getFastMode()).toBe(false);
    await setModel('gpt-5');
    await setFastMode(false);

    await setPreferredId('claude');
    expect(await getModel()).toBe('opus');
    expect(await getFastMode()).toBe(true);

    await setPreferredId('codex');
    expect(await getModel()).toBe('gpt-5');
    expect(await getFastMode()).toBe(false);
  });

  it('falls back to the legacy default key when no provider is preferred', async () => {
    await setModel('haiku');
    expect(m.store.get('ai-model.default')).toBe('haiku');
    expect(await getModel()).toBe('haiku');
  });

  it('migrates a legacy global value to the preferred provider on first read, then deletes it', async () => {
    m.store.set('ai-model', 'legacy-model');
    m.store.set('ai-fast-mode', true);
    await setPreferredId('claude');

    expect(await getModel()).toBe('legacy-model');
    expect(m.store.get('ai-model.claude')).toBe('legacy-model');
    expect(m.store.has('ai-model')).toBe(false);

    expect(await getFastMode()).toBe(true);
    expect(m.store.get('ai-fast-mode.claude')).toBe(true);
    expect(m.store.has('ai-fast-mode')).toBe(false);
  });

  it('does not re-migrate a legacy value to a second provider once consumed', async () => {
    m.store.set('ai-model', 'legacy-model');
    await setPreferredId('claude');
    expect(await getModel()).toBe('legacy-model');

    await setPreferredId('codex');
    expect(await getModel()).toBe('');
  });
});
