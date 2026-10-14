# ET-WP-07 successful GlobalID recording acceptance

Observed 2026-10-14 UTC on Linux x86_64. **The GlobalID contract blocker is
resolved: actual TelemetryService.record returns succeed with padded Phoenix IDs,
verified dataset/experiment links and correlated per-row trace links.** This is
bounded local Phoenix acceptance with synthetic results, not a live provider or
complete combined-tutorial acceptance.

This additive receipt supersedes only the GlobalID blocker/acceptance status of
[the first receipt](20261014-01-phoenix-recording.md). That published receipt and
its artifact directory are unchanged. Final publication head belongs in the PR
and handoff after committing this receipt; no self-referential SHA is embedded.

## Exact inputs and ownership

- Owner repository: `pablitxn/evals-tutorial`, `/workspace/evals-tutorial`.
- Existing branch: `feat/et-wp07-phoenix-recording`; previous published head
  `eb50cf489b8a5ecb7904fa82e4e595ad839303a8`, draft PR #8 targeting main.
- Accepted contract PR11 head: `d98a2247bf68338b1a2a5b37449816abc0ab4e7d`.
- Parent-authorized main: `77f4940424d15ef079fd1cdba04c8ffef1735bd6`.
- Additive local integration commit:
  `0dae7c38f2df5746e17516fc5f1d4744292c27c9`, parents preserving the previous
  Phoenix head and accepted main. No rewrite, force push, hosted merge or deploy.
- Actual corpus remains exact `d9ab77508f6f6892f4de57594146abbd629ea471`, exported
  read-only for this test. The previous original foundation is preserved in history.
- Owner AGENTS and corrected `docs/contracts/v1.md` were read. No new shared
  contract, manifest, lock, root script or HTTP/bootstrap edit was made by this task.
  Integrator-authored correction files enter only through the accepted main merge.
- Owned changes for this continuation: Phoenix local/corpus/restart acceptance
  tests, Phoenix README and this unique evidence. Production adapter/factory/context
  implementations are unchanged from the original Phoenix patch.
- Local identity guard passed before the additive commit: both effective roles
  `Pablo Coronel <git@pablocoronel.com>`. Same guard required for publication.

The correction accepts the actual base64 alphabet and trailing padding in only
PhoenixLinks.datasetId/datasetVersionId/experimentId; trace/application ID and
loopback URL restrictions remain unchanged. It also supplies generated wire
validators. This task consumes those accepted validators without changing them.

## Stricter acceptance and observed results

The historical journal-inspection compatibility fallback was removed from the
local, corpus and restart tests. Each now requires a successful production
TelemetryService return. Top-level and every returned row link must validate
against PhoenixLinks; the result count and pinned experiment/version identities
must match. Recording errors fail acceptance instead of becoming observations.

The new local case compares returned IDs with actual experiment read-back,
preserves padding verbatim, and fetches returned dataset/experiment/trace URLs.
The pinned version was **`RGF0YXNldFZlcnNpb246MQ==`**, exactly as returned by
Phoenix. Complete returned links and persisted task/trace IDs are in
[`local-phoenix.json`](20261014-02-globalid-acceptance/local-phoenix.json), with
`serviceReturn: verified` and a `successfulReturn` containing the actual service
result. Corpus observations independently record `serviceReturn: verified` for
all seven datasets and 60 fixture rows.

| Check | Result |
| --- | --- |
| Strict `npx tsc -p packages/phoenix/tsconfig.json` | Exit 0 |
| Offline Phoenix tests | Exit 0; 7 passed, zero skipped |
| Real local Phoenix tests after readiness | Exit 0; 16 passed, zero skipped; successful service returns |
| Actual corpus Phoenix tests | Exit 0; 8 passed, zero skipped; seven datasets/60 fixture rows |
| Shared `npm test` | Exit 0; 88 passed, two opt-in suites skipped of 90 |
| `npm run contracts:check` | Exit 0; consumed shared validators have no generation drift |
| `npm run typecheck` | Exit 0 |
| Diff whitespace / prior immutable evidence checks | Clean |

Logs and JSON are under
[`20261014-02-globalid-acceptance/`](20261014-02-globalid-acceptance/).
The local suite again covers concurrent imports, two separate Node processes,
fresh-process restart, changed/historical dataset versions, identity conflicts,
cancelled execution/errors, lost experiment/row/evaluation write responses,
recording cancellation/retry, missing-agent-trace rejection and corrupt evaluation
read-back rejection. The source-project Python OTel continuity check succeeds;
experiment tasks point to the actual original trace project without replaying
AGENT/LLM spans. Source traces and stored-row parents remain distinguishable.

## Startup attempt, runtime and limits

The first readiness window was 10 seconds, shorter than this fresh container's
startup. That attempt failed before successful-return acceptance, and the initial
local test log is retained separately as `local-tests-initial-startup.txt`.
Container logs later confirmed startup completion; version endpoint returned
20.21.3 before the successful rerun. A bundled Phoenix docs-MCP startup attempt
reported HTTP 403; no proxy/TLS bypass or credential change was attempted. This
optional external connection did not prevent local dataset/experiment/trace APIs.

Task-owned disposable container: `et-wp07-phoenix-acceptance`, loopback port 6006,
image `arizephoenix/phoenix@sha256:333ae941c99a366f90542cacfa5fa0745a331f13c2e66857de5e44c19a46f6e0`.
Node/npm/Python remain 24.19.0/11.9.0/3.12.14; Phoenix SDK pins unchanged.
The existing disposable pinned OTel 1.45.1 probe venv was reused, not presented
as a fresh hashed application installation. Test instance is removed during
closeout; its recorded localhost links then become historical observed routes.

All five TUTORIAL provider/model/key/Azure fields remained absent in a
presence-only check. Provider request count/token spend remains **zero**.
The Python spans are owned synthetic AGENT/LLM boundary probes, not live MAF or
model calls. Actual corpus receipts use synthetic normalized outputs for telemetry
mapping, not claimed evaluator results. HTML shell and actual ID read-back verify
routes; browser rendering remains unverified.

## Remaining dependency handoff

Exports are unchanged: `createPhoenixTelemetry(options): TelemetryService` and
`createTelemetryContext(runId, exampleId, fixtureId?)` from the Phoenix package;
`createTelemetryService(options)` and context re-export from server telemetry.
Use explicit loopback port 6006, persistent private stateDirectory and trusted
sourceProjectName. Host traceparent must reach Python/Node before inference, and
actual AgentSuccess.traceId must reach RowResult.phoenix.traceId. Apply returned
top-level/row links and telemetryStatus only after successful recording.

The shared-schema blocker is closed. Accepted real agent/runner integration,
bootstrap and root check activation remain integrator-owned dependencies. Live
provider/MAF receipts, credentials/selected model, browser rendering, Mac/ARM64,
corporate-host and complete tutorial/release gates remain explicitly unverified.
