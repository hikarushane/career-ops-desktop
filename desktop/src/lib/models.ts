import { load } from '@tauri-apps/plugin-store';
import { isError, models, type ModelEntry } from '../api';

const TTL_MS = 24 * 60 * 60 * 1000;
type Cached = { fetchedAt: number; models: ModelEntry[] };

const FALLBACK: Record<string, ModelEntry[]> = {
  claude: ['fable', 'opus', 'sonnet', 'haiku'].map((id) => ({ id, label: `${id[0].toUpperCase()}${id.slice(1)} (latest)`, available: null, fast: id === 'opus' })),
  codex: ['gpt-5.4-codex', 'gpt-5.4', 'gpt-5.3-codex'].map((id) => ({ id, label: id, available: null, fast: false })),
  agy: [],
};

export async function getModelCatalog(providerId: string, { force }: { force: boolean }): Promise<ModelEntry[]> {
  const store = await load('settings.json', { autoSave: true });
  const key = `model-catalog.${providerId}`;
  if (!force) {
    const cached = await store.get<Cached>(key);
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.models;
  }
  try {
    const result = await models(providerId, true);
    if (isError(result)) throw new Error(result.message);
    const available = result.models.filter((m) => m.available !== false);
    await store.set(key, { fetchedAt: Date.now(), models: available } satisfies Cached);
    return available;
  } catch {
    return FALLBACK[providerId] ?? [];
  }
}

export function fastModeAllowed(providerId: string, modelId: string, catalog: ModelEntry[]): boolean {
  if (providerId !== 'claude' || !modelId) return false;
  const entry = catalog.find((m) => m.id === modelId);
  return entry ? entry.fast : /opus/i.test(modelId);
}
