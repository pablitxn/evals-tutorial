# ET-WP-03 readiness dependency integration

Date: 2026-10-14 UTC. Original consumer base:
5f95fca766616b770152665d00031e516f967c22, feat/et-wp03-foundation.
Readiness source: PR #2, b4a7bb981c7c115f4ea33651d1563200153942d0.
Its documentation was included through an additive merge on the foundation
branch. All 17 hashes in its immutable evidence manifest were verified. No
readiness evidence was edited or regenerated. Parent remains dispatch owner.

The parent subsequently relayed the user's explicit authorization to mark ready
and merge validated evals-tutorial PRs, without another per-PR confirmation.
This supersedes the earlier no-merge state for this repository only. Existing
published commits/producer branches are preserved. Actual final main and PR
states are reported after the authorized operation, not predicted here.

## Adopted dependency tuple

- Python agent-framework-openai 1.16.0, agent-framework-core 1.21.0, openai 3.31.0,
  pydantic 2.14.1, OTel API/SDK/HTTP exporter 1.45.1. All 34 readiness Python
  versions constrain lock generation; the full hashed lock now has 40 packages,
  including the existing contract validation/canonicalization dependencies.
- Node @arizeai/phoenix-client 7.16.1, @arizeai/phoenix-otel 2.2.0,
  @opentelemetry/api 1.9.0, @types/node 24.10.0, TypeScript 5.9.3. The installed
  version sets for every package represented by readiness node-versions.json
  match exactly, including transitive OTel versions. Extra foundation React/Vite,
  schema/compiler/build dependencies remain locked separately.
- Phoenix image version-20.21.3 with sha256:333ae941c99a366f90542cacfa5fa0745a331f13c2e66857de5e44c19a46f6e0.
- Runner base Node 24.19.0-bookworm-slim with sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df.

Exact full image references live in scripts/runtime-pins.json. Compose defaults
and .env.example carry the same Phoenix pin. install:all passes the pinned
RUNNER_BASE_IMAGE build argument; ET-WP-06 owns the final Dockerfile/image and must
honor this argument or coordinate its existing convention before integration.
No producer-owned source, schema or service interface changed. Foundation remains
an additive ancestor-compatible update for consumers based on 5f95fca.

## Verification

Hashed Python installation and pip check passed. Runtime metadata matches all 34
readiness Python pins; MAF/OpenAI/OTel imports succeed with no requests. npm
installation resolved the exact readiness version sets. The existing Phoenix
probe type-checks against the installed SDK without running it. Compose resolves
the immutable image and validates structurally without pulling/running containers.
Generated-contract check, contracts/server type/build checks, all 9 offline tests,
script syntax checks and diff whitespace checks pass. Runtime schema/interface diff
against 5f95fca is empty. Existing tests were rerun because dependencies changed.

No new provider/Docker/Phoenix capability probe was repeated. ET-WP-00 owns those
receipts. No inference/tokens, credentials or browser-security workaround. Its
sandboxed Chromium failure and live OpenAI/Azure/Mac/ARM64/release gates remain
explicit. Installed SDKs do not certify actual provider access or model perception.
Producer factories are not yet supplied; no fabricated wiring is installed.
