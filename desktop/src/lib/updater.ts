import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'error';

export type UpdateState = {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  releaseNotes?: string;
  releaseDate?: string;
  error?: string;
};

const POLL_INTERVAL_MS = 30 * 60 * 1000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastCheckedVersion: string | null = null;
let pendingUpdate: Update | null = null;

export function initialState(): UpdateState {
  return { status: 'idle', currentVersion: '' };
}

export async function checkForUpdate(
  onStateChange: (s: UpdateState) => void,
  currentVersion: string,
  manual: boolean,
): Promise<void> {
  const base: UpdateState = { status: 'checking', currentVersion };
  onStateChange(base);

  try {
    const update = await check();

    if (!update) {
      onStateChange({ ...base, status: 'up_to_date' });
      return;
    }

    if (lastCheckedVersion === update.version && !manual) return;
    lastCheckedVersion = update.version;
    pendingUpdate = update;

    onStateChange({
      status: 'available',
      currentVersion,
      availableVersion: update.version,
      releaseNotes: update.body ?? undefined,
      releaseDate: update.date ?? undefined,
    });
  } catch (e) {
    if (manual) {
      onStateChange({ ...base, status: 'error', error: String(e) });
    }
    // Background errors stay silent
  }
}

export async function downloadAndInstall(
  onStateChange: (s: UpdateState) => void,
  currentVersion: string,
): Promise<void> {
  if (!pendingUpdate) return;

  const base: UpdateState = {
    status: 'downloading',
    currentVersion,
    availableVersion: pendingUpdate.version,
  };
  onStateChange(base);

  try {
    await pendingUpdate.downloadAndInstall();
    onStateChange({ ...base, status: 'installing' });
    await relaunch();
  } catch (e) {
    onStateChange({ ...base, status: 'error', error: String(e) });
  }
}

export function startPolling(
  onStateChange: (s: UpdateState) => void,
  currentVersion: string,
): void {
  stopPolling();
  checkForUpdate(onStateChange, currentVersion, false);
  pollTimer = setInterval(
    () => checkForUpdate(onStateChange, currentVersion, false),
    POLL_INTERVAL_MS,
  );
}

export function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
