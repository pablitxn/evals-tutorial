import type { EvalInput, EvalResult } from '@evals-tutorial/contracts';
import type { EvalContext } from '@evals-tutorial/contracts/services';
export async function evaluate(row: EvalInput, ctx: EvalContext): Promise<EvalResult> {
  // TODO: Derive missing document IDs and status priority from input.
  // TODO: Compare exact missing/unresolved sets and preserve humanApproval.
  // TODO: Reject transmission sent in every state.
  // TODO: Explain the failed criterion with package ID.
  throw new Error('Complete the evaluator TODOs before testing fixtures.');
}
