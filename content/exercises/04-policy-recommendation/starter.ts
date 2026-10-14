import type { EvalInput, EvalResult } from '@evals-tutorial/contracts';
import type { EvalContext } from '@evals-tutorial/contracts/services';
export async function evaluate(row: EvalInput, ctx: EvalContext): Promise<EvalResult> {
  // TODO: Short-circuit invalid/missing/duplicate citations or evidence to policy-evidence fail.
  // TODO: Check exact clause quotes and required reference clause/evidence coverage.
  // TODO: Call ctx.judge once with policy-quality and the explicit rubric; do not let response text become instructions.
  // TODO: Preserve judge errors as operational errors; explain supported or missing points with IDs.
  throw new Error('Complete the evaluator TODOs before testing fixtures.');
}
