# ET-WP-00 readiness receipt

Observed 2026-10-14 UTC in the restored saved Cloud `evals-tutorial` environment.
This is a bounded capability spike, not application implementation or release acceptance.
The machine-readable verdict is [receipt.json](../evidence/ET-WP-00/receipt.json).

## Repository and ownership gate

Owner: `pablitxn/evals-tutorial`, actual root `/workspace/evals-tutorial`.
Initial status: clean, unborn local branch `work`, no HEAD or refs.
Remote `git ls-remote origin HEAD refs/heads/main` returned no refs; GitHub's
connected repository API reported public, size 0, default branch name `main`.
There was no base SHA at dispatch. No application `AGENTS.md`, application skills
or source existed then. `/workspace` itself is not a Git repository.

During closeout, the integrator published foundation main at
`d1cbedc55bd2ed346039fd8f6d70d9cca21bc7b6`. A clean isolated checkout at
`/tmp/et-wp-00/publish` supplied the base for `docs/et-wp-00-readiness`.
Its new root `AGENTS.md` was read; there are no local application skills.
The application contract file referenced by AGENTS is not present in that
minimal foundation. This task does not invent the missing contract.

ET-INTEGRATOR is thread `01a13a94-f55c-7187-bac7-8f4acaa910d2`, requested Astra
ultra, the sole initial foundation/root/shared-contract writer. ET-WP-00 owns
only `docs/readiness/**` and `docs/evidence/ET-WP-00/**`. Its initial handoff stayed
outside the application checkout until the foundation appeared. All installations, probes
and the read-only Atlas main clone are under `/tmp/et-wp-00`; only task-owned
disposable Docker containers were created. No root manifest, application file,
main initialization, shared lock, Atlas edit, merge or deployment was performed.

The source delegation explicitly authorizes implementation/coordination now;
the earlier planning document's unlaunched state is historical. ET-WP-00 does
not independently initialize the foundation. Isolated curriculum/UX and fixture
specification can proceed while provider access remains blocked.

## Sources and executor selection

Consulted current Atlas main `8b8f5acebc7cd4430b7b1b7943b5f9e09817ab0e`, including:

- `atlas/wiki/evals-tutorial-roadmap-20261014.md` (ET-WP-00 and shared ownership).
- `atlas/wiki/evals-tutorial-architecture-20261014.md`.
- `atlas/entries/2026-10-14-evals-tutorial-design-call.md`.
- `atlas/ops/reports/2026-10-14-evals-tutorial-sdk-evidence.md`.
- Root/Atlas `AGENTS.md`, local `.agents/skills/atlas-navigate/SKILL.md`, source
  precedence, identity, engineering-language and parallel-integration standards.

PR #8 is confirmed merged by the GitHub connector. The restored Atlas checkout
at `/workspace/sysadmin-workspace` was clean at older `474f561da362def07f5f1883f58a3db840f02b2c`;
the disposable main clone supplied the current planning files. Its root AGENTS
matches the restored copy. No unavailable historical skill was installed or
treated as materialized.

Requested executor: **GPT-6.1 Sol HIGH FAST**. The task tools do not expose the
active model ID, reasoning effort, FAST selection or service tier. Actual
selection is **not verified**. No substitute was selected by this task; the
coordinator must retain the launch receipt or resolve the selection explicitly.

## Environment and Git identity

| Item | Observation |
| --- | --- |
| OS/platform | Linux x86_64; exercised images linux/amd64 |
| Python | 3.12.14; saved `/workspace/shared/evals-tutorial-venv` contains only pip 25.0.1 |
| Node/npm | 24.19.0 / 11.9.0 |
| Docker client/server | 28.4.0 / 28.4.0; daemon reachable; cgroup v2, vfs storage, built-in seccomp |
| Browser | Chromium 154.0.8037.57; installed Playwright 1.62.0 |
| Git before correction | Pablo Coronel, inherited `accounts@pablocoronel.com` |
| Git after approved local guard | Both effective author/committer `Pablo Coronel <git@pablocoronel.com>` |

The Atlas helper's `--apply` changed only tutorial-repository-local user identity;
its subsequent read-only check passed. Global configuration is unchanged.
Saved-environment identity persistence, future actual commit attribution and
GitHub account linkage remain unverified. No commit was created simply to test
identity. Proposed future commit: `docs(readiness): record ET-WP-00 capability probes`.

## Verdict matrix

`pass` means the named bounded behavior was exercised; `fail` means a real
attempt failed; `not-run` means prerequisite or execution evidence is absent.

| Check | Verdict | Evidence / limit |
| --- | --- | --- |
| Saved environment startup | pass | Requested environment became ready; original mounts, repo and pip-only venv present. Does not prove SDK setup persistence. |
| Repository/base/ownership | pass | Verified initial unborn state and clean checkout; later integrator foundation SHA observed, named ownership preserved. |
| Effective Git identity | pass after correction | Approved local Atlas guard; inherited source still conflicts. |
| Requested executor combination | not-run | No introspection/launch receipt exposed. |
| Python provider package install/import | pass | Exact candidate tuple below; `pip check` passes. |
| Direct OpenAI text/schema/image/PDF wire shapes | pass, mock only | MAF Agent, Responses serialization and Pydantic response parsing through in-memory MockTransport. |
| Azure resource and v1 image/PDF wire shapes | pass, mock only | Explicit deployment/model and routing; resource API-version query retained; v1 base URL has no query. |
| Missing provider configuration | pass, negative test | Constructor raises `SettingNotFoundError`; application should validate missing keys/profile before SDK construction. |
| OpenAI live agent/judge/document perception | not-run | No existing key or selected runtime model. |
| Azure live agent/judge/document perception | not-run | No existing key, endpoint, deployment or corporate access. |
| Docker daemon and image pulls | pass | Runner and Phoenix images pulled and run by exact digest. |
| Restricted evaluator-container capability | pass | Non-root/read-only/no-network/dropped-capabilities/no-new-privileges/resource limits; loop timeout removed container. This is not the complete ET-WP-06 adversarial suite. |
| Node/TypeScript SDK typing | pass | Installed TS 5.9.3 strict NodeNext check of the actual Phoenix probe. |
| Local Phoenix server | pass | Version 20.21.3; loopback-only host port 16006. |
| Dataset idempotency/version pin | pass | Stable ID/version/count on repeat import; changed content creates version; old version still used explicitly. |
| Experiment/evaluation persistence | pass | Real local fixture experiment, task read-back and CSV score/label/explanation read-back. No inference used. |
| Node/Python/MAF trace continuity | pass | Inject/extract W3C context, real OTLP export, Node root and MAF AGENT/LLM children read back in the same experiment project. |
| Phoenix dataset/experiment/trace HTTP routes | pass, HTTP only | Actual persisted IDs, SDK dataset/experiment helpers, installed-bundle trace route. HTTP 200 shell does not establish browser rendering. |
| Chromium with browser sandbox | fail | Sandbox helper configuration error; no permission/kernel changes or `--no-sandbox` fallback. |
| Official documentation through browsing tool | pass | Microsoft and Phoenix pages opened, links below. |
| Shell access to Microsoft/Arize documentation | fail | Proxy CONNECT 403; no TLS weakening or proxy bypass. |
| PyPI/npm package TLS | pass | Standard certificate/hostname verification; HTTP 200. |
| Docker Hub tags metadata through shell | fail | Proxy CONNECT 403; ordinary Docker registry pulls independently pass. |
| Mac/ARM64, corporate host, clean ZIP/rehearsal | not-run | These are ET-WP-11 host/release gates, not proven by Cloud amd64 probes. |

Live request count and provider token spend: **zero**. All model outputs in the
SDK spike were explicitly synthetic HTTP responses from an in-memory transport.
The one-pixel PNG and skeletal PDF are serialization fixtures, not readable
document-perception evidence or the ET-WP-04 curriculum corpus. No new credential
was requested, generated or stored. Receipt payloads contain no credential headers.

## Recommended candidate pins

Recommend freezing this exercised tuple in the integrator's project definitions
and hashed language locks, subject to fresh Mac/corporate verification. These
are candidate pins, not a committed dependency contract or cross-platform guarantee.

| Dependency | Exercised candidate |
| --- | --- |
| Python / Node / npm | 3.12.14 / 24.19.0 / 11.9.0 |
| MAF provider / core | `agent-framework-openai==1.16.0` / `agent-framework-core==1.21.0` |
| OpenAI Python / Pydantic | `openai==3.31.0` / `pydantic==2.14.1` |
| Python OTel API / SDK / HTTP exporter | `1.45.1` / `1.45.1` / `1.45.1` |
| Phoenix TS client / OTel | `@arizeai/phoenix-client@7.16.1` / `@arizeai/phoenix-otel@2.2.0` |
| JS OTel API / TypeScript / Node types | `1.9.0` / `5.9.3` / `24.10.0` |
| Phoenix image | `arizephoenix/phoenix:version-20.21.3`, digest `sha256:333ae941c99a366f90542cacfa5fa0745a331f13c2e66857de5e44c19a46f6e0` |
| Runner base image | `node:24.19.0-bookworm-slim`, digest `sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df` |

[Python versions](../evidence/ET-WP-00/python-versions.txt) and
[Node dependency tree](../evidence/ET-WP-00/node-versions.json) retain transitive
versions. The worker base image has Node, not the final compiler/tutorial SDK;
ET-WP-06 must build and pin its complete image. Do not use mutable `latest` tags.
npm's default `/home/agent/.npm` was unwritable; using a task-local `--cache`
resolved installation without changing home permissions or global npm settings.

## Contracts to freeze before consumers

1. Use `from agent_framework import Agent, Message, Content` and
   `from agent_framework.openai import OpenAIChatClient`. `OpenAIChatClient`
   is Responses; `OpenAIChatCompletionClient` is Chat Completions. Legacy
   `OpenAIResponsesClient` and `AzureOpenAIChatClient` are absent from this tuple.
2. Pass the single resolved provider profile explicitly. Direct OpenAI uses
   `model` and key; Azure resource routing uses `azure_endpoint`, key, deployment
   as `model` and the endpoint's required API version. Full `/openai/v1` URLs
   use `base_url`. The illustrative mocked API version is not a recommended
   corporate version. Foundry project URLs require a different integration;
   reject incompatible endpoint kinds instead of inventing a fallback.
3. `Content.from_data(bytes, media_type)` serializes PNG to `input_image` and
   PDF to `input_file` in these Responses clients. Allowlist MIME/size/page
   counts in the application. The SDK's ability to serialize is not provider
   support. Keep C2/C3 live runs blocked until the exact chosen profile passes
   actual PNG/PDF perception; independently authored references stay separate.
4. Use `Agent.run(message, options={"response_format": PydanticModel,
   "max_tokens": limit})`; inspect `response.value` after parsing. Bound the
   underlying SDK timeout/retries and host deadline explicitly. Normalize
   refusal/malformed/provider/runtime errors separately from evaluation scores.
5. Phoenix `createDataset({client,name,description,examples})` returns only
   `{datasetId}`. Stable example `id` values prevent duplicate imports.
   `getDataset()` provides `versionId`. `runExperiment` receives
   `dataset:{datasetId,versionId}`, `record:true`, `dryRun:false`, bounded
   concurrency and repetitions. `createExperiment` separately accepts
   `datasetVersionId`; do not confuse these APIs.
6. Persist and verify the returned `datasetVersionId`. `getExperiment()` returns
   experiment/tasks but no evaluation rows in this release. Its typed CSV
   endpoint `/v1/experiments/{experiment_id}/csv` was exercised to verify
   `annotation_<name>_score`, label, explanation and error. Tutorial normalized
   result validation remains stricter than Phoenix's optional fields.
7. Inject W3C `traceparent` from the active Node task and extract/attach it in
   Python. Configure MAF instrumentation once with an HTTP trace exporter to
   `/v1/traces`, and set `openinference.project.name` to the experiment's actual
   returned `project_name`. Flush boundedly before process exit. Sensitive
   telemetry was enabled only for these owned synthetic payloads. No credential
   headers/configuration should enter spans. Phoenix converted MAF GenAI fields
   into useful AGENT/LLM OpenInference records in actual read-back.
8. Generate dataset and experiment URLs using
   `@arizeai/phoenix-client/utils/urlUtils` and actual IDs. For this installed
   server, the verified UI trace route is `/projects/<project-global-id>/traces/<otel-trace-id>`;
   `/redirects/traces/<otel-trace-id>` resolves the project through the UI loader.
   The trace route uses the OTel hex ID, not the GraphQL trace node ID. Browser
   rendering remains blocked. Unknown API paths can return the SPA shell with
   HTTP 200: require expected content type/body/schema, not status alone.
9. Use the exercised container flags from [docker.json](../evidence/ET-WP-00/docker.json).
   No repository/home/socket/env mounts; use bounded read-only source/input mounts
   and framed stdin/stdout judge RPC only. Full memory/output/flood/import/broker
   and cancel tests remain ET-WP-06 work. Never replace unavailable isolation with
   unrestricted host evaluation.

## Remaining gates and next bounded live checks

The repository/ownership gate passes for isolated specifications. The tested
SDK/daemon tuple supports foundation and fixture development. The integrator's
initial SHA now exists; G1 acceptance still needs its frozen contracts and executor
selection receipt. G2/G3 must retain explicit browser, real-provider and host
gates; no complete runnable tutorial or accepted ZIP is claimed here.

OpenAI and Azure are separate live gates. Once existing backend credentials and
an explicit selected model/deployment are supplied, permit at most one small
text agent call, one judge call, and one selected-format document call per
profile: maximum 128 output tokens each, 20-second request timeout, zero automatic
retries, a 60-second profile deadline and no tools/uploads. Use a small owned,
legible file and independently compare the requested field. Record actual usage,
profile/endpoint kind/model/MIME, result/error and Phoenix read-back. A separate
fourth call for the other format requires an explicitly recorded bound. These
are proposed future limits; no live request was attempted by ET-WP-00.

Use the personal Mac/OpenAI smoke first and corporate Azure second. Browser
verification belongs on a host with a functioning sandbox or an existing
approved browser connection; this task did not repair host security settings.
Docs unavailable through the shell can be consulted through the browsing tool;
the application itself should not need to fetch documentation at runtime.

## Reproduction and handoff

The evidence directory contains tiny standalone probes and sanitized JSON.
Run them only in a new disposable directory, using the pinned dependency tuple.
`maf_probe.py` uses in-memory transport exclusively. `docker_probe.py` pulls/runs
the pinned runner with no mounts and cleans its timeout container.
`phoenix_probe.mts` expects a disposable Phoenix instance at `127.0.0.1:16006`,
`ET_PYTHON`, `ET_MAF_PROBE`, `ET_RECEIPT_PATH` and
`PHOENIX_COLLECTOR_ENDPOINT=http://127.0.0.1:16006`; install dependencies beside
the copied probe, type-check with strict NodeNext TS, then run with Node 24.
`browser_probe.py` explicitly enables Chromium sandboxing and records failure
honestly. Do not run these on a production Phoenix dataset.

Task artifact paths and file hashes are frozen in its local handoff. The base
appeared during closeout, so ET-WP-00 prepares its own isolated documentation
commit and draft PR against that foundation, with the approved identity guard
and commit/PR checks. Final publication evidence is reported separately from
these immutable probe observations. No merge is authorized by this receipt.

## Official documentation consulted

- [MAF OpenAI and Azure Python configuration](https://learn.microsoft.com/en-us/agent-framework/integrations/by-component/model-providers/openai).
- [MAF images](https://learn.microsoft.com/en-us/agent-framework/agents/multimodal).
- [MAF telemetry](https://learn.microsoft.com/en-us/agent-framework/agents/observability).
- [Azure Responses](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses?view=foundry-classic).
- [Phoenix TS datasets](https://arize.com/docs/phoenix/sdk-api-reference/typescript/packages/phoenix-client/datasets).
- [Phoenix TS experiments](https://arize.com/docs/phoenix/sdk-api-reference/typescript/packages/phoenix-client/experiments).

These establish published interfaces. Installed source and disposable probe
receipts establish the narrower exercised behavior above; neither establishes
account-level model access or document accuracy.
