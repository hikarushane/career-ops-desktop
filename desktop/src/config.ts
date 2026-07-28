import { load } from '@tauri-apps/plugin-store';
import { open } from '@tauri-apps/plugin-dialog';

const STORE_FILE = 'settings.json';
const ROOT_KEY = 'careerOpsPath';

// The dev override. Vite only exposes VITE_-prefixed vars to import.meta.env,
// so both .env.local and .env.example use VITE_CAREER_OPS_PATH. Never a
// hardcoded absolute path.
const devRoot = import.meta.env.VITE_CAREER_OPS_PATH as string | undefined;

export async function loadRoot(): Promise<string | null> {
  if (devRoot) return devRoot;
  const store = await load(STORE_FILE, { autoSave: true });
  return (await store.get<string>(ROOT_KEY)) ?? null;
}

export async function saveRoot(path: string): Promise<void> {
  const store = await load(STORE_FILE, { autoSave: true });
  await store.set(ROOT_KEY, path);
  await store.save();
}

export async function pickRoot(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, title: 'Select your career-ops folder' });
  if (typeof picked !== 'string') return null;
  await saveRoot(picked);
  return picked;
}
