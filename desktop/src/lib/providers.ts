import { providers, isError, type ProviderEntry } from '../api';
import { load } from '@tauri-apps/plugin-store';

const STORE_KEY = 'preferred-provider';
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
