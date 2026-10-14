# Isolated evaluator runtime

This package compiles and evaluates learner TypeScript exclusively in Docker.
The host invokes the Docker CLI; it never imports or executes learner JavaScript.
Unavailable Docker, seccomp, memory/swap/PID/CPU limits or a pinned local image
returns `isolation_unavailable`. There is no host-process or VM fallback.

Build from the repository root after the integrator-owned `npm ci`:

```sh
docker build --network=none --build-arg RUNNER_BASE_IMAGE=<scripts/runtime-pins.json runnerBaseImage> --file packages/evaluator-runtime/Dockerfile --tag evals-tutorial-runner:0.1.0 .
docker image inspect evals-tutorial-runner:0.1.0 --format '{{.Id}}'
```

Resolve the built image to its immutable local `sha256:` image ID and supply that
ID to `createRunnerServices`. A local image ID is not a published registry digest;
the frozen base manifest digest and complete worker build inputs are separately
recorded in evidence. Tags are rejected for execution. The Docker build context
copies only TypeScript's installed library and this package's fixed worker files.
No source, input, repository, home, environment file or Docker socket is mounted
into workers. Submitted source/rows travel through bounded stdin/stdout JSONL.
The Docker CLI uses a private empty configuration, preventing configured proxy
or credential environment injection into containers.

Both compiler and evaluator use UID/GID 65532, no network, a read-only root,
dropped capabilities, no-new-privileges, 256 MiB memory with no swap, 32 PIDs,
one CPU, 96 MiB V8 heap, a 16 MiB noexec/nosuid/nodev tmpfs, bounded file
descriptors and no core dumps. Docker logging is disabled; the host caps stdout
at 1 MiB and stderr at 64 KiB. The compiler deadline is ten seconds. Evaluations
are at most ten seconds for Code or ninety seconds for judge-backed exercises.
Docker creation/cleanup each have an additional five-second supervisor bound.
Required daemon capabilities are checked before paid calls; deployment on another
host still requires actual adversarial evidence for that platform.

Compilation receives a fixed virtual SDK, ES2022 libraries, no DOM/Node ambient
types, no compiler configuration or plugin input, and only type imports from
`@evals-tutorial/contracts` and `/services`. The checked-in virtual public wire
types are byte-matched against the frozen generated contract by tests. It checks
the exported `evaluate` signature as well as syntax/types, with 1-based editor
positions and capped diagnostics. Source hashes cover exact UTF-8 bytes.
Import restrictions are a teaching API; Docker supplies the execution boundary
even when deliberately malicious code escapes the TypeScript API with `any`.

Only frozen `JudgeRpcRequest` messages are brokered. The supervisor checks shape,
method, ID uniqueness, immutable run/example binding, message size, outstanding
calls, criteria and a lifetime limit of two calls (zero in Code mode). The broker
receives host-bound row/provider context, a deadline, AbortSignal, 2048-token
output bound and no retry allowance. No worker-provided endpoint, model, tool,
document path or replacement row is accepted. Invalid normalized results and
execution errors have no evaluation score.

The exported `createRunnerServices(options)` in
`apps/server/src/runs/index.ts` returns `{ validation, runs }` for HTTP injection.
Required options: `content: ContentService`, `imageDigest`, exact
`repositoryRevision`, `dependencyLockHash` and trusted `receiptDirectory`.
Use an ignored `.local/runs` directory, one server process per directory. Optional
options are `agent: AgentService`, `judge: JudgeBroker`, non-secret `provider`, a
host-only `resolveDocuments` callback, and ET-WP-07 `createTelemetryContext`.
The trace callback returns trusted `traceparent`/`tracestate`; validated
`AgentSuccess.traceId` is retained in `RowResult.phoenix.traceId`, including
evaluation failures. The agent and telemetry adapters must share their configured
source project name; it cannot be added to the frozen AgentRequest wire envelope.
Telemetry recording belongs to ET-WP-07/integrator; this service currently reports
`telemetryStatus: not_requested` and emits no invented URLs.

At most one run and two rows execute concurrently; each run has a five-minute
deadline, at most 64 rows, and the session retains at most 128 runs. Reused request
IDs return the same receipt; conflicting payloads return `conflict`. Retention
capacity blocks new runs instead of deleting idempotency evidence. All receipt
state revisions are append-only, fsynced files; terminal receipts are unchanged.
Restart preserves completed rows and cancels unfinished receipts without repeating
provider calls. Corrupt receipts fail closed. Observers receive defensive copies.
Cancellation stops new work, signals providers and awaits worker removal; late
provider replies cannot rewrite receipts. Calls already accepted upstream may
still incur cost. Startup preflight removes abandoned containers only for the
stable receipt-directory session label. A failed cleanup closes that executor.

Fixture mismatch is `status: completed, fixtureMatched: false`; a valid failing
criterion is also completed execution. Runtime/protocol/provider/timeout failures
have separate operational errors. Agent inputs contain no expected references,
fixtures or evaluator source. Domain schemas and response identities are checked.

Producer checks (Docker tests deliberately skip if no image was supplied):

```sh
npx tsc -p packages/evaluator-runtime/tsconfig.json
npx tsc -p apps/server/tsconfig.json
ET_RUNNER_IMAGE=<immutable built image ID> node --import tsx --test --test-concurrency=1 packages/evaluator-runtime/tests/docker.test.ts apps/server/src/runs/service.test.ts
```

Integrator dependency requests: add `@evals-tutorial/evaluator-runtime: 0.1.0`
to server dependencies; activate runtime build/typecheck scripts with `tsc
--noEmit`; add these producer tests to offline acceptance with an explicit built
image ID. TypeScript 5.9.3 and all other required dependencies are already pinned.
Producer manifests, locks, HTTP and root scripts have not been edited.
