import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * Open a job posting in the system's default browser. The opener plugin
 * rejects (rather than silently no-ops) when a url is outside its scope —
 * see capabilities/default.json `opener:allow-default-urls` — so callers get
 * the message back to show instead of a button that "does nothing".
 * Resolves to null on success, the error text otherwise.
 */
export async function openJobUrl(url: string): Promise<string | null> {
  try {
    await openUrl(url);
    return null;
  } catch (reason) {
    return reason instanceof Error ? reason.message : String(reason);
  }
}
