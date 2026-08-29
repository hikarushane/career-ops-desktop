/** Return the exact externalBin filename Tauri expects for a Rust target. */
export function externalBinaryFilename(name, triple, platform = process.platform) {
  if (!name || typeof name !== 'string' || name.includes('/') || name.includes('\\')) {
    throw new TypeError('external binary name must be a non-empty filename');
  }
  if (!triple || typeof triple !== 'string') {
    throw new TypeError('sidecar target triple must be a non-empty string');
  }
  const windows = platform === 'win32' || triple.includes('windows');
  return `${name}-${triple}${windows ? '.exe' : ''}`;
}

export function sidecarFilename(triple, platform = process.platform) {
  return externalBinaryFilename('career-data', triple, platform);
}
