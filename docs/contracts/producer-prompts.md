# Launch-ready producer prompts

Parent supplies the published foundation SHA and each isolated branch before
launch. Read AGENTS.md, docs/contracts/v1.md and dependencies.md. Shared manifests,
locks, contracts, scripts and HTTP/bootstrap/content loader are ET-INTEGRATOR-only.
No nested launches, merge, force push or deployment. English Conventional Commits;
verify canonical identity and publish immutable task evidence and draft PR.

## ET-WP-04 synthetic corpus

From the exact ET-WP-03 foundation SHA, implement only content/** and your evidence.
Consume @evals-tutorial/contracts Dataset/Tutorial/DocumentManifest and /node
`datasetHash`/`sha256`. Supply content/tutorial.json with the seven exact IDs and
content/datasets/<datasetId>/<datasetVersion>.json. ET-WP-01 owns curriculum spec;
use its accepted content. C2/C3 share synthetic PNG/PDF file IDs and one hashed
manifest. Independently author references and discriminating fixtures; money is
integer minor units. No external dataset, real records, Python reference leakage
or shared manifest changes. Validate all envelopes/hash identities and required
positive/negative cases. The shared ContentService loads your files automatically.
Coordinate final Python consultation source with ET-WP-05 through integrator.

## ET-WP-05 Python/provider/broker

From foundation and ET-WP-00 verified pins, own apps/agents/src/**, tests and
apps/server/src/{providers,judge-broker}/**. Implement AgentService and ProviderBroker
from @evals-tutorial/contracts/services. Python `-m tutorial_agents` takes one
AgentRequest JSON line and returns AgentResponse; generated types/validation are
in tutorial_contracts. No expected/source/fixtures enter Python. Use one explicit
global OpenAI/Azure resource profile for all roles; no fallback. Judge binding is
immutable and bounded; ProviderBroker.review is non-executing. Verify malformed
outputs, limits, aborts and reference exclusion offline; distinguish live receipts.
Return exact factories/exports and dependency needs to integrator for HTTP wiring.

## ET-WP-06 TypeScript compiler/runner

From foundation, own packages/evaluator-runtime/** and server validation/runs/runner
subtrees, excluding package manifests. Implement ValidationService/RunService and
export createRunnerServices from runs/index.ts. Imports/types and judge JSONL RPC
are frozen in the contract. Validate exact source before paid calls; idempotency,
immutable receipts, bounded concurrency/time/output and cancellation required.
Docker is the execution boundary; no unrestricted child-process fallback. Missing
isolation returns isolation_unavailable. Exercise abuse/failure cases and record
actual Docker flags/platform results. Request dependencies instead of editing locks.

## ET-WP-08 learning UI

From foundation plus accepted ET-WP-02 UX, own apps/web/** except package manifest.
Use React/Vite and wire exact v1 HTTP requests/responses. Seven destinations only;
TS editing with read-only dataset/Python tabs, separate fixture/agent/review actions,
visible cost, diagnostics, cancellation, stale edits and versioned localStorage.
No provider request on navigation or guessed Phoenix links. Match the supplied API
mocks to schema. Supply tsconfig/Vite config/index.html/source; tell integrator to
activate build/typecheck scripts and request any editor dependency before use.
Browser tests/screenshots use synthetic content; mark mocks until real integration.

## ET-WP-07 Phoenix (after producers)

Implement TelemetryService.record against accepted Dataset/RunRecord in
packages/phoenix/** and server telemetry/**. Use ET-WP-00 verified SDK pins; request
manifest/image updates from integrator. Verify idempotent dataset versions,
experiment version binding, correlated trace readback and actual URLs. Retry
recording without repeating inference. No fake links or completion on failed writes.

## ET-WP-09 DOUBLE CHECK (after producers)

Implement ReviewService in packages/review/** and server review/**. Read stored
fixture/agent evidence, build ReviewBinding and call ProviderBroker.review.
Match code/data/rubric/agent/provider/receipt hashes. Never execute submitted code;
validate ReviewAssessment IDs and evidence, separate operational errors, preserve
immutable retries and reject stale completion. Test malicious quoted instructions,
malformed output, provider failure, abort and late results. Wire UI through existing
endpoints; no changes to contracts, root HTTP or frontend ownership.
