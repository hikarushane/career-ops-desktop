import { load } from '@tauri-apps/plugin-store';

const STORE_FILE = 'settings.json';
const WORKSPACE_KEY = 'workspacePath';
const LEGACY_ROOT_KEY = 'careerOpsRoot';

export async function loadWorkspacePath(): Promise<string | null> {
  const store = await load(STORE_FILE, { autoSave: true });
  const workspacePath = await store.get<string>(WORKSPACE_KEY);
  if (workspacePath != null) return workspacePath;

  const legacyRoot = await store.get<string>(LEGACY_ROOT_KEY);
  if (legacyRoot == null) return null;

  await store.set(WORKSPACE_KEY, legacyRoot);
  return legacyRoot;
}

export async function saveWorkspacePath(path: string): Promise<void> {
  const store = await load(STORE_FILE, { autoSave: true });
  await store.set(WORKSPACE_KEY, path);
  await store.save();
}
