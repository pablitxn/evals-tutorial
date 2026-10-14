# ET-WP-01 early schema and fixture handoff

Source Atlas main: `8b8f5acebc7cd4430b7b1b7943b5f9e09817ab0e` (fetched 2026-10-14).
Owner repo: `pablitxn/evals-tutorial`. Integrator: Astra thread
`01a13a94-f55c-7187-bac7-8f4acaa910d2`; readiness: thread
`01a13a94-6e52-7043-8547-fae0286d60c0`; parent
`01a118ed-6bf7-7481-93e6-336de48270f7`.
At first inspection the mounted owner checkout was clean/unborn on `work`;
successful `git ls-remote origin HEAD refs/heads/main` returned no refs.
There is no application base SHA. This task does not initialize that checkout.

The integrator can freeze these choices immediately; producer 04 can begin
authoring source pages and truth without waiting for UI work. These files are
specification samples, not the actual synthetic corpus or executable schemas.

| Choice | Requested v1 decision |
| --- | --- |
| IDs | Keep architecture's `intro`, `01-starred-classifier` through `06-simulated-travel` route IDs; datasets are route ID plus `-v1` (intro `intro-v1`). |
| Versioning | `tutorialVersion`, each exercise/rubric/dataset/fixture version `1.0.0`; bump when evidence-affecting content changes. Integrator owns shared schema version. |
| Evaluation | Code 1/pass or 0/fail; specific nonempty explanation names criterion and row evidence. Policy 1/pass, 0.5/partial, 0/fail. Operational failures separate. |
| Money | Nonnegative safe integer USD cents, null for unknown, no string coercion; zero tolerance. Reject null/undefined in arithmetic. |
| Forms | Shared `tax-demo-v1` opaque document IDs TD-001..TD-009, visible synthetic marks, 2025 fictional year; PDF plus PNG adapter only after provider capability verification. |
| Ground truth | W2-A wages 4200000, withholding 420000; W2-B 1850000/185000; 1040 base 6050000/605000; interest 12500 excluded from wages/withholding. |
| Tie-out variants | 1040 balanced, wage-only mismatch 6150000/605000, withholding-only 6050000/615000, both 6150000/615000; also unreadable W2 yields indeterminate. |
| Policy | Original four-clause policy `POL-1` to `POL-4`, exact citation quotes/evidence IDs; quality judged independently of citation membership. See C4. |
| Package | `incomplete`, `needs_reconciliation`, `ready_for_review`, `approved`; separate `humanApproval`; all outputs `transmission:"not_sent"`. Human decision is a supplied simulated input, not executed by the app. |
| Travel | Two synthetic airports `AAA`/`BBB`, fixed 2027-03-10/2027-03-13, USD budget, fare+fees; recommendation/no_options, never booked. |
| Judge cost | C4 max one judge call/eligible fixture or row, no implicit retry, 600 output tokens/call; DOUBLE CHECK separate one call/900 output tokens. Integrator ratifies/enforces bounds. |

Schema shapes, exact authored row values and fixture deltas are in [cases.md](cases.md).
Document fields and arithmetic authoring receipts are in [documents.md](documents.md).
All input/reference splits are explicit: Python sees input and resolved documents;
expected references, fixture answer keys and evaluator source stay out of its request.

Requests for 03: translate these proposed closed shapes to its single JSON Schema
authority and generated TS/Python types; reject unexpected fields and malformed
money. Permit semantic bad fixtures with valid shape. Schema-invalid examples
test the loader/provider error path, not learner execution. Pin mandatory fixture
IDs; passing a selected subset is not evidence of discrimination. Provide a
rubric-to-criterion allowlist and permitted judge limits. Keep source hashes and
review binding version semantics from the architecture.

Publication waits for 00/03's supplied foundation SHA and instructions. Then use
an isolated worktree/branch, copy only `docs/curriculum/**` and the unique
`docs/evidence/ET-WP-01/**` receipt, guard both Git identities, commit
`docs(curriculum): specify intro and six fixture-first exercises`, and open a
focused draft PR against the supplied base branch. No shared manifests/contracts,
application/content code, initial commit, merge, deployment or credentials.

This session stops after specification. ET-WP-04 actual documents/datasets/
fixtures require the parent's resumption and frozen v1 contracts; this handoff
does not mark 04 started or completed.
