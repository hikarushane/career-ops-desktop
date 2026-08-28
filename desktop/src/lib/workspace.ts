import { load } from '@tauri-apps/plugin-store';

const STORE_FILE = 'settings.json';
const WORKSPACE_KEY = 'workspacePath';
const LEGACY_ROOT_KEY = 'careerOpsRoot';
const BASELINE_ROOT_KEY = 'careerOpsPath';

export async function loadWorkspacePath(): Promise<string | null> {
  const store = await load(STORE_FILE, { autoSave: true });
  const workspacePath = await store.get<string>(WORKSPACE_KEY);
  if (workspacePath != null) return workspacePath;

  const legacyRoot = await store.get<string>(LEGACY_ROOT_KEY);
  if (legacyRoot != null) {
    await store.set(WORKSPACE_KEY, legacyRoot);
    return legacyRoot;
  }

  const baselineRoot = await store.get<string>(BASELINE_ROOT_KEY);
  if (baselineRoot == null) return null;

  await store.set(WORKSPACE_KEY, baselineRoot);
  return baselineRoot;
}

export async function saveWorkspacePath(path: string): Promise<void> {
  const store = await load(STORE_FILE, { autoSave: true });
  await store.set(WORKSPACE_KEY, path);
  await store.save();
}
