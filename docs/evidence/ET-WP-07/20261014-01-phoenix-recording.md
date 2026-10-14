# ET-WP-07 Phoenix recording receipt

Observed 2026-10-14 UTC on Linux x86_64. **Owned implementation and bounded
persistence checks are ready; production service success and real producer
integration are blocked.** This receipt does not close G2/G3 or claim a live
provider run. Final commit/PR identity is supplied in the publication handoff,
avoiding a self-referential hash in this document.

## Repository, authority and ownership

- Repository: `pablitxn/evals-tutorial`; root `/workspace/evals-tutorial`.
- Initial local checkout was clean and unborn on `work`; exact fetched foundation
  `5f95fca766616b770152665d00031e516f967c22` became the base of
  `feat/et-wp07-phoenix-recording`.
- Parent authorized incorporation of pinned main
  `d54fe4add6c0e3be74f2e660e990a7c9c19d5e3d` and changed draft target to `main`.
  Accepted review main `381ace40dc92a6ef597711039de3ab66b8b4c132` and corpus main
  `c144dce2c363898c04d7a9f2362a922e0d3d9e31` were incorporated by fast-forward;
  no local history was rewritten. Final tested parent is `c144dce...`.
- Owned additions: `packages/phoenix/{src,tests,tsconfig.json,README.md}`,
  `apps/server/src/telemetry/index.ts`, and this unique evidence receipt/directory.
  No producer change to any manifest, lock, shared contract, root script,
  HTTP/bootstrap, content, other producer or Atlas file.
- ET-INTEGRATOR: thread `01a13a94-f55c-7187-bac7-8f4acaa910d2`, sole owner of
  shared files, bootstrap and combined candidate. Parent relays dependencies.
- Read owner `AGENTS.md`, contracts `v1.md`, `dependencies.md`,
  `producer-prompts.md`, ET-WP-03 evidence, PR2 readiness at
  `b4a7bb981c7c115f4ea33651d1563200153942d0`, and its Phoenix probe.
- Atlas current main `8b8f5acebc7cd4430b7b1b7943b5f9e09817ab0e`: roadmap,
  architecture, root/Atlas instructions, source precedence and relevant
  `atlas-navigate` skill were consulted read-only. Restored Atlas root remained
  clean at `474f561da362def07f5f1883f58a3db840f02b2c`; no absent historical skill
  was installed. Owner checkout has no additional local skills.
- English scoped Conventional Commit and local identity guard required.
  `cloud_git_identity.py --apply` and read-only checks verified both effective
  roles as `Pablo Coronel <git@pablocoronel.com>`; only local tutorial identity
  was changed. Global configuration was preserved.
- Requested model/effort/speed follows delegated task; executor introspection
  is not exposed, so actual model, effort and FAST are not independently verified.

## Implemented interface and exact handoff

`@evals-tutorial/phoenix` exports:

```ts
createPhoenixTelemetry(options: PhoenixTelemetryOptions): TelemetryService
createTelemetryContext(runId: string, exampleId: string, fixtureId?: string): {
  traceId: string; spanId: string; traceparent: string;
}
```

`apps/server/src/telemetry/index.ts` exports
`createTelemetryService(options): TelemetryService` and re-exports
`createTelemetryContext`. Integrator supplies explicit loopback origin on port
6006, persistent private `stateDirectory` and the trusted producer
`sourceProjectName`; request/recording defaults are 10/60 seconds. No global
instrumentation/bootstrap is performed and no provider environment is read.

Call the context helper on the host before Python invocation. Pass `traceparent`
into AgentRequest and retain actual AgentSuccess.traceId in RowResult.phoenix.traceId.
Python/Node export child spans to `sourceProjectName`; this adapter reserves and
later persists the helper's parent span ID as a clearly named stored-row receipt.
Completed agent rows need actual matching AGENT/LLM read-back and connected parent
graphs. This handoff was requested through parent; accepted agent/runner heads
were not available for integration in this receipt.

The adapter imports explicit dataset versions, persists immutable execution
outputs/errors, upserts normalized result annotations, reads back CSV and traces,
and returns verified links only after contract validation. It has no callable
agent/evaluator dependency and cannot repeat inference on retry. Fixture identities
expand into their own dataset projection with original content hashes; actual
references remain expected outputs. Error rows have no fabricated score. Parent
owns application RunRecord storage/telemetryStatus updates and retry HTTP wiring.

Phoenix trace/span IDs are global across projects. A failed exploratory copy
confirmed duplicate-span rejection; an attempted same-trace re-export into another
project was stored in the original project. Final code preserves original
producer spans and binds the actual experiment task.trace_id to their original
source project. It never copies/replays AGENT/LLM spans. Fixture trace parents live
in their actual experiment project. Read-back project GlobalIDs determine links.

Adapter-emitted spans include only fixed IDs, hashes, mode/status and score/label.
They contain no payload/source/explanation/credential/environment values.
Producer exporters must redact at source; known credential attribute names cause
recording failure. This is not a general detector of secrets in arbitrary values.
Actual source span times/tokens stay on original producer spans, without invented
usage/cost totals. Aggregate `tutorial_result` annotation is CODE for the receipt
exporter; original per-criterion evaluator kinds are absent from frozen RunRecord.

Atomic journals and a shared filesystem lock cover concurrent instances/processes
and server restart. Ambiguous experiment creation is searched by persisted key;
if not found, it fails closed instead of blindly repeating create. Stop all
recorders before inspecting/removing a crash-surviving lock. This is a single-host
filesystem design, not distributed fencing or power-loss durability.

## Observed tests and runtime

Environment: Node 24.19.0, npm 11.9.0, Python 3.12.14, Docker 28.4.0.
Pinned Phoenix: 20.21.3 from
`sha256:333ae941c99a366f90542cacfa5fa0745a331f13c2e66857de5e44c19a46f6e0`.
Only task-owned disposable container `et-wp07-phoenix`, loopback port 6006, was
created. No root Compose edit or deployment. IDs/links belong to that disposable
test instance; links cease being available after its removal.

Integrator supplied exact TS pins: phoenix-client 7.16.1, phoenix-otel 2.2.0,
OTel API 1.9.0. `npm ci --ignore-scripts` consumed the unchanged locked tree.
An initial disposable `/tmp` SDK study installation was replaced by that install.
The disposable Python probe venv installed OTel API/SDK/HTTP exporter 1.45.1 and
contract test packages jsonschema 4.25.1/rfc8785 0.1.4. Its complete observed
transitive list is included; this is not an application hashed-lock installation.

| Command/check | Observed result |
| --- | --- |
| `npx tsc -p packages/phoenix/tsconfig.json` | Exit 0, strict NodeNext consumer/source/tests |
| Offline `record.test.ts` | Exit 0; 7 passed, zero skipped |
| Explicit local `local-phoenix.test.ts` | Exit 0; 15 passed, zero skipped; service return remains contract blocked |
| Actual corpus `corpus-phoenix.test.ts` | Exit 0; 8 passed, zero skipped; seven exercises/60 fixture rows; service return remains contract blocked |
| `npm run contracts:check` | Exit 0, shared schema/generated files unchanged |
| `npm run typecheck`, `npm run build` | Exit 0; existing contract/review/server tasks, plus direct Phoenix typing above |
| Shared `npm test` on corpus main parent | Exit 0; 86 passed, two intentionally skipped of 88; not Phoenix suite activation |
| `git diff --check` | Exit 0 |
| Live inference, browser, Mac/corporate host, full runner integration | Not run |

Detailed logs/JSON are in
[`20261014-01-phoenix-recording/`](20261014-01-phoenix-recording/).
Offline cases verify pre-write hash/row validation, explicit origin, sanitized
transport/HTML failures, pre-abort, deadline and quoted multiline CSV parsing.
Local cases verify identical/concurrent imports, two separate processes creating
one experiment, fresh-process restart, link/status retry tolerance, new version
and historical pin, identity conflicts, cancelled execution/error separation,
lost committed experiment/row/evaluation responses, recording cancellation and
retry, unavailable real-agent traces, real Python OTel parent continuity, and
corrupt evaluation read-back rejection. The Python AGENT/LLM spans are explicitly
synthetic; no MAF agent or provider was invoked.

Actual corpus head `d9ab77508f6f6892f4de57594146abbd629ea471` was fetched and
exported read-only into `/tmp/et-wp07-corpus`. Every dataset hash and referenced
manifest/document byte hash was verified. Synthetic stored result receipts over
those actual fixtures proved persistence/identity mapping; they are not results
of running the learner evaluator. Per-case actual IDs/hashes/counts are included.
Observed UI routes use SDK URL helpers/read-back project IDs and returned the
Phoenix HTML shell; this does not prove browser rendering.

## Explicit blockers and integrator actions

1. **Contract mismatch:** Phoenix 20.21.3 returns GlobalIDs with padding, e.g.
   `RGF0YXNldFZlcnNpb246MjU=` and `RXhwZXJpbWVudDo1OA==`. Frozen PhoenixLinks
   uses `^[a-zA-Z0-9][a-zA-Z0-9._:-]*$` for dataset/version/experiment IDs and
   rejects these actual IDs. Adapter preserves them verbatim and raises
   `telemetry_unavailable: Verified Phoenix GlobalIDs do not fit the installed
   PhoenixLinks contract`; it does not mark recording complete. Integrator must
   additively admit the actual GlobalID alphabet for only those three Phoenix ID
   fields, regenerate/check shared contracts, relay its exact head and rerun
   acceptance. No producer schema edit or ID stripping is proposed.
2. **Producer integration:** accepted agent/runner factory heads and trace
   instrumentation wiring remain explicit dependencies. Validate that trusted
   traceparent reaches Python/Node and actual traceId reaches the immutable row.
   Configure one source project and preserve journal storage across restarts.
3. **Manifest/script activation:** pins are supplied; integrator should activate
   Phoenix package typecheck/build/test and add offline Phoenix tests to root
   checks. Opt-in real local/corpus suites need controlled disposable Phoenix.
4. **Live/host gates:** all five TUTORIAL provider/model/key/Azure settings were
   absent by presence-only check. Live request count and provider token spend are
   zero. Existing credentials/selected model, real MAF/provider traces, browser
   rendering, Mac/ARM64/corporate verification and full combined tutorial remain
   unverified. No credential generation or TLS weakening was performed.

The successful bounded tests explicitly tolerate and report the known contract
block while inspecting persisted IDs. They do **not** prove a successful frozen
TelemetryService return. After the shared correction, they require actual returned
links and record `serviceReturn: verified`. New producer/live/correction evidence
must be additive; do not rewrite this published receipt.
