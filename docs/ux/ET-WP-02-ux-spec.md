# ET-WP-02: Seven-destination tutorial UX

Status: implementation-ready proposal for ET-INTEGRATOR contract freeze; specification only.
Source: the local [curriculum](../curriculum/README.md) and
[integration contract](../contracts/v1.md).

## Decisions for immediate adoption

- Quiet light workspace, a persistent seven-item lesson navigation, a short centered explanation, a large editable TS panel and a distinct reference pane. Results and review follow below.
- Navigation, refresh, tab changes and provider status reads never start inference.
- Separate execution, fixture assertion, evaluator verdict, Phoenix recording and educational review states. A correctly rejected bad response can satisfy the learning objective.
- Three explicit computational actions: Validate, Test Fixtures, Run Agent. Each displays its applicable cost before activation. DOUBLE CHECK is a separate paid review action.
- Completion belongs to the exact server-bound evidence snapshot. localStorage remembers work; it cannot award completion.
- No authentication, extra challenges, platform dashboard, deployment, actual booking or document transmission.

## Seven destinations and lesson copy

| Route / navigation label | Mode / target time | Above-editor criterion |
| --- | --- | --- |
| `intro` / Introduction | Code / 10 min | Follow one input through a prepared Python agent, reference answer and supplied evaluator. Run explicitly, then inspect the actual experiment and trace. |
| `01-starred-classifier` / 1. Starred messages | Code / 15 min | Check the exact starred/not-starred label. Make a known wrong label fail and a known correct label pass. |
| `02-document-classification` / 2. Document types | Code / 20 min | Distinguish 1040, W-2, 1099-INT and unknown. Unsupported or unreadable material must remain visible. |
| `03-independent-tie-out` / 3. Salary tie-out | Code / 25 min | Check extraction against independent references, then reconcile wages and withholding separately. A true mismatch is a valid finding. |
| `04-policy-recommendation` / 4. Policy support | Mixed / 20 min | Check citation IDs with code; judge whether a recommendation is supported by the fictional policy and handles insufficient evidence. |
| `05-package-readiness` / 5. Package readiness | Code / 15 min | Check contents and unresolved discrepancies. Ready for human review does not grant approval or authorize transmission. |
| `06-simulated-travel` / 6. Simulated travel | Code / 20 min | Check allowed flight IDs, dates and budget, including no eligible options. Recommendations are simulated; no booking occurs. |

Setup remains an expandable header notice, not an eighth lesson. Root commands match the integrator's lifecycle contract: `npm run install:all`, `npm run env:check`, `npm run start`, `npm run demo:check`; only the explicit `--live` check consumes provider tokens. Setup copy links to the supplied README rather than adding another installation curriculum. Reserve 30 minutes for review/buffer; the roadmap's total remains 170 minutes including 15-minute setup.

Navigation rows show number, label, mode and text status: Not started, Draft, In progress, Reviewed, or Needs new review. Introduction uses Viewed / Run inspected, never a learner evaluator review. Show `2 / 6 cases reviewed` rather than counting agent passes. Lessons are freely accessible. Previous/Next and browser back/forward save edits and move only; there is no unlock requirement.

## Visual and responsive contract

See [desktop wireframe](desktop-wireframe.svg), [narrow wireframe](narrow-wireframe.svg) and the [state/acceptance matrix](ET-WP-02-states.md). Wireframes illustrate synthetic design examples, not executed results or actual Phoenix artifacts.

| Element | Concrete choice |
| --- | --- |
| Canvas | `#F6F8FB`; white panels; 1px `#CBD5E1` borders; 10px corners; no decorative gradients, charts or hero imagery. |
| Type | System sans, body 16px/1.5, title 28px/1.2, section 20px; system monospace 14px/1.6 for code, 16px on narrow screens. |
| Text / accents | Primary `#172033`, secondary `#475569`; primary action `#1D4ED8` with white text; focus ring `#1D4ED8` at 3px with 2px offset. |
| Semantic colors | Success `#166534`, error `#B91C1C`, caution `#92400E`, neutral `#475569` on pale backgrounds. Always pair color with a text label and icon shape. |
| Spacing | 4/8/12/16/24/32px scale; minimum 44px control height; 24px panel padding on desktop, 16px narrow. |
| Wide, >=1200px | 224px sticky navigation; content max 1160px centered in remaining area; heading/prose max 70ch. Editor/reference grid 2:1, editor min 560px, reference min 288px. Editor height 420px, resizable with keyboard-accessible alternate expand action. |
| Medium, 768-1199px | Navigation becomes a collapsible in-flow lesson list. Full-width editor then reference pane; actions wrap. No side-by-side editor squeeze. |
| Narrow, <768px | Header wraps provider status; Lessons disclosure lists all seven items. Explanation, editor, actions, reference disclosure, results, review stack in that order. 320px screen minimum; only code/table regions may scroll horizontally. |
| Motion | No animated page transitions. Loading has visible text and optional small spinner; honor reduced motion. |

A fixed top header is at most 64px wide-screen and in-flow on narrow screens. Avoid fixed bottom actions over the editor or software keyboard. Main content gets `min-width: 0`. Long JSON, URLs and IDs wrap or stay in their local scroll region. Results retain headings at 200% zoom. Expanding an editor is a button, not a drag-only feature.

## Workspace and references

The explanation contains objective, one example of the trap, and 2-4 rubric bullets. Keep it under about 160 words; use a disclosure for deeper rationale. Each rubric row has its own Code or LLM Judge badge. C4 rolls up to Mixed; its judge badge says what is assessed and its code badge names citation checks.

The TS editor has a filename label, Editable badge, save status and current validation status. It is separate from the reference tablist. Reference tabs are Dataset JSON and Python agent, each visibly Read-only; the Python source reflects the selected prepared variant. Dataset JSON exposes the version and hash plus input/reference/fixture sections. A document disclosure in C2/C3 shows the shared synthetic pages, source IDs and visible SYNTHETIC markings; document previews use the same content as the run. Source/reference text renders as escaped text.

Introduction uses the same structure with a Read-only TS evaluator. It has Run Introduction, Cancel when active, Inspect results and Next: Starred messages. Hide learner Validate/Test Fixtures/DOUBLE CHECK/reset-source controls there. Its small glossary defines input, response, reference, evaluator, score, dataset, experiment and trace. Use nearby official Phoenix documentation links, visibly labeled Documentation, separate from Actual experiment / Actual trace links supplied by the backend.

| Intro term | Concise teaching copy |
| --- | --- |
| Input | The question or synthetic material given to the agent. |
| Response | What the agent actually returned. |
| Reference | An independently authored expected answer, kept separate from the agent input. |
| Evaluator | A criterion applied to the response, using code or a model judge. |
| Score | This criterion's normalized result; completing execution is a separate status. |
| Dataset | Versioned examples containing inputs and reference answers. |
| Experiment | Recorded outputs and evaluations for one configuration on a pinned dataset version. |
| Trace | The recorded steps of an actual invocation, including available model/judge spans. |

Official links for the intro: [Phoenix overview and tracing](https://arize.com/docs/phoenix), [dataset concepts](https://arize.com/docs/phoenix/datasets-and-experiments/concepts-datasets), and [experiment evaluation reference](https://arize.com/docs/phoenix/sdk-api-reference/typescript/packages/phoenix-client/experiments). These documentation pages were retrieved on 2026-10-14; they are not localhost experiment/trace links and do not establish installed SDK compatibility.

## Buttons and cost cues

| Control | Intent and enabling rule |
| --- | --- |
| Validate | Free syntax/type check of exact current TS; allowed in idle/error states. Disable duplicate requests. Success says Validated, line/column links for failure. Run revalidates server-side. |
| Test Fixtures | Submit current source against prepared correct/incorrect outputs. Enabled for editable current content with available runner and no active mutation. Code: No provider calls. Mixed/LLM Judge: Uses judge tokens plus bounded calls/rows from server. |
| Run Agent | Prepared Python on the same pinned dataset, then evaluator. Enable after matching discriminating fixture evidence and current required capability status. Always Uses agent tokens; add judge tokens where applicable. |
| Cancel | Shown for active run/review; becomes Cancelling... and disables repeated activation. Server terminal state wins races. Copy: Completed rows are retained. Accepted provider calls may still cost tokens. |
| Agent variant | Installed variant select, default prepared baseline; changing it updates Python view and review binding. No free-text variant or learner Python edits. |
| Compare Prepared Agent | Optional after baseline evidence; explicit paid run of one installed alternative using identical dataset version and source hash. Disabled when stale/busy/incompatible. A historical comparison view does not initiate a run. |
| Inspect results | Scroll/focus results heading. No inference. Dataset/experiment/trace links use verified backend URLs; links name the target and new-tab behavior. |
| DOUBLE CHECK | Enabled only with matched validation, meaningful fixtures and a completed real-agent receipt. Reads code, results and rubric as data; never executes submitted source. Uses review tokens. |
| Retry Review | Explicit same-snapshot retry after operational failure or inconclusive judgment when eligible. Shows cost again; new review receipt, previous attempt remains inspectable. |
| Review Again | Explicit eligible repeat of educational feedback; retains attempt history. No automatic retries until success. Needs changes prioritizes Edit evaluator, retest, rerun. |
| Reset Exercise / Reset Tutorial | Local reset with small confirmation dialog naming affected scope. Restore starter/clear local bindings; preserve Phoenix history. Cancel receives initial dialog focus. |

While a run or review is active, lock source mutation and variant/reset actions; allow reading, tabs and navigation. Persist before submission. Refresh restores source and reconciles accepted operation ID via GET; never POST again solely because of refresh. Unknown submission outcomes retain their request ID and offer Check status; a transport retry uses that same ID. Explicit rerun/review generates a new ID. Buttons must use backend busy state across lessons to prevent parallel paid actions. Validation may be superseded by a newer edit; accept its result only for the checked source hash.

Display safe provider/model-or-deployment summary in the header; profile comes from backend configuration. Missing capability gives a precise Setup required message. Keep free Code fixture work usable during provider outage when the isolated runner is healthy. Show server-declared row/call/token/retry bounds next to paid controls; unavailable bounds disable the paid action. Usage displays observed tokens and duration, or Not reported. Monetary totals appear only if backed by actual pricing/provenance; never invent a dollar estimate. No provider switching or credential entry in the frontend.

## Result evidence and Phoenix

Two result tabs: Fixture tests and Agent run; optional comparison appears within Agent run, not a new destination. Caption each table with source hash prefix, dataset version, variant/profile and receipt timestamp. Mark stale snapshots in text.

| Fixture table | Agent table |
| --- | --- |
| Fixture/example ID; intended correct/incorrect response; expected evaluation (label/score or accepted band); observed evaluation; assertion Matched/Mismatch/Inconclusive/Error; explanation; details. | Example ID; expected reference; actual agent response; criterion badge; normalized label/score/explanation; execution status; actual trace link or explicit unavailable reason. |

Both expose Input / Reference / Response in row details. Expected reference is distinct from the fixture's expected evaluation. Score 0 / fail can be a Matched fixture assertion. Runtime/provider/schema error rows have an em dash score and error text. Domain uncertainty stays in actual response and is evaluated according to the rubric. Summaries count completed, matched, mismatched, inconclusive and errored rows separately; missing rows never count as passes. Live agent failures may be correctly detected and need not prevent educational completion.

Show Dataset and Actual experiment links above agent results and Actual trace per row only when backend readback verified them. Pending: Recording in Phoenix. Failed: Results available; Phoenix recording failed, with reason. Retry recording requests telemetry only and must not rerun inference; expose this action only if ET-INTEGRATOR supplies that capability. Otherwise show local recovery guidance. Historical links remain attached to their original snapshots. Overall tutorial demonstration remains incomplete while required Phoenix evidence is absent, even if DOUBLE CHECK reports Reviewed for a lesson.

## DOUBLE CHECK feedback and completion

Place review beneath results with input summary (code, rubric, dataset, fixture and real-run receipt versions) and visible cost cue. Disabled explanation names missing prerequisites. Checking shows Review in progress plus Cancel Review. A review is educational and fallible; it does not grant C5 human approval.

Render `summary`, then each finding's `criterionId`, `exampleIds`, evidence, feedback and next action in plain language. Example: "Withholding tie-out: fixture withholding-only-mismatch received pass. Compare withholding independently of wages, then retest this fixture." This is illustrative copy awaiting ET-WP-01 IDs, never a fabricated executed finding. Add Jump to referenced row; show line links only when actual source positions exist.

`ready`: Reviewed - current version; `needs_changes`: Needs revision with Edit evaluator; `inconclusive`: Review inconclusive with reason/evidence requirement; operational `failed`: Review unavailable with retryable error and Retry Review. No new completion badge for stale, failed, cancelled or malformed reviews. Late responses stay in history. A ready result only applies when the trusted server binding still matches all current source/rubric/dataset/receipts/variant/profile versions.

After any edit show Previous review is stale. Retest and rerun this version. Preserve historical feedback in a collapsed Previous attempt. All six current ready reviews plus required actual Phoenix evidence yield Tutorial reviewed; there is no certificate or universal correctness claim. See the companion matrix for every transition.

## Persistence, accessibility and reusable components

Use `evals-tutorial:<tutorialVersion>:<exerciseId>:<exerciseVersion>` per architecture. Store exact source, safe version IDs, selected tab, receipt/review IDs and draft save time; never keys, full provider configuration, credentials or sensitive environment values. Server receipts are authoritative. Save on every edit; pending debounce flushes before route change/run/unload. Storage failure shows Edits are not saved in this browser and keeps in-memory work plus Copy evaluator; never silently drop an edit.

New tutorial/exercise/rubric/dataset version: show Saved work belongs to an older version, keep the old source inspectable/copyable and load the new starter. An explicit Copy old source into editor creates a new unvalidated draft; it carries no completion. Reset cancels/reconciles active work before mutating; reset controls are disabled while busy. Tutorial reset removes this application's keys only and never calls `localStorage.clear()` or deletes Phoenix data. On refresh/restart re-fetch versions, receipt IDs, review binding and capabilities; missing server evidence becomes unavailable and blocks completion until new evidence exists.

Use native landmarks, one H1, a Skip to evaluator/content link, `aria-current` lesson link and a named editor. Logical focus: lesson navigation -> objective -> editor -> run actions -> references -> results -> review. Tab leaves the editor by default; indent has a documented shortcut. Provide accessible plain-text editor fallback. Diagnostic links focus exact 1-based line/column and announce the message. Invalid state is indicated inline and in an error list, not solely by squiggles. Tabs use roving focus with arrows, Home/End and Enter/Space; only the active panel is exposed.

Route changes focus H1; tab changes stay on tabs; asynchronous progress never steals focus. Announce bounded summaries in polite live regions, not every poll/row. Submit/cancel terminal updates focus the status heading only if focus remains in that action area. Reset dialog traps focus and restores its trigger; Escape cancels. Results use real tables with captions/headers and row detail buttons; narrow layout preserves table semantics and local horizontal scrolling with an accessible region label. No hover-only explanations. All controls >=44px; check contrast, 200% zoom, reduced motion and software-keyboard access during ET-WP-08.

Reuse a single TutorialShell, LessonNav, ModeBadge, EvaluatorEditor, ReferenceTabs, ActionBar, DiagnosticList, ResultsTable, PhoenixLink and ReviewPanel. Use React/TS from the accepted foundation; no chart library, canvas or animation dependency is required. Candidate editor: CodeMirror 6 only after integrator approves/pins it; retain a native textarea fallback and test actual keyboard behavior. Never regenerate manifests/locks in this package.

## Contract requests for ET-INTEGRATOR

These are semantic inputs, not an independently authored schema. Names below reference architecture proposals; adapt only after `packages/contracts/**` is frozen.

1. Manifest supplies seven IDs, versions, source/variant text, rubric criteria/modes and fixture expectations; safe service status supplies profile revision and capabilities/budgets.
2. Validation supplies exact source hash and positioned diagnostics; run receipts supply source/version/variant/profile binding, separate execution/telemetry states, row progress/errors/evaluations, fixture assertion verdicts and verified Phoenix URLs.
3. Reviews supply trusted binding hash and receipt IDs, operation state/error separate from assessed ready/needs_changes/inconclusive, plus specific valid criterion/example findings.
4. GET recovery supports accepted operation IDs and authoritative session busy state across routes. Unknown acceptance is reconciled using the existing request ID, never automatic new paid submission.
5. Comparison needs installed variants and version equality checks. Telemetry-only retry needs explicit idempotent capability; otherwise UI exposes guidance only.

Use the local integration contract and contribution instructions when changing these interfaces.
