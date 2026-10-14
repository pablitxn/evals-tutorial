import type { EvalInput, EvalResult } from '@evals-tutorial/contracts';
import type { EvalContext } from '@evals-tutorial/contracts/services';
export async function evaluate(row: EvalInput, ctx: EvalContext): Promise<EvalResult> {
  // TODO: Derive eligible IDs from both dates, route, currency and fare plus fees; compare independent reference.
  // TODO: For recommendations validate supplied ID, exact dates and full total.
  // TODO: For no_options require empty eligibility and all itinerary fields null.
  // TODO: Always require simulated true and booked false; explain criterion with example ID.
  throw new Error('Complete the evaluator TODOs before testing fixtures.');
}
