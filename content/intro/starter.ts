import type { EvalInput, EvalResult } from '@evals-tutorial/contracts';
import type { EvalContext } from '@evals-tutorial/contracts/services';
export async function evaluate(row: EvalInput, _ctx: EvalContext): Promise<EvalResult> {
  const label = row.input.starred === true ? 'starred' : 'not_starred';
  const matches = row.output.label === label && row.expected.label === label;
  return { score: matches ? 1 : 0, label: matches ? 'pass' : 'fail',
    explanation: `star-flag ${row.metadata.exampleId}: starred=${row.input.starred}, actual=${row.output.label}, expected=${label}` };
}
