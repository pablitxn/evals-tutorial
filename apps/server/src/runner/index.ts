import { LIMITS, validateContract, type EvalInput, type EvalResult, type Exercise, type JudgeRpcRequest, type JudgeRpcResponse } from '@evals-tutorial/contracts';
import { ServiceError, type EvalContext, type JudgeBroker } from '@evals-tutorial/contracts/services';
import type { IsolatedExecutor } from '@evals-tutorial/evaluator-runtime';

/** Only this trusted host adapter can invoke a judge; the worker chooses no row or provider. */
export async function evaluateRow(executor: IsolatedExecutor, javascript: string, runId: string, row: EvalInput, exercise: Exercise, broker: JudgeBroker | undefined, signal: AbortSignal, deadlineEpochMs: number, fixtureId?: string): Promise<EvalResult> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, Math.max(1, deadlineEpochMs - Date.now()));
  const boundSignal = controller.signal;
  const maxCalls = exercise.mode === 'Code' ? 0 : Math.min(exercise.maxJudgeCallsPerRow, LIMITS.maxJudgeCallsPerRow);
  let context: EvalContext | undefined;
  let calls = 0;
  const seen = new Set<string>();
  const response = async (frame: JudgeRpcRequest): Promise<JudgeRpcResponse> => {
    const envelope = { schemaVersion: '1.0.0' as const, type: 'judge.response' as const, id: frame.id };
    try {
      if (!validateContract('JudgeRpcRequest', frame).valid || frame.runId !== runId || frame.exampleId !== row.metadata.exampleId || seen.has(frame.id)) throw new ServiceError({ code: 'protocol_error', message: 'Judge request does not match its frozen row', retryable: false });
      seen.add(frame.id);
      if (boundSignal.aborted) throw new ServiceError({ code: 'cancelled', message: 'Judge operation was cancelled', retryable: false });
      if (Date.now() >= deadlineEpochMs) throw new ServiceError({ code: 'timeout', message: 'Judge deadline expired', retryable: false });
      if (++calls > maxCalls) throw new ServiceError({ code: 'budget_exceeded', message: 'Judge call budget exhausted', retryable: false });
      if (!frame.request.criterionIds.length || new Set(frame.request.criterionIds).size !== frame.request.criterionIds.length || frame.request.criterionIds.some(id => !exercise.criteria.some(item => item.id === id && item.mode !== 'Code'))) throw new ServiceError({ code: 'invalid_request', message: 'Judge criteria are not installed judge criteria', retryable: false });
      if (!context) throw new ServiceError({ code: 'provider_unavailable', message: 'Judge broker is unavailable', retryable: true });
      const result = await context.judge(structuredClone(frame.request));
      if (boundSignal.aborted) throw new ServiceError({ code: 'cancelled', message: 'Judge operation was cancelled', retryable: false });
      if (!validateContract('EvalResult', result).valid) throw new ServiceError({ code: 'protocol_error', message: 'Broker returned an invalid evaluation', retryable: false });
      return { ...envelope, result };
    } catch (error) {
      return { ...envelope, error: error instanceof ServiceError ? error.detail : { code: 'provider_unavailable', message: 'Judge broker failed', retryable: true } };
    }
  };
  try {
    if (maxCalls > 0) context = broker?.bind({ runId, exampleId: row.metadata.exampleId, ...(fixtureId !== undefined ? { fixtureId } : {}), row: structuredClone(row), criterionIds: exercise.criteria.map(item => item.id), mode: exercise.mode, maxCalls, maxOutputTokens: LIMITS.maxProviderOutputTokens, deadlineEpochMs, signal: boundSignal });
    return await executor.evaluate({ runId, row: structuredClone(row), javascript, timeoutMs: Math.max(1, Math.min(deadlineEpochMs - Date.now(), exercise.mode === 'Code' ? LIMITS.codeTimeoutMs : LIMITS.judgeTimeoutMs)) }, response, boundSignal);
  } catch (error) {
    if (!signal.aborted && boundSignal.aborted) throw new ServiceError({ code: 'timeout', message: 'Evaluator deadline expired', retryable: false });
    throw error;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); controller.abort(); }
}
