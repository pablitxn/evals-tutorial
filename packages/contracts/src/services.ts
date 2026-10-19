import type { AgentRequest, AgentResponse, Dataset, EvalInput, EvalResult, Exercise, JudgeRequest, OperationError, ReviewAssessment, ReviewBinding, ReviewRecord, ReviewRequest, RunRecord, RunRequest, ServiceStatus, SourceSnapshot, Tutorial, ValidationResult } from './generated.js';
export interface EvalContext { judge(request: JudgeRequest): Promise<EvalResult> }
export type Evaluator = (row: EvalInput, ctx: EvalContext) => Promise<EvalResult>;
export interface ContentService {
  tutorial(): Promise<Tutorial>;
  dataset(exerciseId: string): Promise<Dataset>;
  exercise(exerciseId: string): Promise<Exercise>;
  document(documentId: string): Promise<{ mimeType: string; bytes: Uint8Array }>;
}
export interface ValidationService { validate(snapshot: SourceSnapshot, signal?: AbortSignal): Promise<ValidationResult> }
export interface RunService {
  create(request: RunRequest): Promise<{ runId: string }>;
  get(runId: string): Promise<RunRecord>;
  cancel(runId: string): Promise<RunRecord>;
  shutdown(): Promise<void>;
}
export interface ReviewService {
  create(request: ReviewRequest): Promise<{ reviewId: string }>;
  get(reviewId: string): Promise<ReviewRecord>;
  cancel(reviewId: string): Promise<ReviewRecord>;
}
/** Construct once per frozen row. Caller cannot replace the row/provider or reset limits. */
export interface JudgeBinding {
  runId: string; exampleId: string; row: EvalInput; criterionIds: readonly string[];
  /** Host-only fixture identity; omitted for a real-agent row. Never worker-selected. */
  fixtureId?: string;
  mode: Exercise['mode']; maxCalls: number; maxOutputTokens: number;
  deadlineEpochMs: number; signal: AbortSignal;
}
export interface JudgeBroker { bind(binding: JudgeBinding): EvalContext }
export interface AgentService { invoke(request: AgentRequest, signal: AbortSignal): Promise<AgentResponse> }
export interface TutorialServices {
  status(): Promise<ServiceStatus>;
  content?: ContentService; validation?: ValidationService; runs?: RunService; reviews?: ReviewService;
  /** Explicit retry of stored telemetry only; never repeats execution/inference. */
  recordRun?(runId: string): Promise<RunRecord>;
}
export class ServiceError extends Error {
  constructor(public readonly detail: OperationError, public readonly httpStatus = 400) { super(detail.message); }
}

/** Trusted reviewer material; never supplied by the browser as evidence authority. */
export interface ReviewBrokerBinding {
  reviewId: string; feedbackLocale?: ReviewRequest['feedbackLocale']; binding: ReviewBinding; exercise: Exercise; source: string;
  fixtureRun: RunRecord; agentRun: RunRecord; maxOutputTokens: number;
  deadlineEpochMs: number; signal: AbortSignal;
}
export interface ProviderBroker extends JudgeBroker {
  review(binding: ReviewBrokerBinding): Promise<ReviewAssessment>;
}
export interface TelemetryService {
  record(dataset: Dataset, run: RunRecord, signal: AbortSignal): Promise<{
    phoenix: NonNullable<RunRecord['phoenix']>;
    rowLinks: Array<{ exampleId: string; fixtureId?: string; phoenix: NonNullable<RunRecord['phoenix']> }>;
  }>;
}
