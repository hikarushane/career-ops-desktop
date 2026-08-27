export type CaskRelease = {
  version: string;
  url: string;
  sha256: string;
};

export function renderCask(source: string, release: CaskRelease): string;
