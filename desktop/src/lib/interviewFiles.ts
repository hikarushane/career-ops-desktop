import type { WorkspaceFile } from '../api';

/**
 * Groups the files under interview-prep/ by the company they belong to. The
 * modes name prep files after the company and role ("acme-pm.md") and put
 * practice transcripts under sessions/, so a file belongs to a company when
 * its path contains the company's slug; the rest (story-bank.md,
 * question-bank.md, unmatched sessions) is shared material.
 */
export type InterviewFileGroups = { byCompany: Record<string, WorkspaceFile[]>; shared: WorkspaceFile[] };

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** The company's slug, or its first word when the full slug is too short to be a useful key. */
function companyKeys(company: string): string[] {
  const full = slug(company);
  const first = full.split('-')[0] ?? '';
  const keys = [full, first].filter((k) => k.length >= 3);
  return [...new Set(keys)];
}

export function groupInterviewFiles(files: WorkspaceFile[], companies: string[]): InterviewFileGroups {
  const byCompany: Record<string, WorkspaceFile[]> = {};
  const claimed = new Set<string>();
  for (const company of companies) {
    const keys = companyKeys(company);
    byCompany[company] = files.filter((f) => {
      const path = slug(f.path);
      return keys.some((k) => path.includes(k));
    });
    for (const f of byCompany[company]) claimed.add(f.path);
  }
  return { byCompany, shared: files.filter((f) => !claimed.has(f.path)) };
}

/** The JD capture for a tracker row, matching padded and unpadded report numbers ("064-", "64-"). */
export function jdCaptureFor(files: WorkspaceFile[], reportNumber: string): WorkspaceFile | null {
  const n = reportNumber.replace(/^0+/, '');
  if (!n) return null;
  return files.find((f) => new RegExp(`^0*${n}-`).test(f.name)) ?? null;
}

export function fileDate(modified: number): string {
  return modified > 0 ? new Date(modified * 1000).toISOString().slice(0, 10) : '';
}
