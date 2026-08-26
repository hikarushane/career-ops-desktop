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

export type StateEntry = {
  id: string;
  label: string;
  terminal: boolean;
  priority: number;
  group: string;
};

export type ContractsResult = {
  ok: true;
  states: StateEntry[];
};

export type ProviderState = 'not_installed' | 'installed' | 'ready' | 'error';

export type ProviderEntry = {
  id: string;
  displayName: string;
  binary: string;
  headlessCmd: string;
  state: ProviderState;
  version?: string;
  path?: string;
  error?: string;
};

export type ProvidersResult = {
  ok: true;
  providers: ProviderEntry[];
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

export type TaskType =
  | 'evaluate'
  | 'scan'
  | 'batch'
  | 'pdf'
  | 'deep'
  | 'interview-prep'
  | 'interview-plan'
  | 'interview-practice'
  | 'interview-debrief';

export type TaskStarted = {
  task_id: string;
};

export type TaskOutputEvent = {
  task_id: string;
  stream: 'stdout' | 'stderr';
  data: string;
};

export type TaskFinishedEvent = {
  task_id: string;
  exit_code: number | null;
  success: boolean;
};

export type LanguageOption = {
  code: string;
  name: string;
};

export type LanguageSettings = {
  analysisLanguage: string;
  options: LanguageOption[];
};

export type JobLanguageResolution = {
  language: string;
  confidence: number;
  source: string;
  warning?: string;
};

export type HelpDocument = {
  language: string;
  path: string;
  fallback: boolean;
  markdown: string;
};

export type LanguageContext = {
  analysisLanguage: string;
  jobLanguage?: string;
  jobLanguageConfidence?: number;
  jobLanguageSource?: string;
  marketMode?: string;
};

export function runTask(
  taskType: TaskType,
  providerId: string,
  args: Record<string, string>,
  path: string,
  languageContext?: LanguageContext,
) {
  return invoke<TaskStarted>('run_task', {
    input: { taskType, providerId, args, path, languageContext },
  });
}

export function cancelTask(taskId: string) {
  return invoke<void>('cancel_task', { taskId });
}

export function contracts() {
  return invoke<ContractsResult | SidecarError>('contracts');
}

export function providers() {
  return invoke<ProvidersResult | SidecarError>('providers');
}

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

export function languageSettings(root: string) {
  return invoke<LanguageSettings>('language_settings', { path: root });
}

export function setAnalysisLanguage(root: string, language: string) {
  return invoke<LanguageSettings>('set_analysis_language', { path: root, language });
}

export function helpDocument(root: string, language: string) {
  return invoke<HelpDocument>('help_document', { path: root, language });
}

export function resolveJobLanguage(root: string, text: string) {
  return invoke<JobLanguageResolution>('resolve_job_language', { path: root, text });
}
