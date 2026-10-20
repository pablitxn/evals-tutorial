This read-only example adapts GitHub Spec Kit's published **specify → plan → tasks → implement → converge** workflow for a prepared tutorial example ([workflow](https://github.com/github/spec-kit)). The example's implementation is already provided: inspect the prompt and response schema, then verify completed runs against the specification. Teams can adapt SDD artifacts and workflows to their needs.

The scenario is a synthetic travel recommendation service. A prompt change is a change to the implementation under test; it does not change the specification. The prepared `baseline` includes mandatory fees, while `omit-fees` deliberately ignores them. Both variants use the same fixed dataset, reference answers and evaluator. A prompt alone does not establish a regression: only completed run receipts and their requirement evidence show what happened.

<!-- specification:start -->
## Specification: synthetic travel recommendation

### Context and problem

Given a requested route, dates, currency, budget and synthetic option catalog, recommend only an option satisfying every constraint, including mandatory fees. A cheap but ineligible option or a false claim of unavailability is incorrect.

### Goal and scope

Return one complete eligible recommendation, or report no options if none qualify. In scope: the supplied catalog and response fields. Out of scope: browsing, outside data, cheapest-option ranking, booking, transmission, or real travel decisions. Everything is synthetic.

### Inputs, outputs and constraints

Input: requested route, dates, integer-cent budget and currency; options with route, dates, fare, fees and currency. Output: `recommendation` with one option ID, matching dates, full total and currency, or `no_options` with ID, dates and total all `null`. Both include `simulated: true`, `booked: false`.

Eligibility requires exact route, date and currency matches, return after outbound, and `fareCents + feesCents <= budgetCents` (equality allowed). Use integer minor units and include all fees. Any eligible option may be selected; copy its ID and dates. No booking capability exists.

### Normative requirements

- **R1 — Catalog and route:** A recommendation MUST select exactly one supplied option matching requested origin and destination.
- **R2 — Dates:** Option and response MUST match both requested dates; return MUST follow outbound.
- **R3 — Fare, fees and currency:** Every response MUST use the requested currency; a recommendation MUST report fare plus all mandatory fees in integer cents.
- **R4 — Total budget:** Selected full total and reported total MUST be within budget; equality is allowed. Cheapest is not required.
- **R5 — Honest absence:** Return `no_options` iff no option satisfies R1–R4. Then `optionId`, `departDate`, `returnDate` and `totalCents` MUST be `null`; otherwise return a complete recommendation.
- **R6 — Simulation:** Every response MUST have `simulated: true` and `booked: false`.

### Acceptance scenarios

| Case | Given | When | Then |
| --- | --- | --- | --- |
| Routine | User requests AAA–BBB, 2027-03-10 to 2027-03-13, with a $400 budget; the catalog has one matching option at $280 fare + $30 fees. | Service processes the request. | Recommend that option with a $310 total, requested currency and simulation flags. |
| Fees matter | User requests the same route and dates with a $320 budget. Options cost $270 + $30 fees and $240 + $120 fees. | Service processes the request. | Recommend an eligible option with its full total; the $360 option is over budget despite its lower base fare. |
| None affordable | User requests the same route and dates with a $300 budget; the sole option costs $280 + $70 fees. | Service processes the request. | Return `no_options`, null all four itinerary fields, preserve simulation flags. |

<!-- specification:end -->

### Plan

1. Define a structured response schema and agent prompt that encode R1–R6, using only the supplied catalog.
2. Prepare an independent evaluator that derives eligibility and full totals, then checks the selected source option or justified absence.
3. Verify each requirement with deterministic evidence; pass only if all six pass.

### Tasks

| Task | Prepared work | Trace |
| --- | --- | --- |
| T1 — Implement agent behavior | Use the prepared response schema and prompt to enforce a single eligible option, exact dates, full price, honest absence, and simulation-only output. | R1–R6 |
| T2 — Implement evaluation | Derive eligible options and full totals independently; check the selected source option or justified absence. | R1–R5 |
| T3 — Verify evidence | Check each requirement with deterministic evidence; aggregate only when all six pass. | R1–R6 |

### Verification and traceability

| Requirement | Deterministic evaluator check | Evidence shown |
| --- | --- | --- |
| R1 | Look up the selected ID in this input and compare its route. | Selected ID and requested route. |
| R2 | Compare both option and response dates to the request; check their order. | Actual and requested date pair. |
| R3 | Add fare and fees; compare the exact total and currency. | Actual total and independently calculated full total. |
| R4 | Compare the full catalog total and reported total with the budget. | Budget, full total and reported total. |
| R5 | Filter this input using the specification; require the correct status and nullability. | Eligible IDs, returned status and itinerary rule. |
| R6 | Check both literal boolean values. | Actual simulation and booking flags. |

For `no_options`, there is no selected itinerary to check under R1, R2 or R4. R5 independently checks that no option is eligible and all itinerary fields are null; R3 still checks the response currency. The aggregate passes only when all six criteria pass. Provider or isolation errors remain operational errors without evaluation scores.

### Prepared example and how to inspect it

The three fixed dataset cases correspond to the acceptance scenarios above. Their expected references were authored before inference and describe eligible IDs, full totals and status; they do not require particular model wording. The read-only Python consultation shows the exact installed prompts and the Microsoft Agent Framework call used by the runtime. No references, fixtures or evaluator source enter an agent request.

The prompt, response schema and complete evaluator are prepared; this final lesson is read-only. Inspect the baseline run and its per-case, per-requirement evidence, then select `omit-fees` and run the same dataset. Compare completed receipts and criterion failures. A fee omission can violate R3, R4 and R5 in different ways; use the actual response to explain any observed change. Until a run completes, there are no results. Failed provider calls and unavailable execution isolation are operational blockers, not scored regressions. No booking occurs.
