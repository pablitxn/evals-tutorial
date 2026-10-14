import type { EvalInput, EvalResult, JudgeRpcRequest, JudgeRpcResponse, ValidationResult } from '@evals-tutorial/contracts';

export interface Compilation extends ValidationResult { javascript?: string }
export interface EvaluationJob { runId: string; row: EvalInput; javascript: string; timeoutMs: number }
/** Trusted injection boundary, also used by explicitly mocked orchestration tests. */
export interface IsolatedExecutor {
  readonly imageDigest: string;
  available(signal?: AbortSignal): Promise<void>;
  compile(source: string, signal?: AbortSignal): Promise<Compilation>;
  evaluate(job: EvaluationJob, judge: (request: JudgeRpcRequest) => Promise<JudgeRpcResponse>, signal?: AbortSignal): Promise<EvalResult>;
  shutdown(): Promise<void>;
}
