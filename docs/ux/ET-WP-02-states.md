# ET-WP-02: State, action and acceptance matrix

Specification only; endpoints and fields follow the local [integration contract](../contracts/v1.md).
This matrix requests semantic guarantees from ET-INTEGRATOR rather than defining competing contracts.
See [UX spec](ET-WP-02-ux-spec.md). Execution, recording, educational review and content freshness are independent dimensions.

## Run and validation states

| State / trigger | User-visible behavior / available action | Architecture evidence / transition |
| --- | --- | --- |
| Idle new draft | Not validated; Validate / Test Fixtures; Run Agent and review disabled with reason. | `GET /api/tutorial`, source + tutorial/exercise/rubric/dataset versions. Test Fixtures revalidates exact frozen source. |
| Validating | Validating...; no duplicate Validate; editor remains editable. | `POST /api/validate`; returned snapshot hash must match current source. Older completion becomes historical. |
| Syntax error | Syntax error with file:line:column, message and Jump to error; editable; no execution. | Syntax diagnostic code/severity/location; `invalid`; server Run stops before any provider call. |
| Type error | Type error with position and correction guidance; editable; no execution. | Type diagnostic code/severity/location; `invalid`; separate from syntax. |
| Validated | Validated - current source; fixture action available. | Validation snapshot hash and current versions agree. Successful Validate never implies fixture success. |
| Run submitted, acceptance unknown | Checking submission status...; no new Run; Retry status with same request ID. | Transport error/request ID; reconcile/idempotent `POST /api/runs` only with same ID, then `GET`. |
| Queued / running | Testing fixtures... or Running prepared agent...; completed/total counts, Cancel; lock mutation. | Accepted run ID, `queued` / `running`, immutable receipt binding and row progress from GET. |
| Completed, fixture assertions matched | Fixture tests matched; negative fixtures may display fail/0 as intended. Run Agent available if capabilities valid. | Per-fixture `expectedEvaluation` versus observed `EvalResult`; assertion evidence separate from evaluator label. |
| Completed, assertion mismatch | Fixture mismatch; specific expected/observed verdict; Edit evaluator. | Completed execution plus harness mismatch; review/next live run requires meaningful matching evidence. |
| Completed, evaluator rejects real response | Run completed; fail/partial criterion and explanation; retain inspectable trace. Can be eligible for review. | `completed` execution + valid normalized `EvalResult`; no conversion to runtime error. |
| Evaluator throws / invalid EvalResult | Evaluator error; sanitized source-mapped diagnostic; score absent; Edit evaluator. | Typed runtime/protocol/result-schema error. Receipt retained; no pass/0 fabricated. |
| Provider outage/rate limit | Provider unavailable with safe reason; bounded explicit Retry Run or fixture attempt; cost visible. | Typed provider code; partial/failed state. Keep completed rows. Code fixture tests remain available if runner healthy. |
| Agent output malformed | Agent response could not be read; schema error; score absent; inspect error/trace if recorded. | `agent_output_schema`; no empty successful output. |
| Budget exceeded | Run stopped at declared budget; completed/unfinished rows explicit. | Typed budget error plus consumed/reported usage and budget metadata. No automatic additional calls. |
| Timeout | Timed out; completed rows kept; unfinished rows timed out; explicit rerun only. | `timed_out`, deadlines, typed row statuses. Paid work already accepted may cost tokens. |
| Cancel clicked | Cancelling...; repeated Cancel disabled; retain displayed rows. | Idempotent `POST /api/runs/:id/cancel` then GET. Prevent new calls; server terminal result authoritative. |
| Cancelled | Cancelled; completed rows kept, unfinished cancelled; explicit Test Fixtures / Run Agent as eligible. | `cancelled`; no completion from missing rows. Late response cannot attach to a newer draft. |
| Partial / failed run | Counts and failed row reasons; no overall success or review eligibility from incomplete real evidence. | `partial` / `failed`, per-row terminal statuses. New retry produces a new immutable receipt. |
| Recording pending | Evaluation results remain visible; Recording in Phoenix; absent links replaced by pending text. | Execution status separate from `telemetry_pending`; GET may add verified links without new inference. |
| Recording failed | Results available; Phoenix recording failed. Retry recording only when supported, otherwise recovery guidance. | `telemetry_failed` and reason; proposed telemetry-only capability is a freeze request, not an invented endpoint. |
| Recorded | Actual dataset/experiment/row trace links; no invented localhost IDs. | `recorded` + verified Phoenix identifiers/URLs from URL adapter readback. |
| Comparison | Baseline and alternative receipts shown with identical dataset/source; text says teaching comparison. | Installed `agentVariant`; `POST /api/runs` agent mode; exact source/dataset equality. A new variant changes review binding. |
| Edit after terminal result | Results from previous source - stale; validation/fixtures/review eligibility invalidated. | Current code hash differs from receipt; previous immutable result stays readable. Revalidate/test/run current source. |

No unavailable budget/credential/capability is hidden by provider fallback. A transport retry of an accepted request differs from an explicit paid rerun.

## Review states

| State | Copy / action | Required evidence and transition |
| --- | --- | --- |
| `not_eligible` | Complete matching fixture tests and a real agent run before DOUBLE CHECK. List each missing prerequisite. | Current validated source, discriminating fixture receipt and completed real-agent receipt absent/mismatched. No review POST. |
| `ready_to_check` | DOUBLE CHECK; Uses review tokens; show bound source/receipt versions. | Validation hash + rubric/dataset + fixture/agent receipts + variant/profile all current; POST `/api/reviews`. |
| `checking` | Review in progress; Cancel Review; no duplicate review, edit/reset or new run. | Accepted review ID and trusted binding; GET `/api/reviews/:id`. No learner source execution. |
| `ready` | Reviewed - current version; specific summary/evidence, optional Review Again. | Schema-valid ready result with current server binding. Educational completion only; Phoenix completeness remains separate. |
| `needs_changes` | Needs revision; criterion/row/evidence/nextAction; Edit evaluator and Jump to row. | Valid findings reference installed criteria and actual examples. Retest/rerun revised source before requesting new review. Eligible explicit Review Again retains history. |
| `inconclusive` | Review inconclusive; describe missing/conflicting evidence; Retry Review when same snapshot is eligible. | Valid inconclusive assessment; never treated as completion. Additional evidence changes binding and requires review again. |
| `failed` | Review unavailable; safe operational error; Retry Review if retryable, otherwise recovery guidance. | Separate error envelope/parser/provider failure; no assessment fallback. Retry shows cost and creates new receipt. |
| Cancelling | Cancelling review...; no repeat Cancel or Retry. | POST `/api/reviews/:id/cancel`, authoritative terminal GET; completion race resolved by server binding/state. |
| `cancelled` | Review cancelled; no completion; Retry Review if eligible. | Trusted cancelled state; late LLM response is historical only. |
| `stale` | Previous review is stale. Retest and rerun this version; show prior attempt collapsed. | Any source, rubric, dataset, fixtures/run receipt digest, variant, profile/config or tutorial/exercise version change. Current badge removed immediately. |
| Late ready response | Previous version reviewed; current work needs new review. | Response binding differs from current binding; retain historical receipt, never restore current completion. |

Review reads source/comments/output as quoted evidence, without tools or executing source. Specific critique of the evaluator must distinguish a correctly rejected bad agent response from a defective evaluator. `needs_changes` is substantive feedback; `failed` is an operational failure.

## Navigation, refresh and persistence states

| Trigger | Required behavior / evidence |
| --- | --- |
| Next/Previous/sidebar/back/forward | Flush source save; update route and H1 focus; no Run/Review POST. Active accepted work continues; busy guard spans routes. |
| Reference tab change | Change read-only panel; no inference, no loss of TS source/focus binding. Arrow keys move tabs, Enter/Space activates manual tabs. |
| Refresh with active run/review | Restore saved source/accepted IDs, GET statuses and reconcile; no duplicate paid operation. Missing backend receipt displays Evidence unavailable. |
| Backend restart | Re-fetch health/capabilities and retained receipts; no automatic inference. Historical completion remains unavailable unless server binding can be verified. |
| Storage unavailable/full | Edits are not saved in this browser; retain memory; Copy evaluator; never claim Saved. |
| New exercise/tutorial/rubric/data version | Old source inspectable/copyable; new starter unvalidated; no carried completion. Explicit copy old source enters new draft and invalidates bindings. |
| Reset Exercise | Confirmation scope names one case; Cancel first focus; clear only that case's saved draft/progress/bindings, restore starter; history/Phoenix retained. |
| Reset Tutorial | Confirmation names all six local drafts/progress; remove only this tutorial's keys; no `localStorage.clear()`, credential action or Phoenix deletion. |
| Reset while busy | Disabled with Finish or cancel the active operation first; do not orphan an accepted paid operation. |
| Global provider revision changes | Safe new provider summary; revalidate capabilities; old receipts preserve provenance; review stale and future runs require explicit action. |

## ET-WP-08 / ET-WP-10 acceptance rehearsal

These are planned checks, not passed application tests. Prefer deterministic backend mocks for state races; use synthetic real runs for actual Phoenix/cost/provider evidence.

1. Start at intro: exactly seven destinations, all source/reference panes read-only; navigating all lessons causes zero inference POSTs. Explicit Run Introduction yields real experiment and trace links; offline stubs are visibly labeled and do not satisfy this check.
2. C1 happy path: edit, Validate, fixture tests include a correct and known wrong response; negative response gets fail/0 with Matched assertion; real agent run results have expected/actual/normalized verdict and trace. Validate success alone grants no progress/completion.
3. Submit syntax and type errors separately: positioned diagnostics focus the exact location; server revalidation prevents provider requests. Throw at runtime, return malformed score and reject a valid bad response: each has the distinct display described above.
4. C4 cost cue remains visible before judge-backed fixtures; individual Code/LLM Judge and case Mixed badges appear. Provider outage does not block healthy Code fixture tests; no fallback profile appears.
5. Queue/cancel, cancel/race-with-completion, timeout, partial run and budget stop: completed rows persist, missing rows never pass, repeated actions create no duplicate request, usage is observed or Not reported.
6. Phoenix unavailable: valid evaluation remains visible, experiment/trace show pending/failed reason. Recovery only records telemetry; verify no new agent/judge call. Do not claim complete tutorial evidence without links.
7. Source edit after results/review immediately removes current badge; slow prior Validate/ready review cannot bless new source. Change rubric/data/profile/variant or receipt digest and repeat stale check.
8. Review ready, needs_changes, inconclusive, parser/provider failure, retry and cancel: educational feedback references real criteria/rows, malformed/missing IDs reject the review, failure never grants completion. Spy on runner to prove review never executes source.
9. Refresh/back/forward while active and after completion: source retained, operations reconciled by ID, zero new paid calls. Server evidence lost/unavailable must not become completed from localStorage.
10. Reset one case and all cases: cancel confirmation preserves edits; confirmed reset restores only intended starters/bindings; unrelated localStorage/Phoenix history unchanged. New versions retain copyable old source but load unvalidated starter; simulate full/unavailable storage.
11. Keyboard-only at 1440px, 1024px and 390px; include 320px and 200% zoom: all seven lessons, editor escape/indent, diagnostic links, tabs, controls, row details, review links and reset dialog reachable. Focus stays visible and is restored predictably; screen-reader summaries distinguish all verdict dimensions.
12. Narrow screen with software keyboard and long source/JSON/error IDs: editor and actions usable, no page-wide overflow or fixed overlay; only code/table regions scroll horizontally. Contrast/reduced-motion checks cover every semantic badge and active focus state.

Acceptance evidence must record exact foundation/head/contracts, screen sizes, actual tool/browser used, positive and negative results, and unrun live/provider checks. Wireframe validation cannot replace this rehearsal.
