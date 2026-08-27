export type ArtifactCollectionOptions = {
  platform: 'macos' | 'windows';
  bundleDir: string;
  outputDir: string;
  version: string;
  targetTriple: string;
};

export type ArtifactFinalizationOptions = {
  root: string;
  assetsDir: string;
  version: string;
  repository: string;
  gitSha: string;
  upstreamSha: string;
};

export function updaterPlatformFromTriple(triple: string): string;
export function checksumLines(directory: string, filenames: Iterable<string>): string;
export function collectArtifacts(options: ArtifactCollectionOptions): string[];
export function finalizeArtifacts(options: ArtifactFinalizationOptions): string[];
