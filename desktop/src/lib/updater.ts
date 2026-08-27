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

type UpdaterDependencies = {
  check: typeof check;
  relaunch: typeof relaunch;
};

type StateListener = (state: UpdateState) => void;

const POLL_INTERVAL_MS = 30 * 60 * 1000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function initialState(): UpdateState {
  return { status: 'idle', currentVersion: '' };
}

export function createUpdaterController(dependencies: UpdaterDependencies) {
  let state = initialState();
  let pendingUpdate: Update | null = null;
  let checkInFlight: Promise<void> | null = null;
  let installInFlight: Promise<void> | null = null;

  const publish = (listener: StateListener, next: UpdateState) => {
    state = next;
    listener(next);
  };

  const availableState = (currentVersion: string, update = pendingUpdate): UpdateState | null => {
    if (!update) return null;
    return {
      status: 'available',
      currentVersion,
      availableVersion: update.version,
      releaseNotes: update.body ?? undefined,
      releaseDate: update.date ?? undefined,
    };
  };

  return {
    getState: () => state,
    deferUpdate: () => state,

    checkForUpdate(listener: StateListener, currentVersion: string, manual: boolean): Promise<void> {
      if (checkInFlight) return checkInFlight;

      const knownAvailable = availableState(currentVersion);
      if (manual || !knownAvailable) {
        publish(listener, { status: 'checking', currentVersion });
      }

      checkInFlight = (async () => {
        try {
          const update = await dependencies.check();
          if (!update) {
            pendingUpdate = null;
            publish(listener, { status: 'up_to_date', currentVersion });
            return;
          }

          pendingUpdate = update;
          publish(listener, availableState(currentVersion, update)!);
        } catch (error) {
          const preserved = availableState(currentVersion);
          if (!manual && preserved) {
            publish(listener, preserved);
          } else if (manual) {
            publish(listener, {
              ...(preserved ?? { currentVersion }),
              status: 'error',
              error: String(error),
            });
          } else {
            publish(listener, { status: 'idle', currentVersion });
          }
        } finally {
          checkInFlight = null;
        }
      })();
      return checkInFlight;
    },

    downloadAndInstall(listener: StateListener, currentVersion: string): Promise<void> {
      if (installInFlight) return installInFlight;
      if (!pendingUpdate) return Promise.resolve();

      const update = pendingUpdate;
      const details = availableState(currentVersion, update)!;
      publish(listener, { ...details, status: 'downloading' });

      installInFlight = (async () => {
        try {
          await update.downloadAndInstall();
          publish(listener, { ...details, status: 'installing' });
          await dependencies.relaunch();
        } catch (error) {
          publish(listener, { ...details, status: 'error', error: String(error) });
        } finally {
          installInFlight = null;
        }
      })();
      return installInFlight;
    },
  };
}

const defaultController = createUpdaterController({ check, relaunch });

export async function checkForUpdate(
  onStateChange: StateListener,
  currentVersion: string,
  manual: boolean,
): Promise<void> {
  return defaultController.checkForUpdate(onStateChange, currentVersion, manual);
}

export async function downloadAndInstall(
  onStateChange: StateListener,
  currentVersion: string,
): Promise<void> {
  return defaultController.downloadAndInstall(onStateChange, currentVersion);
}

export function startPolling(onStateChange: StateListener, currentVersion: string): void {
  stopPolling();
  void checkForUpdate(onStateChange, currentVersion, false);
  pollTimer = setInterval(
    () => void checkForUpdate(onStateChange, currentVersion, false),
    POLL_INTERVAL_MS,
  );
}

export function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
