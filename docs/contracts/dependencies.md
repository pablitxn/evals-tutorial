# Shared dependency plan

ET-INTEGRATOR alone maintains every package manifest and both language locks.
`npm ci --ignore-scripts` consumes package-lock.json; Python installs with
`pip install --require-hashes -r apps/agents/requirements.lock`. The requirements
lock was generated with uv pip compile --generate-hashes for Python 3.12; uv is
an integrator tool and is not a learner installation prerequisite.

| Package | Exact foundation dependencies / next integration |
| --- | --- |
| Root | Node 24.x, npm 11.x; packageManager npm@11.9.0; TypeScript 5.9.3, tsx 4.20.6, turbo 2.5.8, @types/node 24.7.2 |
| @evals-tutorial/contracts | ajv 8.17.1, canonicalize 2.1.0; generated TS/Python declarations from one schema |
| @evals-tutorial/server | Shared contracts; Node built-in HTTP/crypto/fs; no framework dependency |
| @evals-tutorial/web | React/react-dom 19.2.0, types 19.2.2, Vite 7.1.10; producer owns UI/tsconfig/Vite config. Integrator activates build/typecheck scripts when source lands. Request editor dependency before importing it. |
| @evals-tutorial/evaluator-runtime | Shared contracts; request Docker/compiler/SDK dependency changes through integrator; no unrestricted host runner |
| @evals-tutorial/phoenix | Shared contracts; actual Phoenix client/OTel pins pending ET-WP-00 receipt |
| @evals-tutorial/review | Shared contracts; use ProviderBroker.review; no direct provider client or evaluator execution |
| Python agents | jsonschema 4.25.1, rfc8785 0.1.4 plus fully hashed transitive lock; actual MAF/OpenAI/OTel pins pending ET-WP-00 receipt |
| Compose | Phoenix image variable deliberately unset until a verified version/digest is supplied; no latest tag |

Versions above were resolved and installed in this environment. This proves
package availability/core tests, not Mac arm64, corporate Azure, Docker, browser,
Phoenix or model compatibility. Producer-owned packages without source do not
participate in build/typecheck yet. Foundation build checks contracts/server;
there is no built UI at this revision. React/Vite source use awaits ET-WP-08.

The Python lock currently supports contracts only. Do not mistake successful
installation for real agent support. ET-WP-00 owns current provider SDK verification;
ET-WP-03 will add those exact pins additively and regenerate locks before provider
integration. Existing immutable receipts remain unchanged. No secrets are needed
to compile contracts or develop against these service interfaces.
