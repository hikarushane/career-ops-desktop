import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ models: vi.fn(), store: new Map<string, unknown>() }));
vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), models: m.models }));
vi.mock('@tauri-apps/plugin-store', () => ({ load: async () => ({ get: async (k: string) => m.store.get(k), set: async (k: string, v: unknown) => { m.store.set(k, v); } }) }));
import { fastModeAllowed, getModelCatalog } from './models';

beforeEach(() => { m.store.clear(); m.models.mockReset(); });

describe('getModelCatalog', () => {
  it('probes, keeps only available models, and caches for 24h', async () => {
    m.models.mockResolvedValue({ ok: true, provider: 'claude', probedAt: 'x', models: [
      { id: 'opus', label: 'Opus', available: true, fast: true }, { id: 'fable', label: 'Fable', available: false, fast: false }] });
    const first = await getModelCatalog('claude', { force: false });
    expect(first.models.map((x) => x.id)).toEqual(['opus']);
    expect(first.degraded).toBe(false);
    expect(m.models).toHaveBeenCalledWith('claude', true);
    const second = await getModelCatalog('claude', { force: false });
    expect(second.degraded).toBe(false);
    expect(m.models).toHaveBeenCalledTimes(1);
    await getModelCatalog('claude', { force: true });
    expect(m.models).toHaveBeenCalledTimes(2);
  });
  it('returns unverified candidates when probing fails', async () => {
    m.models.mockResolvedValue({ ok: false, error: 'network', message: 'offline' });
    const result = await getModelCatalog('codex', { force: true });
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models.every((x) => x.available === null)).toBe(true);
    expect(result.degraded).toBe(true);
    expect(m.store.size).toBe(0);
  });
});

describe('fastModeAllowed', () => {
  it('is true only for claude opus models', () => {
    const cat = [{ id: 'opus', label: 'Opus', available: true, fast: true }, { id: 'haiku', label: 'Haiku', available: true, fast: false }];
    expect(fastModeAllowed('claude', 'opus', cat)).toBe(true);
    expect(fastModeAllowed('claude', 'haiku', cat)).toBe(false);
    expect(fastModeAllowed('claude', 'claude-opus-5', cat)).toBe(true);
    expect(fastModeAllowed('codex', 'opus', cat)).toBe(false);
    expect(fastModeAllowed('claude', '', cat)).toBe(false);
  });
});
