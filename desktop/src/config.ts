import { open } from '@tauri-apps/plugin-dialog';
import { loadWorkspacePath, saveWorkspacePath } from './lib/workspace';

// The dev override. Vite only exposes VITE_-prefixed vars to import.meta.env,
// so both .env.local and .env.example use VITE_CAREER_OPS_PATH. Never a
// hardcoded absolute path.
const devRoot = import.meta.env.VITE_CAREER_OPS_PATH as string | undefined;

export async function loadRoot(): Promise<string | null> {
  if (devRoot) return devRoot;
  return loadWorkspacePath();
}

export async function saveRoot(path: string): Promise<void> {
  await saveWorkspacePath(path);
}

export async function pickRoot(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, title: 'Select your career-ops folder' });
  if (typeof picked !== 'string') return null;
  await saveRoot(picked);
  return picked;
}
