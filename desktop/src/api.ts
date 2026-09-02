import { invoke } from '@tauri-apps/api/core';
import type { IntakeCategoryId } from './lib/intakeCategories';

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
  installCmd?: string;
  website?: string;
  authHint?: string;
};

export type InstallResult = {
  ok: boolean;
  id: string;
  output?: string;
  error?: string;
};

export type ProvidersResult = {
  ok: true;
  providers: ProviderEntry[];
};

export type FetchPostingResult = {
  ok: true;
  source: 'linkedin-guest' | 'html';
  title: string;
  company: string;
  location: string;
  text: string;
  fetchedAt: string;
};

export type SidecarError = {
  ok: false;
  error: string;
  message: string;
  actualStatus?: string;
};

export type WorkspaceInspection = {
  path: string;
  kind: 'missing' | 'empty' | 'careerops' | 'nonempty-invalid';
};

export type WorkspaceInitResult = {
  path: string;
  created: boolean;
};

export type StageIntakeFile = {
  sourcePath: string;
  category: IntakeCategoryId;
};

export type StagedIntakeFile = {
  sourcePath: string;
  destinationPath: string;
  category: IntakeCategoryId;
  duplicate: boolean;
};

export type GenerationTarget = 'cv.md' | 'config/profile.yml' | 'modes/_profile.md' | 'portals.yml';

export type GenerationFile = {
  path: GenerationTarget;
  content: string | null;
  valid: boolean;
  issue: string | null;
};

export type GenerationResult = {
  taskId: string;
  files: GenerationFile[];
  complete: boolean;
};

export type GenerationProgressEvent = {
  task_id: string;
  file: GenerationTarget;
};

export function isError(r: { ok: boolean }): r is SidecarError {
  return r.ok === false;
}

async function invokeSidecar<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const stdout = await invoke<string>(command, args);
  try {
    return JSON.parse(stdout) as T;
  } catch (reason) {
    throw new Error(`Sidecar returned invalid JSON: ${String(reason)}`);
  }
}

function isSidecarError(value: unknown): value is SidecarError {
  return typeof value === 'object'
    && value !== null
    && (value as { ok?: unknown }).ok === false
    && typeof (value as { error?: unknown }).error === 'string'
    && typeof (value as { message?: unknown }).message === 'string';
}

async function invokeLanguageSidecar<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const result = await invokeSidecar<T | SidecarError>(command, args);
  if (isSidecarError(result)) throw new Error(result.message);
  return result;
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
  | 'interview-debrief'
  | 'profile-generate';

export type TaskStarted = {
  task_id: string;
};

export type TaskOutputEvent = {
  task_id: string;
  stream: 'stdout' | 'stderr';
  data: string;
};

export type TaskEvent = {
  task_id: string;
  kind: 'status' | 'tool' | 'text' | 'result';
  summary: string;
  tool: string | null;
  target: string | null;
  is_error: boolean | null;
};

export type TaskOutcome = { ok: boolean; detail: string; artifacts: string[] };

export type TaskFinishedEvent = {
  task_id: string;
  exit_code: number | null;
  success: boolean;
  outcome: TaskOutcome;
};

export type TaskSnapshot = {
  task_id: string;
  task_type: TaskType;
  label: string;
  started_at: number;
  state: 'running' | 'done' | 'failed';
  last_summary: string;
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

export type ModelOptions = { model: string; effort: string; fastMode: boolean };

export function runTask(
  taskType: TaskType,
  providerId: string,
  args: Record<string, string>,
  path: string,
  languageContext?: LanguageContext,
  modelOptions?: ModelOptions,
  label?: string,
) {
  return invoke<TaskStarted>('run_task', {
    input: { taskType, providerId, args, path, languageContext, modelOptions, label },
  });
}

export function cancelTask(taskId: string) {
  return invoke<void>('cancel_task', { taskId });
}

export function listTasks() {
  return invoke<TaskSnapshot[]>('list_tasks');
}

export function getGenerationResult(taskId: string) {
  return invoke<GenerationResult>('generation_result', { taskId });
}

export function applyGeneration(taskId: string) {
  return invoke<string[]>('apply_generation', { taskId });
}

export function discardGeneration(taskId: string) {
  return invoke<void>('discard_generation', { taskId });
}

export function getDefaultWorkspacePath(): Promise<string> {
  return invoke<string>('default_workspace_path');
}

export function inspectWorkspace(path: string): Promise<WorkspaceInspection> {
  return invoke<WorkspaceInspection>('inspect_workspace', { path });
}

export function initializeWorkspace(path: string): Promise<WorkspaceInitResult> {
  return invoke<WorkspaceInitResult>('initialize_workspace', { path });
}

export function prepareOnboardingWorkspace(root: string): Promise<void> {
  return invoke<void>('prepare_onboarding_workspace', { root });
}

export function stageIntakeFiles(
  root: string,
  files: StageIntakeFile[],
): Promise<StagedIntakeFile[]> {
  return invoke<StagedIntakeFile[]>('stage_intake_files_for_workspace', { root, files });
}

export function listIntakeCandidates(paths: string[]): Promise<string[]> {
  return invoke<string[]>('list_intake_candidates', { paths });
}

export function contracts() {
  return invokeSidecar<ContractsResult | SidecarError>('contracts');
}

export function providers() {
  return invokeSidecar<ProvidersResult | SidecarError>('providers');
}

export function installProvider(id: string) {
  return invokeSidecar<InstallResult | SidecarError>('install_provider', { id });
}

export function doctor(root: string) {
  return invokeSidecar<DoctorResult | SidecarError>('doctor', { path: root });
}

export function listApplications(root: string) {
  return invokeSidecar<ListResult | SidecarError>('list_applications', { path: root });
}

export function readReport(root: string, file: string) {
  return invokeSidecar<ReportResult | SidecarError>('read_report', { path: root, file });
}

export function setStatus(
  root: string,
  reportNumber: string,
  expectStatus: string,
  status: string,
) {
  return invokeSidecar<SetStatusResult | SidecarError>('set_status', {
    path: root,
    reportNumber,
    expectStatus,
    status,
  });
}

export function languageSettings(root: string) {
  return invokeLanguageSidecar<LanguageSettings>('language_settings', { path: root });
}

export function setAnalysisLanguage(root: string, language: string): Promise<void> {
  return invoke<void>('set_analysis_language', { path: root, language });
}

export function helpDocument(root: string, language: string) {
  return invokeLanguageSidecar<HelpDocument>('help_document', { path: root, language });
}

export function resolveJobLanguage(root: string, text: string) {
  return invokeLanguageSidecar<JobLanguageResolution>('resolve_job_language', { path: root, text });
}

export function fetchPosting(url: string) {
  return invokeSidecar<FetchPostingResult | SidecarError>('fetch_posting', { url });
}
