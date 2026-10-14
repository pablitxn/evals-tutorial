import type { EvalInput, EvalResult } from '@evals-tutorial/contracts';
import type { EvalContext } from '@evals-tutorial/contracts/services';
export async function evaluate(row: EvalInput, ctx: EvalContext): Promise<EvalResult> {
  // TODO: Validate the normalized output label.
  // TODO: Derive the label from input.starred and compare the independent reference.
  // TODO: Return pass/fail and explain star-flag with the example ID.
  throw new Error('Complete the evaluator TODOs before testing fixtures.');
}
