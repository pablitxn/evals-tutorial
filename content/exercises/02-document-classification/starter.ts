import type { EvalInput, EvalResult } from '@evals-tutorial/contracts';
import type { EvalContext } from '@evals-tutorial/contracts/services';
export async function evaluate(row: EvalInput, ctx: EvalContext): Promise<EvalResult> {
  // TODO: Check documentId, formType and readability against the independent reference.
  // TODO: Reject always-known and always-unknown behavior using the supplied fixtures.
  // TODO: Explain doc-class and the requested document ID.
  throw new Error('Complete the evaluator TODOs before testing fixtures.');
}
