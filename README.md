# Evals Tutorial

A local workshop with one read-only introduction and six cases. Learners edit
TypeScript evaluators, test known response fixtures, then evaluate prepared Python
Microsoft Agent Framework agents. All data is original synthetic material. Delivery
is a local source ZIP; there is no hosted deployment, booking or transmission.

The services are integrated. A source candidate is not a provider-validated
release: live model perception, semantic judging/review, Mac/ARM64, corporate Azure
and the complete 150–180 minute workshop remain separate acceptance gates.

## Install and start

Use Node 24.x, npm 11.x, Python 3.12 and Docker with Compose. Download access is
needed for locked dependencies and pinned images. Preserve normal TLS checks.
Docker must expose its local default socket to the restricted CLI (a private
Docker context with no default socket is not yet supported by the runner).

```sh
npm run install:all
npm run start
```

Open http://127.0.0.1:3000; Phoenix is http://127.0.0.1:6006. Startup and navigation
never call a model. Without credentials, read-only lessons, validation and Code
fixtures work; model actions are unavailable. The six editable starters deliberately
throw until completed. The introduction supplies a complete evaluator, including
correct rejection of known bad responses.

`install:all` installs the npm lock and hashed Python lock into `.venv`, checks and
builds source, pulls pinned images, then builds the evaluator image without network
access in the build steps. The small Docker context contains only the fixed worker
and installed TypeScript library. No global Python package manager is needed.
Start from a clean Git commit or an unchanged extracted source manifest so run
receipts identify the exact source. Learner edits remain browser-local.

## Enable an existing provider credential

```sh
cp .env.example .env
# Fill explicit provider, model and existing key locally. Never commit this file.
npm run env:check -- --require-provider
npm run start
```

Stop before starting again after a configuration change. Select one global
`openai` or `azure_foundry` profile. Agents, judges and DOUBLE CHECK share it;
there is no ambient OPENAI_API_KEY fallback or cross-provider fallback. To reuse
an existing shell key explicitly, export it as TUTORIAL_API_KEY before starting.
For Azure, supply an HTTPS Azure OpenAI resource-root endpoint and API version;
Foundry project URLs and /openai/v1 paths are not accepted by this adapter.

Provider structure checks do not authenticate or infer. Credentials remain in the
trusted backend. They never enter browser variables, learner containers, receipts
or source ZIPs. Agent inputs exclude reference answers, fixtures and evaluator
source. PNG/JPEG pages are supported; PDFs remain reference downloads and produce
unsupported_media if sent to the current agent adapter. Real perception must still
be verified for the selected provider/model.

## Checks and recovery

Run these in a second terminal while the tutorial is running:

```sh
npm run demo:check             # Offline tests, actual Docker and intro fixture/Phoenix flow.
npm run demo:check -- --live   # Explicit paid intro-only probe; no automatic retry.
npm run telemetry:retry -- RUN_ID # Re-record stored results; no inference repeated.
npm run stop                   # Stop tutorial/Phoenix; preserve local evidence and volume.
```

The live probe calls each intro example once, at most 2048 output tokens per call;
it prints the exact call count first. It verifies real agent traces and recording.
Multimodal cases, semantic judges and DOUBLE CHECK require separate explicit UI
runs. Calls accepted upstream can incur charges even if cancelled locally.

Execution status, evaluation score and telemetry status remain distinct. An
unfinished evaluator raises an operational error with no score. A valid failing
score can correctly reject a bad fixture. Failed Phoenix recording preserves the
execution receipt; retry the same run ID. Recording journals and append-only run
receipts live in ignored `.local/`; review receipts are local-session memory and
are not restored as completed after restart. Browser drafts/version IDs persist
locally; source or evidence changes invalidate completion. Reviews are fallible
educational feedback.

Learner source executes only inside restricted Docker workers: no network,
credentials, host mounts or Docker socket; non-root user, read-only root, resource
limits and bounded broker requests. Missing isolation fails closed. Prepared
Python is a trusted supervised process, not a sandbox for learner code.

## Development and source distribution

```sh
npm run contracts:check
npm run typecheck
npm run build
npm test                       # Offline tests; one explicit Docker case may skip here.
npm run test:docker            # Required actual isolation gate; missing image fails.
npm run package:source         # Exact clean revision, allowlisted ZIP and hash manifest.
```

Candidate ZIPs appear in `dist/`. They exclude credentials, `.local/`, dependencies,
Git metadata, compiled output and previous archives. Verify the sidecar SHA-256,
extract into a fresh directory (spaces are supported), then use install/start above.
No live or Mac acceptance is implied by packaging.

[Contracts and routes](docs/contracts/v1.md), [dependency pins](docs/contracts/dependencies.md)
and [ownership instructions](AGENTS.md) describe the implementation. Wire validators
are generated ahead of time for the production CSP. Immutable task evidence is in
`docs/evidence/`; new observations use additive receipts.

Decisions follow Atlas main
[8b8f5ace](https://github.com/pablitxn/sysadmin-workspace/tree/8b8f5acebc7cd4430b7b1b7943b5f9e09817ab0e):
[roadmap](https://github.com/pablitxn/sysadmin-workspace/blob/8b8f5acebc7cd4430b7b1b7943b5f9e09817ab0e/atlas/wiki/evals-tutorial-roadmap-20261014.md)
and [architecture](https://github.com/pablitxn/sysadmin-workspace/blob/8b8f5acebc7cd4430b7b1b7943b5f9e09817ab0e/atlas/wiki/evals-tutorial-architecture-20261014.md).
