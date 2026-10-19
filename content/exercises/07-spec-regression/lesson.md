This final guided example starts with a written specification and a complete, read-only evaluator. **Specification-driven development (SDD)** makes the requirements explicit before implementing the agent. Here, each requirement becomes one deterministic assertion and one visible criterion result.

Use the same fixed dataset, references and evaluator to run two real provider versions: **baseline**, which includes fees, and **omit-fees**, whose prompt deliberately ignores fees. Changing a prompt changes the implementation under test; it does not change the specification. Provider responses can vary, so an unrun version has no results and a prompt alone does not prove a regression.

## Written specification

- **R1 — Catalog and route:** A recommendation must identify exactly one option in the supplied synthetic catalog, with the requested origin and destination.
- **R2 — Dates:** The option and response must match both requested calendar dates, with return after outbound.
- **R3 — Fare, fees and currency:** The response must use the requested currency and report the selected option's fare plus all mandatory fees, in integer cents.
- **R4 — Total budget:** The selected option's full total and the reported total must be less than or equal to the budget. Equality is allowed. Any eligible option may pass; cheapest is not required.
- **R5 — Honest absence:** Return `no_options` if and only if no supplied option satisfies R1–R4. In that case, optionId, departDate, returnDate and totalCents must all be null. Otherwise return a complete recommendation.
- **R6 — Simulation:** Every response must say `simulated: true` and `booked: false`. There is no booking capability.

## Deriving the evaluator

| Specification | Deterministic assertion | Visible evidence |
| --- | --- | --- |
| R1 | Look up the selected ID in this input and compare its route. | Selected ID and requested route. |
| R2 | Compare both option and response dates to the request; check their order. | Actual and requested date pair. |
| R3 | Add fareCents and feesCents; compare the exact total and currency. | Actual total and independently calculated full total. |
| R4 | Compare the full catalog total and reported total with budgetCents. | Budget, full total and reported total. |
| R5 | Filter this input using the specification; require the correct status and nullability. | Eligible IDs, returned status and itinerary rule. |
| R6 | Check both literal boolean values. | Actual simulation and booking flags. |

For a `no_options` response, R1–R4 have no selected itinerary to check; R5 independently verifies that absence is justified and all itinerary fields are null. R3 still checks the response currency. Each criterion returns 1/pass or 0/fail. The aggregate passes only when **all six** pass; operational errors remain errors.

## The same three normal cases

1. A routine trip with one option comfortably within budget.
2. A choice between an affordable full fare and a lower base fare with high mandatory fees.
3. A trip with no affordable full-price option.

The expected references were authored before inference. They describe eligible IDs, full totals and status, rather than requiring a particular model wording. Both versions use these exact same cases. The read-only Python consultation shows the exact prompts and the actual Microsoft Agent Framework call used by the runtime. No answers or criterion results exist until an explicit run completes.

Run baseline and inspect its per-case, per-requirement evidence. Then select omit-fees and run the same dataset again. Compare the completed receipts and criterion failures. A fee omission can violate R3, R4 and R5 in different ways; inspect the actual response to explain the observed change. Failed provider calls and missing execution isolation are operational blockers, not scored regressions. These are synthetic travel options and no booking occurs.
