# Evals Tutorial

A local workshop with one read-only introduction, six editable cases and a final
guided example of Spec-Driven Development and regression evaluation. Learners edit
TypeScript evaluators, test known response fixtures, then evaluate prepared Python
Microsoft Agent Framework agents. All data is original synthetic material. Delivery
is a local source ZIP; there is no hosted deployment, booking or transmission.

The services are integrated. A source candidate is not a provider-validated
release: live model perception, semantic judging/review, Mac/ARM64, corporate Azure
and the complete 150–180 minute workshop remain separate acceptance gates.

## Install and start

Use Node 24.x, npm 11.x, Python 3.12 and Docker with Compose. Download access is
needed for locked dependencies and pinned images. Preserve normal TLS checks.
The selected Docker context must resolve to a local Unix socket. Docker Desktop
contexts are supported; remote Docker daemons are intentionally excluded. The
restricted CLI keeps its own empty configuration and receives only the trusted
local socket address, without forwarding registry/proxy credentials into workers.

```sh
npm run install:all
npm run env:check
npm run start
```

Open http://127.0.0.1:3000; Phoenix is http://127.0.0.1:6006. Startup and navigation
never call a model. Without credentials, read-only lessons, validation and Code
fixtures work; model actions are unavailable. The six editable starters deliberately
throw until completed. The introduction supplies a complete evaluator, including
correct rejection of known bad responses.

`env:check` reports whether the explicit provider configuration is present; it does
not authenticate, run inference or check Docker/Phoenix readiness. A missing
provider is allowed for offline work. Use `--require-provider` below when setting
up model actions.

`install:all` installs the npm lock and hashed Python lock into `.venv`, checks and
builds source, pulls pinned images, then builds the evaluator image without network
access in the build steps. The small Docker context contains only the fixed worker
and installed TypeScript library. No global Python package manager is needed.
Start from a clean Git commit or an unchanged extracted source manifest so run
receipts identify the exact source. Learner edits remain browser-local.

## Final guided example

Open **Specification and regression** after the six cases. Read six travel-assistant
requirements, inspect the fixed Python agent versions and prepared TypeScript
evaluators, then run the baseline and the deliberately regressing **omit-fees**
version. Both use the same three ordinary cases in one dataset. Results link each
requirement to its expected outcome, evaluator and observed verdict; the comparison
identifies cases that passed in the baseline and failed in the candidate.

The candidate deliberately ignores mandatory fees. Its displayed results are
computed from actual runs, never prefilled; a model may behave differently from
its prompt. An unavailable provider, incomplete execution or mismatched run
identity cannot establish a regression. Running another baseline starts a fresh
comparison while keeping earlier receipts inspectable. Both model runs require
the existing global provider configuration and explicit actions.

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

For read-only service diagnostics, inspect the local status endpoint:

```sh
curl --fail --silent --show-error http://127.0.0.1:3000/api/status
```

The response includes a non-secret provider summary, `automaticInference: false`
and capability flags. Unavailable capabilities include a `reason` to help identify
the missing setup:

| Capability | What availability means |
| --- | --- |
| `content` | The verified tutorial, datasets and synthetic documents loaded. |
| `validation`, `runner` | The restricted Docker executor was available at backend startup. Missing isolation disables evaluator execution. |
| `agents`, `judge` | The selected provider profile is configured. Authentication and model support still need an explicit live run. |
| `review` | Provider and isolated run services are connected. Each review also needs eligible validation, fixture and agent evidence. |
| `telemetry` | Phoenix passed its health check during this status request. This does not prove that a particular run was recorded. |

Docker and provider flags reflect startup configuration; after fixing those
services or changing `.env`, stop and restart the tutorial. If isolation is
unavailable, check the local Docker daemon and rerun `install:all`. If only
telemetry is unavailable, restore local Phoenix and retry recording the existing
run ID. Reading status performs no inference or execution.

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
and [contribution instructions](AGENTS.md) describe the implementation. Wire validators
are generated ahead of time for the production CSP. Run the documented checks
for your checkout; historical internal task records are not distributed.


## License

[MIT](LICENSE), copyright 2026 Pablo Coronel. Original synthetic teaching
material is included under the same license. Dependencies retain their own licenses.
