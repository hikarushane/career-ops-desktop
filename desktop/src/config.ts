import { open } from '@tauri-apps/plugin-dialog';
import { getDefaultWorkspacePath, initializeWorkspace, inspectWorkspace } from './api';
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

export async function createDefaultWorkspace(): Promise<string> {
  const path = await getDefaultWorkspacePath();
  const workspace = await initializeWorkspace(path);
  await saveRoot(workspace.path);
  return workspace.path;
}

export async function pickWorkspace(): Promise<string | null> {
  const picked = await open({
    directory: true,
    multiple: false,
    title: 'Choose CareerOps workspace location',
  });
  if (typeof picked !== 'string') return null;

  const inspection = await inspectWorkspace(picked);
  if (inspection.kind === 'nonempty-invalid') {
    throw new Error(
      'This folder already contains files and is not a CareerOps workspace. Choose an empty folder or an existing CareerOps workspace.',
    );
  }

  const path = inspection.kind === 'careerops'
    ? inspection.path
    : (await initializeWorkspace(inspection.path)).path;
  return path;
}

export async function chooseWorkspace(): Promise<string | null> {
  const path = await pickWorkspace();
  if (!path) return null;
  await saveRoot(path);
  return path;
}
