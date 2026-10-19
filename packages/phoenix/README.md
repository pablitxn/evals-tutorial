# Phoenix recording adapter

`createPhoenixTelemetry(options)` implements the frozen
`TelemetryService.record(dataset, run, signal)` interface. The server wrapper is
`createTelemetryService(options)` in `apps/server/src/telemetry/index.ts`.
`createTelemetryContext(runId, exampleId, fixtureId?)` returns trusted deterministic
`traceId`, parent `spanId` and W3C `traceparent`. These exports perform no inference.

Pass an explicit `baseUrl` of `http://127.0.0.1:6006` or
`http://localhost:6006`, a persistent private `stateDirectory`, and the trusted
`sourceProjectName` used by the agent/Node exporters. Ambient Phoenix environment
variables and provider credentials are never read by this package. Request timeout
defaults to 10 seconds and the complete recording deadline to 60 seconds.

The host calls `createTelemetryContext` before invoking Python and puts its
`traceparent` into `AgentRequest`. Python extracts it and exports to the configured
source project. The host retains the actual `AgentSuccess.traceId` in
`RowResult.phoenix.traceId`; it must match that context. Recording verifies AGENT
and LLM spans, their parent graph, and their real project. It then persists a
small `Tutorial stored row` parent span with IDs/hashes/score/status only. The
reserved parent ID belongs to this adapter; producers should export children.
The span describes an immutable stored receipt, with its run interval, rather
than asserting that recording executed the agent or evaluator.

Phoenix 20.21.3 traces are globally identified. Existing producer spans stay in
their actual source project. Each experiment task binds the verified trace ID;
its link uses the source project's read-back GlobalID, including failed agent
invocations. Failed or cancelled rows with no producer trace, and fixture receipt
spans, live in the actual experiment project. Only completed agent rows require
both AGENT and LLM spans; any existing producer trace must retain its trusted
parent graph and pass the credential-attribute check. No AGENT/LLM span is
replayed or invented.
Exporter credentials, request headers and secrets must be excluded at the producer
boundary. Recording refuses known credential attribute names in producer spans.
This check is not a general detector of secrets embedded in arbitrary values.

Datasets use stable names separated by `agent` and `fixtures`. Agent examples map
input/reference directly. Fixture examples expand `(exampleId, fixtureId)` into
stable IDs so each fixture has one task/result, without bogus repetitions or
using a fixture response as a reference. Every projection carries original
dataset ID/version/content hash in metadata. Import uses the typed pinned SDK's
declarative upload endpoint and its actual returned version ID; it verifies all
examples at that explicit version. Changed application versions create Phoenix
versions; historical pins remain immutable. Reusing an application version with
different content fails with `conflict`.

Recording accepts terminal execution receipts, including partial/cancelled/error
rows. It validates source/data hashes and row identities before network access.
Operational errors remain task errors without scores. Completed normalized results
map score/label/explanation to the `tutorial_result` evaluation. The annotation's
`CODE` kind describes this receipt exporter; the frozen aggregate result does not
expose the original per-criterion Code/LLM/Mixed evaluator kinds. Metadata explicitly
marks `recorded_from_immutable_receipt`; no new judgment is made.

The adapter reads back tasks, errors, scores/labels/explanations from Phoenix CSV,
and trace identities before returning links. UI routes must return the Phoenix
HTML shell as well. An HTTP shell check does not establish browser rendering.
All IDs remain exactly as returned by Phoenix; an incompatible installed contract
produces `telemetry_unavailable`, never a stripped or made-up GlobalID.

Atomic private journals and one shared filesystem lock serialize recording across
adapter instances/processes. Retries recover experiment/task writes by read-back
and upsert annotations without invoking inference. Reused run IDs with different
immutable evidence conflict. Preserve the directory across server restarts and use
it consistently for one Phoenix origin; do not use several independent directories
as concurrent writers. This is a local single-host design, not a distributed lock.
After a process crash, stop all recorders and inspect/remove `recording.lock`
explicitly. Locks are not stolen while a request might still commit. A lost create
response that cannot be found by read-back stays an explicit ambiguous failure;
it is never blindly recreated. Atomic rename is not a power-loss durability claim.

The caller owns RunRecord storage and its independent `telemetryStatus`. Apply
returned top-level/per-row links only after success. A failure or cancellation can
leave partial Phoenix writes; retry the same immutable receipt without inference.
Cancelled recording cannot erase already committed telemetry. This package does
not provide HTTP routes, bootstrap or global shutdown/instrumentation.

Run offline checks with:

```sh
npx tsc -p packages/phoenix/tsconfig.json
node --import tsx --test packages/phoenix/tests/record.test.ts
```

For a disposable Phoenix instance on port 6006 using the integrator's pinned image:

```sh
ET_WP07_LOCAL_PHOENIX=1 ET_WP07_PYTHON=/path/to/pinned/python \
  ET_WP07_RECEIPT=/tmp/local-phoenix.json \
  node --import tsx --test packages/phoenix/tests/local-phoenix.test.ts
```

The local suite uploads only owned synthetic contract fixtures. The Python probe
requires the pinned OTel 1.45.1 API/SDK/HTTP exporter; its AGENT/LLM spans are
explicitly synthetic and make no model call. Missing Python skips continuity.
The local/corpus suites require successful `TelemetryService.record` returns,
including actual padded GlobalIDs and valid top-level/per-row links, using the
integrator's merged contract correction. They fail on any recording error;
journal read-back never substitutes for a successful production service return.
Real corpus/runner/agent integration, actual MAF/provider telemetry and browser
rendering require separate accepted producer heads and evidence.
