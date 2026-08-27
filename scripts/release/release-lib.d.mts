export const RELEASE_INPUTS: string[];

export type VersionConsistency = {
  version: string;
  sources: Record<string, string | undefined>;
  errors: string[];
};

export type PreparedMetadata = {
  schemaVersion: number;
  version: string;
  preparedCommit: string;
  releaseNotesHash: string;
  metadataHash: string;
};

export function readJson(path: string): any;
export function sha256(value: string | NodeJS.ArrayBufferView): string;
export function sha256File(path: string): string;
export function nonEmptyArtifacts(directory: string, suffix: string): Array<{ name: string; size: number }>;
export function versionSources(root: string): Record<string, string | undefined>;
export function consistentVersion(root: string): VersionConsistency;
export function releaseNotesSection(root: string, version: string): string | null;
export function releaseMetadataHash(root: string): string;
export function buildPreparedMetadata(root: string, preparedCommit: string): PreparedMetadata;
export function validatePreparedMetadata(root: string): {
  ok: boolean;
  errors: string[];
  marker?: PreparedMetadata;
};
export function validateReleaseConfiguration(root: string, options?: { production?: boolean }): {
  ok: boolean;
  errors: string[];
  repository: string | null;
  homebrewTap: string | null;
};
