# Shared dependency plan

ET-INTEGRATOR alone maintains every package manifest and both language locks.
`npm ci --ignore-scripts` consumes package-lock.json; Python installs with
`pip install --require-hashes -r apps/agents/requirements.lock`. The requirements
lock was generated with uv pip compile --generate-hashes for Python 3.12; uv is
an integrator tool and is not a learner installation prerequisite.

| Package | Exact foundation dependencies / next integration |
| --- | --- |
| Root | Node 24.x, npm 11.x; packageManager npm@11.9.0; TypeScript 5.9.3, tsx 4.20.6, turbo 2.5.8, @types/node 24.10.0 |
| @evals-tutorial/contracts | ajv 8.17.1, canonicalize 2.1.0; generated TS/Python declarations from one schema |
| @evals-tutorial/server | Shared contracts, @opentelemetry/api 1.9.0; Node built-in HTTP/crypto/fs |
| @evals-tutorial/web | React/react-dom 19.2.0, types 19.2.2, Vite 7.1.10; producer owns UI/tsconfig/Vite config. Integrator activates build/typecheck scripts when source lands. Request editor dependency before importing it. |
| @evals-tutorial/evaluator-runtime | Shared contracts, TypeScript 5.9.3; no unrestricted host runner |
| @evals-tutorial/phoenix | @arizeai/phoenix-client 7.16.1, @arizeai/phoenix-otel 2.2.0, @opentelemetry/api 1.9.0 |
| @evals-tutorial/review | Shared contracts; use ProviderBroker.review; no direct provider client or evaluator execution |
| Python agents | jsonschema 4.25.1, rfc8785 0.1.4; agent-framework-openai 1.16.0, agent-framework-core 1.21.0, openai 3.31.0, pydantic 2.14.1; OTel API/SDK/HTTP exporter 1.45.1 |
| Compose | arizephoenix/phoenix:version-20.21.3 pinned by digest; exact image references in scripts/runtime-pins.json |

Versions above were resolved and installed in this environment. This proves
package availability/core tests, not Mac arm64, corporate Azure, Docker, browser,
Phoenix or model compatibility. Producer-owned packages without source do not
participate in build/typecheck yet. Foundation build checks contracts/server;
there is no built UI at this revision. React/Vite source use awaits ET-WP-08.

Readiness evidence at b4a7bb981c7c115f4ea33651d1563200153942d0 is included
in the dependency lock and apps/agents/constraints.txt. The Python lock now
contains the exercised MAF/provider/OTel tuple; all 34 readiness Python versions
constrain lock generation. Existing contract dependencies are retained. Node
Phoenix packages and OTel use the exact exercised top-level versions; the complete
resolved dependency graph is frozen in package-lock.json.

`runtime-pins.json` records the Phoenix and runner-base immutable image digests.
The runner producer should accept Docker build argument `RUNNER_BASE_IMAGE`;
install:all passes the readiness-pinned value. ET-WP-06 still owns building and
verifying the complete runner image, including compiler/tutorial SDK. No image
pull, execution or live provider call is triggered by importing contracts.

Readiness established mocks/local Docker/Phoenix behavior on Linux amd64. Live
OpenAI/Azure perception and model access, Mac arm64, sandboxed browser and final
source-ZIP rehearsal remain explicit gates. Shared v1 schemas and service interfaces
are unchanged by this dependency update. Producers may merge the additive foundation
head into their branches; never rebase published history or regenerate shared locks.
