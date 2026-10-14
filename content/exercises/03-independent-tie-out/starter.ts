import type { EvalInput, EvalResult } from '@evals-tutorial/contracts';
import type { EvalContext } from '@evals-tutorial/contracts/services';
export async function evaluate(row: EvalInput, ctx: EvalContext): Promise<EvalResult> {
  // TODO: Check every actual reading against independent reference fields; reject duplicate/missing IDs.
  // TODO: Recompute wages and withholding from reference W2s independently of actual extraction.
  // TODO: Compare both reported sums/deltas/verdicts and exact source IDs; unknown relevant amounts imply null/indeterminate.
  // TODO: Explain the failed criterion and source IDs; do not average away a mismatch.
  throw new Error('Complete the evaluator TODOs before testing fixtures.');
}
