# ET-WP-06 isolated runner receipt

Observed 2026-10-14 UTC on Linux amd64, Node 24.19.0, npm 11.9.0,
TypeScript 5.9.3, Docker client/server 28.4.0 and Python 3.12.14.
This receipt covers evaluator compilation/execution and run orchestration;
it does not establish tutorial release acceptance, deployment or live inference.

Original foundation: `5f95fca766616b770152665d00031e516f967c22`.
Own branch: `feat/et-wp06-isolated-runner`.
Accepted dependency updates were incorporated additively from main at
`d54fe4add6c0e3be74f2e660e990a7c9c19d5e3d`, then
`c144dce2c363898c04d7a9f2362a922e0d3d9e31` (corpus/review integration).
Implementation revision: `7fdbb166bea170155fed8442a5c08fc5ba74ec1f`.
The subsequent evidence-only commit is identified by the final PR head handoff.
No PR was merged by this producer. No history was rewritten or deployment made.

Read tutorial AGENTS.md, frozen v1/dependency/producer contracts, readiness PR2,
and Atlas main `8b8f5acebc7cd4430b7b1b7943b5f9e09817ab0e`: root/Atlas AGENTS,
atlas-navigate skill, source precedence, engineering/identity/integration standards,
and the 2026-10-14 roadmap/architecture. Atlas is context; the tutorial's frozen
contracts govern implementation. No unavailable historical skill was installed.
The selected model/effort/service tier is not exposed for independent verification.

## Delivered boundary and behavior

The factory `createRunnerServices(options)` in
`apps/server/src/runs/index.ts` returns `{ validation, runs }` implementing frozen
ValidationService/RunService. Its required and optional dependencies are documented
in [the runtime README](../../../packages/evaluator-runtime/README.md).
No manifest, lock, shared contract, HTTP/bootstrap, root script or another producer's
source was independently edited. Accepted upstream dependencies retain their owners.

Compilation and execution run only in restricted Docker containers. The virtual
SDK contains frozen wire types and EvalContext, with no host Node/DOM types or
learner compiler configuration. Only the two tutorial entries' type imports are
accepted. Syntax/type/signature diagnostics contain editor line/column; hashing
covers exact UTF-8 source. Validation completes before agent/judge calls. Missing
Docker/image/seccomp/resource capabilities fails with `isolation_unavailable`.

Workers have no network, secrets, host paths, environment files or Docker socket.
Source/input are JSONL stdin data, with no mounts. UID/GID 65532, read-only root,
all caps dropped, no-new-privileges, one CPU, 256 MiB memory/no swap, 32 PIDs,
96 MiB V8 heap and a 16 MiB tmpfs are enforced by the exercised Docker invocation.
Protocol stdout is capped at 1 MiB; diagnostics stderr at 64 KiB. Docker logging
is disabled. An empty private Docker CLI config prevents proxy-env injection.
The host checks frozen judge RPC, unique IDs, binding, methods, criteria, call
budget, deadline and cancellation; all LLM work goes through the injected broker.

Runs freeze source/content/provider provenance, persist append-only fsynced state
receipts, return defensive copies, enforce request-ID idempotency/conflict, retain
terminal history, and cancel unfinished recovered work without paid replay.
One run/two rows execute at a time, and validation has a separate single-compiler
gate. The runtime itself caps concurrent workers at two. A run allows at most 64
rows, five minutes, and 128 retained runs per session; reaching capacity blocks
new runs. Cancellation awaits container removal and preserves completed rows;
late provider replies cannot complete or alter terminal receipts.

Fixture mismatch (`fixtureMatched: false`) and valid fail scores are completed
execution. Operational failures retain typed errors without fabricated scores.
AgentRequest has no expected references, fixtures or evaluator source. Responses
and domain schemas are checked. Trusted W3C context is injected before agents;
validated AgentSuccess.traceId is retained as RowResult.phoenix.traceId even when
evaluation fails. No Phoenix URLs are invented; telemetryStatus is not_requested.

## Actual evidence

The complete worker image exercised here is the immutable local Docker image ID
`sha256:8230d713a84c8839e2a7d191be07750c3b659bd488a80f5d18a83baeb32b1def`.
This is a local complete-image ID, not a published registry digest. Its base is
the pinned manifest in scripts/runtime-pins.json:
`node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df`.
Dockerfile honors the integrator's RUNNER_BASE_IMAGE build argument. Build used
`--network=none`; build input hashes are in the source manifest.

- [Docker + service suite](20261014-01-docker-and-service-tests.txt): 20 passed,
  zero failed/skipped. Actual compilation, fixture evaluation, thrown exceptions,
  inconsistent normalized results, prohibited imports/references, escaped Node
  filesystem/socket/secret access, TEST-NET socket rejection, tmpfs exhaustion,
  infinite loop, heap pressure, stdout/stderr floods, malformed/unknown protocol,
  broker binding/criteria/budget abuse, cancellation/removal and abandoned-session
  cleanup were exercised. Judge answers in these tests are explicit mocks.
- [Current service suite](20261014-01-current-service-tests.txt): 9 passed, zero
  failed/skipped after the final concurrency gate. Covers immutable copies,
  request conflicts, disk recovery, negative fixture truth, malformed agents,
  reference exclusion, W3C injection/trace retention, queue/retention bounds,
  cancelled/late replies, run deadlines and actual Docker run/cancel behavior.
- [Actual inspection](20261014-01-docker-inspection.json) records running worker
  flags/limits, no mounts, and only PATH/NODE_VERSION/YARN_VERSION in its image
  environment. The final task-container inventory was empty.
- [Synthetic run receipt](20261014-01-synthetic-run.json) retains real Docker
  evaluator results on explicitly synthetic fixtures. Its repository/dependency
  fields are deliberate test placeholders, not production provenance. Production
  wiring must inject the actual source and combined dependency-lock hash.
- [Seven starter compilations](20261014-01-seven-starter-compilation.json): all
  integrated content starters compile inside the final worker image, no diagnostics.
- [Combined foundation/corpus/review tests](20261014-01-integrated-tests.txt):
  80 passed, zero failed, one Docker suite skipped because this separate aggregate
  invocation omitted ET_RUNNER_IMAGE. That skip is covered by the explicit actual
  Docker suite above. `contracts:check`, root `typecheck` and `build`, plus explicit
  evaluator-runtime/server TypeScript checks passed. `git diff --check` passed.
- [Source hashes](20261014-01-source-hashes.json) freeze owned implementation
  files at the implementation revision. [Language/commit check](20261014-01-language-check.json)
  applies the Atlas helper functions to this repository. Human English/provenance
  review remains necessary. The identity guard passed before each producer commit;
  actual author/committer are Pablo Coronel <git@pablocoronel.com>.

The first Docker attempt failed because copied worker directories were unreadable
by the non-root user; COPY permissions were fixed. Actual heap exhaustion exited
139 with a V8 memory diagnostic, so that evidence now distinguishes resource limits
from unrelated runtime crashes. Cancelling an in-flight docker run exposed a
creation race; create is now awaited before attach/start and confirmed-name cleanup.
The Docker default config also injected proxy variables; the empty private config
removes that inheritance. Failed preliminary attempts are not passing evidence.

## Integrator handoff and remaining gates

1. Add server dependency `@evals-tutorial/evaluator-runtime: 0.1.0`; TypeScript
   5.9.3 is already pinned. Activate evaluator-runtime build/typecheck scripts
   using `tsc --noEmit`. Include apps/server/src/runs/service.test.ts in root tests.
   Actual runner acceptance must supply ET_RUNNER_IMAGE rather than accepting skips.
2. Root HTTP/bootstrap injects `{ validation, runs }`. Required inputs are the
   verified ContentService, built local image ID, exact repository revision,
   dependencyLockHash and ignored host receiptDirectory (one server per directory).
   Optional inputs are AgentService, JudgeBroker, safe ProviderSummary,
   resolveDocuments and createTelemetryContext. The document resolver accepts
   host-verified exercise/input context; no browser path is allowed into the worker.
3. Connect ET-WP-07 createTelemetryContext and configure the same sourceProjectName
   in Node/Python adapters. AgentRequest cannot carry a new project-name field under
   frozen contracts. Telemetry recording, verified URLs and review integration are
   integrator/ET-WP-07 follow-through; no schema blocker is identified for trace IDs.
4. Missing existing live credentials/model selection blocks live agent/judge calls.
   None were attempted; provider request count and token spend are zero. Real ET-WP-05
   provider wiring, multimodal/corporate access, Phoenix correlation readback,
   Mac arm64 and clean release/browser rehearsal remain distinct acceptance gates.

Receipts are immutable after publication. Corrections must be additive, naming
their predecessor. The final handoff provides draft PR URL, refreshed base/head
and exact binary patch export/checksum. This producer did not merge or deploy.
