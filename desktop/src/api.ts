import { invoke } from '@tauri-apps/api/core';

export type Application = {
  number: number;
  date: string;
  company: string;
  role: string;
  status: string;
  /** data.NormalizeStatus(status), computed in Go so it cannot drift. */
  normStatus: string;
  /** data.StatusPriority(status): interview 0 … discarded 7, unknown 8. */
  statusPriority: number;
  score: number;
  scoreRaw: string;
  hasPdf: boolean;
  pdfPath: string;
  reportPath: string;
  reportNumber: string;
  notes: string;
  jobUrl: string;
  archetype: string;
  tldr: string;
  remote: string;
  compEstimate: string;
};

// PipelineMetrics and ProgressMetrics have no JSON struct tags in the Go data
// layer, and adding tags would mean modifying a system-path file. Their keys
// therefore arrive capitalized. Verified against real `go run ./cmd/career-data
// list --path ..` output (2026-07-27): metrics = {"Total":30,"ByStatus":
// {...},"AvgScore":3.23,"TopScore":4.4,"WithPDF":2,"Actionable":30}.
export type Metrics = {
  Total: number;
  ByStatus: Record<string, number>;
  AvgScore: number;
  TopScore: number;
  WithPDF: number;
  Actionable: number;
};

export type FunnelStage = { Label: string; Count: number; Pct: number };
export type ScoreBucket = { Label: string; Count: number };
export type WeekActivity = { Week: string; Count: number };

export type Progress = {
  FunnelStages: FunnelStage[];
  ScoreBuckets: ScoreBucket[];
  WeeklyActivity: WeekActivity[];
  ResponseRate: number;
  InterviewRate: number;
  OfferRate: number;
  AvgScore: number;
  TopScore: number;
  TotalOffers: number;
  ActiveApps: number;
};

export type DoctorResult = {
  ok: true;
  careerOpsPath: string;
  trackerPath: string | null;
  missing: string[];
  ready: boolean;
};

export type ListResult = {
  ok: true;
  applications: Application[];
  metrics: Metrics;
  progress: Progress;
};

export type ReportResult = {
  ok: true;
  path: string;
  markdown: string;
  archetype: string;
  tldr: string;
  remote: string;
  comp: string;
};

export type SetStatusResult = {
  ok: true;
  reportNumber: string;
  oldStatus: string;
  newStatus: string;
  backup: string;
};

export type SidecarError = {
  ok: false;
  error: string;
  message: string;
  actualStatus?: string;
};

export function isError(r: { ok: boolean }): r is SidecarError {
  return r.ok === false;
}

export const CANONICAL_STATUSES = [
  'Evaluated',
  'Applied',
  'Responded',
  'Interview',
  'Offer',
  'Rejected',
  'Discarded',
  'SKIP',
] as const;

export function doctor(root: string) {
  return invoke<DoctorResult | SidecarError>('doctor', { path: root });
}

export function listApplications(root: string) {
  return invoke<ListResult | SidecarError>('list_applications', { path: root });
}

export function readReport(root: string, file: string) {
  return invoke<ReportResult | SidecarError>('read_report', { path: root, file });
}

export function setStatus(
  root: string,
  reportNumber: string,
  expectStatus: string,
  status: string,
) {
  return invoke<SetStatusResult | SidecarError>('set_status', {
    path: root,
    reportNumber,
    expectStatus,
    status,
  });
}
