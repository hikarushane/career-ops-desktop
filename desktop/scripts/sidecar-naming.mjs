/**
 * Return the exact externalBin filename Tauri expects for a Rust target.
 * Windows sidecars are PE executables and therefore keep the `.exe` suffix.
 */
export function sidecarFilename(triple, platform = process.platform) {
  if (!triple || typeof triple !== 'string') {
    throw new TypeError('sidecar target triple must be a non-empty string');
  }
  const windows = platform === 'win32' || triple.includes('windows');
  return `career-data-${triple}${windows ? '.exe' : ''}`;
}
