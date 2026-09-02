import { providers, installProvider as apiInstall, isError, type ProviderEntry, type InstallResult } from '../api';
import { load } from '@tauri-apps/plugin-store';

const STORE_KEY = 'preferred-provider';
const MODEL_KEY = 'ai-model';
const EFFORT_KEY = 'ai-effort';
const FAST_KEY = 'ai-fast-mode';

export type EffortLevel = 'low' | 'medium' | 'high';

let cached: ProviderEntry[] = [];

export async function detectProviders(): Promise<ProviderEntry[]> {
  const r = await providers();
  if (!isError(r)) cached = r.providers;
  return cached;
}

export function getCachedProviders(): readonly ProviderEntry[] {
  return cached;
}

export function getReadyProviders(): ProviderEntry[] {
  return cached.filter((p) => p.state === 'ready');
}

export async function getPreferredId(): Promise<string | null> {
  const store = await load('settings.json', { autoSave: true });
  return (await store.get<string>(STORE_KEY)) ?? null;
}

export async function setPreferredId(id: string): Promise<void> {
  const store = await load('settings.json', { autoSave: true });
  await store.set(STORE_KEY, id);
}

export async function getPreferredProvider(): Promise<ProviderEntry | null> {
  const id = await getPreferredId();
  if (!id) return getReadyProviders()[0] ?? null;
  return cached.find((p) => p.id === id && p.state === 'ready') ?? getReadyProviders()[0] ?? null;
}

/** Key suffix for the currently preferred provider, or 'default' when none is set. */
async function providerKeySuffix(): Promise<string> {
  return (await getPreferredId()) ?? 'default';
}

/**
 * Reads a per-provider setting, migrating a legacy global value on first
 * read: model and fast-mode choices used to be stored under one shared key
 * across all providers, which meant switching provider silently carried
 * over an unrelated model id or fast-mode flag. Each provider now gets its
 * own key (`${legacyKey}.${providerId}`); an existing legacy value is
 * adopted once for whichever provider happens to read it first, then
 * deleted so it cannot be re-migrated to a different provider later.
 */
async function getPerProviderSetting<T>(legacyKey: string, fallback: T): Promise<T> {
  const store = await load('settings.json', { autoSave: true });
  const suffix = await providerKeySuffix();
  const scopedKey = `${legacyKey}.${suffix}`;
  const scoped = await store.get<T>(scopedKey);
  if (scoped !== undefined && scoped !== null) return scoped;
  const legacy = await store.get<T>(legacyKey);
  if (legacy !== undefined && legacy !== null) {
    await store.set(scopedKey, legacy);
    await store.delete(legacyKey);
    return legacy;
  }
  return fallback;
}

async function setPerProviderSetting<T>(legacyKey: string, value: T): Promise<void> {
  const store = await load('settings.json', { autoSave: true });
  const suffix = await providerKeySuffix();
  await store.set(`${legacyKey}.${suffix}`, value);
}

export async function getModel(): Promise<string> {
  return getPerProviderSetting<string>(MODEL_KEY, '');
}

export async function setModel(model: string): Promise<void> {
  await setPerProviderSetting(MODEL_KEY, model);
}

export async function getEffort(): Promise<EffortLevel> {
  const store = await load('settings.json', { autoSave: true });
  return (await store.get<EffortLevel>(EFFORT_KEY)) ?? 'medium';
}

export async function setEffort(level: EffortLevel): Promise<void> {
  const store = await load('settings.json', { autoSave: true });
  await store.set(EFFORT_KEY, level);
}

export async function getFastMode(): Promise<boolean> {
  return getPerProviderSetting<boolean>(FAST_KEY, false);
}

export async function setFastMode(on: boolean): Promise<void> {
  await setPerProviderSetting(FAST_KEY, on);
}

export async function installProviderById(id: string): Promise<InstallResult> {
  const result = await apiInstall(id);
  if (isError(result)) {
    return { ok: false, id, error: result.message };
  }
  return result;
}
