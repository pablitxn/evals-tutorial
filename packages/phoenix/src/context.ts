import { sha256, canonicalJson } from '@evals-tutorial/contracts/node';

/** Trusted host correlation only. Never accept these IDs from evaluator RPC.
 * The parent span is persisted later by record(); inference is not performed here.
 */
export function createTelemetryContext(runId: string, exampleId: string, fixtureId?: string): {
  traceId: string; spanId: string; traceparent: string;
} {
  const key = canonicalJson([runId, exampleId, fixtureId ?? null]);
  const traceId = sha256(`tutorial-trace-v1:${key}`).slice(0, 32);
  const spanId = sha256(`tutorial-row-v1:${key}`).slice(0, 16);
  return { traceId, spanId, traceparent: `00-${traceId}-${spanId}-01` };
}
