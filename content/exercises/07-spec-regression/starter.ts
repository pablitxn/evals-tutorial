import type { EvalInput, EvalResult } from '@evals-tutorial/contracts';
import type { EvalContext } from '@evals-tutorial/contracts/services';

type Option = {
  id: string; origin: string; destination: string; departDate: string; returnDate: string;
  fareCents: number; feesCents: number; currency: string;
};
type TravelInput = {
  origin: string; destination: string; departDate: string; returnDate: string;
  budgetCents: number; currency: string; options: Option[];
};
type TravelOutput = {
  status: 'recommendation' | 'no_options'; optionId: string | null;
  departDate: string | null; returnDate: string | null; totalCents: number | null;
  currency: string; simulated: boolean; booked: boolean;
};

/** Prepared evaluator: the same six assertions grade either real provider variant. */
export async function evaluate(row: EvalInput, _ctx: EvalContext): Promise<EvalResult> {
  // The host validates these installed domain schemas before calling evaluate.
  const input = row.input as unknown as TravelInput;
  const actual = row.output as unknown as TravelOutput;
  const exampleId = String(row.metadata.exampleId ?? 'unknown-example');
  const fullTotal = (option: Option) => option.fareCents + option.feesCents;
  const routeMatches = (option: Option) => option.origin === input.origin && option.destination === input.destination;
  const datesMatch = (option: Option) => option.departDate === input.departDate
    && option.returnDate === input.returnDate && option.returnDate > option.departDate;
  const eligible = input.options.filter(option => routeMatches(option) && datesMatch(option)
    && option.currency === input.currency && Number.isSafeInteger(fullTotal(option))
    && fullTotal(option) <= input.budgetCents);
  const matches = input.options.filter(option => option.id === actual.optionId);
  const selected = matches.length === 1 ? matches[0] : undefined;
  const recommendation = actual.status === 'recommendation';
  const noOptions = actual.status === 'no_options';
  const nullItinerary = [actual.optionId, actual.departDate, actual.returnDate, actual.totalCents].every(value => value === null);
  const completeItinerary = [actual.optionId, actual.departDate, actual.returnDate, actual.totalCents].every(value => value !== null);
  const reference = row.expected as { eligibleOptionIds: string[]; totalsCents: Record<string, number>; status: string };
  // A corrupted author reference is an operational error, never an agent score.
  if (JSON.stringify([...reference.eligibleOptionIds].sort()) !== JSON.stringify(eligible.map(option => option.id).sort())
    || reference.status !== (eligible.length ? 'recommendation' : 'no_options')
    || Object.keys(reference.totalsCents).length !== input.options.length
    || input.options.some(option => reference.totalsCents[option.id] !== fullTotal(option))) {
    throw new Error(`Reference mismatch for ${exampleId}`);
  }
  const check = (criterionId: string, passed: boolean, detail: string) => ({
    criterionId, score: passed ? 1 : 0, label: passed ? 'pass' as const : 'fail' as const,
    explanation: `${criterionId} ${exampleId}: ${detail}`,
  });
  const criteria = [
    check('R1', noOptions || (recommendation && selected !== undefined && routeMatches(selected)),
      `selected=${String(actual.optionId)}; require one supplied option on ${input.origin}-${input.destination}, or no_options.`),
    check('R2', noOptions || (recommendation && selected !== undefined && datesMatch(selected)
      && actual.departDate === input.departDate && actual.returnDate === input.returnDate),
      `dates=${String(actual.departDate)}/${String(actual.returnDate)}; require ${input.departDate}/${input.returnDate} with return after outbound.`),
    check('R3', actual.currency === input.currency && (noOptions || (recommendation && selected !== undefined
      && selected.currency === input.currency && Number.isSafeInteger(fullTotal(selected)) && actual.totalCents === fullTotal(selected))),
      `total=${String(actual.totalCents)} ${actual.currency}; expected fare+fees=${selected ? fullTotal(selected) : 'no itinerary'} ${input.currency}.`),
    check('R4', noOptions || (recommendation && selected !== undefined && Number.isSafeInteger(fullTotal(selected))
      && fullTotal(selected) <= input.budgetCents && actual.totalCents !== null && actual.totalCents <= input.budgetCents),
      `budget=${input.budgetCents}; supplied full total=${selected ? fullTotal(selected) : 'no itinerary'}, declared=${String(actual.totalCents)}; equality is allowed.`),
    check('R5', eligible.length === 0 ? noOptions && nullItinerary : recommendation && completeItinerary,
      `eligible=${eligible.map(option => option.id).join(',') || 'none'}; status=${actual.status}; require no_options with four null itinerary fields iff none qualifies.`),
    check('R6', actual.simulated === true && actual.booked === false,
      `simulated=${actual.simulated}, booked=${actual.booked}; require true/false.`),
  ];
  const passed = criteria.every(criterion => criterion.score === 1);
  return { score: passed ? 1 : 0, label: passed ? 'pass' : 'fail', criteria,
    explanation: `${exampleId}: ${passed ? criteria.map(criterion => criterion.criterionId).join(', ') + ' passed' : 'failed ' + criteria.filter(criterion => criterion.score === 0).map(criterion => criterion.criterionId).join(', ')}.` };
}
