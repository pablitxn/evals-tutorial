# Evals Tutorial

A local learning tutorial with one read-only introduction and six practical cases.
Learners edit TypeScript evaluators against known response fixtures, then evaluate
prepared Python Microsoft Agent Framework agents. All data is synthetic. Delivery
is a source ZIP for local use; no hosted deployment, real booking or transmission.

**Current state: shared foundation.** The v1 contracts and loopback API seams are
implemented. Content, real agents, isolated evaluator, UI, Phoenix recording and
DOUBLE CHECK are separate producer packages. Missing services fail explicitly;
this revision does not claim a complete tutorial or a provider-validated release.

## Prerequisites and setup

Use Node 24.x with npm 11.x, Python 3.12 and Docker with Compose. No global pnpm,
uv or Python packages are required for installation. Internet access is needed for
locked dependency/image downloads. Do not disable TLS verification for a proxy.

```sh
cp .env.example .env
# Fill an existing backend credential and selected provider/model. Image is pinned.
npm run install:all
npm run env:check
npm run start
```

`install:all` installs locked npm and hashed Python dependencies into `.venv`,
checks/builds the application and prepares Phoenix/runner images. During foundation
work it reports missing producer prerequisites precisely. `start` uses
http://127.0.0.1:3000 and local Phoenix http://127.0.0.1:6006. Python is invoked by
the trusted server per explicit agent action. Navigation/startup never infer.
Credentials stay in backend `.env`; do not put them into source, browser variables,
learner code or artifacts. Select one global `openai` or `azure_foundry` profile.
Agents, judges and review share it, with no cross-provider fallback.

```sh
npm run demo:check          # Offline checks and health; no provider calls.
npm run demo:check -- --live # Explicit bounded paid check, when integrated.
npm run stop               # Preserve Phoenix data.
npm run package:source     # Clean exact revision, allowlisted source candidate ZIP.
```

Source ZIPs and manifests appear in `dist/`. Packaging excludes `.env`, local
state, dependencies, Git metadata and previous archives. A candidate ZIP is not
release acceptance: fresh extraction, personal Mac/OpenAI, corporate Azure and
150-180 minute rehearsal receipts are still required. Azure access failures remain
visible blockers. Only existing credentials may be used; no automatic inference.

## Development and ownership

```sh
npm ci --ignore-scripts
python3 -m venv .venv
.venv/bin/python -m pip install --require-hashes -r apps/agents/requirements.lock
npm run contracts:check
npm run typecheck
npm run build
npm test
```

Tests explicitly add the shared Python contract path. The installation wrapper
adds both shared contracts and prepared agent source to the venv for normal runs.
`npm run contracts:generate` regenerates declarations from JSON Schema. Do not edit
generated files by hand. [The frozen contract](docs/contracts/v1.md) gives exact
imports, routes, protocol fields, limits and producer ownership. [AGENTS.md](AGENTS.md)
defines the single writer for shared manifests/locks and additive evidence policy.

Source and dataset hashes bind immutable snapshots. Run execution, criterion
scores and telemetry status are separate. Review is educational and fallible;
changes invalidate completion. A child process is not a sandbox. Evaluators require
the isolated Docker runner; unavailable isolation must block execution. Python is
a trusted backend subprocess and never receives reference answers or learner code.

