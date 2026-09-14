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

/** One caller waiting on the check in flight, with the trigger it came from. */
type Waiter = { listener: StateListener; manual: boolean };

const POLL_INTERVAL_MS = 30 * 60 * 1000;
/**
 * Upper bound on one update request. The updater plugin sets no timeout of
 * its own, so a stalled connection would otherwise leave "Checking…" on
 * screen indefinitely and make every later check join the stuck one.
 */
export const CHECK_TIMEOUT_MS = 30_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function initialState(): UpdateState {
  return { status: 'idle', currentVersion: '' };
}

export function createUpdaterController(dependencies: UpdaterDependencies) {
  let state = initialState();
  let pendingUpdate: Update | null = null;
  let checkInFlight: { promise: Promise<void>; waiters: Waiter[] } | null = null;
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
      const knownAvailable = availableState(currentVersion);
      if (manual || !knownAvailable) {
        publish(listener, { status: 'checking', currentVersion });
      }

      // A check already running (the background poll, typically) is shared
      // rather than duplicated, but every caller still gets the outcome on
      // its own listener: Settings › About mounts a fresh one, and a Check
      // Now that joined a poll must not stay blank when the poll settles.
      if (checkInFlight) {
        checkInFlight.waiters.push({ listener, manual });
        return checkInFlight.promise;
      }

      const waiters: Waiter[] = [{ listener, manual }];
      const promise = (async () => {
        try {
          const update = await dependencies.check();
          pendingUpdate = update ?? null;
          const next: UpdateState = update
            ? availableState(currentVersion, update)!
            : { status: 'up_to_date', currentVersion };
          for (const waiter of waiters) publish(waiter.listener, next);
        } catch (error) {
          const preserved = availableState(currentVersion);
          for (const waiter of waiters) {
            if (waiter.manual) {
              publish(waiter.listener, {
                ...(preserved ?? { currentVersion }),
                status: 'error',
                error: String(error),
              });
            } else if (preserved) {
              publish(waiter.listener, preserved);
            } else {
              publish(waiter.listener, { status: 'idle', currentVersion });
            }
          }
        } finally {
          checkInFlight = null;
        }
      })();
      checkInFlight = { promise, waiters };
      return promise;
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

const defaultController = createUpdaterController({
  check: (options) => check({ timeout: CHECK_TIMEOUT_MS, ...options }),
  relaunch,
});

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
