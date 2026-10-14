# ET-WP-10 runtime integration checkpoint

2026-10-14 UTC; ET-INTEGRATOR. Base main
77f4940424d15ef079fd1cdba04c8ffef1735bd6. Preserved producer heads:
ET-WP-05 PR10 8161a3307365cbb19b3959e526f453f0e77dabe8,
ET-WP-06 PR9 386a46b484245e47de60c53d7ece612de4dde853,
ET-WP-07 PR8 eb50cf489b8a5ecb7904fa82e4e595ad839303a8.
This is an integration branch checkpoint, not a whole-tutorial acceptance claim.

Producer implementation/evidence paths remain byte-identical to those exact heads.
All 16 runner and 21 Phoenix artifact hashes match. ET05 has 24 artifacts: the one
original log hash differs exactly as documented in its additive 02 normalization
receipt; the corrected log hash matches. No producer evidence is rewritten.

Shared changes activate existing runtime/Phoenix manifests and server workspace
dependencies; the npm lock adds only two local workspace edges. Existing SDK pins
and the hashed Python lock are unchanged. The aggregate script covers provider,
broker, orchestration, contracts, corpus, review, HTTP and Python tests. A separate
Docker gate refuses a missing image instead of treating a skip as isolation proof.

Server bootstrap wires actual prepared providers/broker, isolated validation/runs,
review and Phoenix. Missing provider configuration keeps Code fixtures/read-only
content usable. One trusted source project passes W3C context into Python and
retains AgentSuccess.traceId. Served Python consultation uses the producer's exact
MAF snapshots, verified against the aggregate installed Python source hash and
primitive file hash; dataset bytes remain unchanged. Consultation changes create
runtime1 tutorial/exercise versions to invalidate older browser evidence.

A separate durable recording overlay preserves immutable execution receipts,
scores and errors. Recording failures are independent. Explicit
POST /api/runs/:id/telemetry with {} queues a retry from stored results only;
GET returns RunRecord, and the CLI is npm run telemetry:retry -- RUN_ID.
Duplicate recording is idempotent and serialized; interrupted recording requires
explicit recovery. Tests cover outage/retry, no repeated execution, exact row
mapping, persistence/restart, malformed links and changed-receipt rejection.

Startup requires a clean Git identity or verified extracted source manifest.
Lifecycle handling preserves Phoenix data, scopes process identity to the exact
checkout and cleans its PID record. The Docker build context is allowlisted;
TypeScript/worker COPY steps use network=none. A Cloud-only build attempt failed
because /home/agent/.docker/buildx is read-only; retry with task-local DOCKER_CONFIG
succeeded without changing sandbox/TLS settings. The published scripts honor an
explicit Docker CLI configuration. The runner itself currently requires the local
default Docker socket; Mac private-context-only support remains an owner follow-up.

Observed checks: root typecheck/build/contracts check pass. Aggregate tests:
122 passed TypeScript, one intentionally skipped Docker case, plus 15 Python tests.
Separate actual Docker/security and service suite: 21 passed, zero skipped.
Restricted filesystem/network, resource limits, malformed protocols, cancellation
cleanup and bounded broker abuse checks ran against immutable local image
sha256:291ae3ea80955f76a1373d8c17f5edc93b29832938956618c06788ab73470cf9.
Phoenix 20.21.3 local suite: 15 passed, serviceReturn verified under the corrected
contract. Corpus persistence suite: 8 passed over seven datasets/60 stored fixture
rows; these receipts are synthetic, not results of executing learner evaluators.
The pinned Phoenix manifest advertises both Linux amd64 and arm64; no ARM runtime
execution is claimed. All model request/token counts are zero.

Full HTTP execution/recording, clean source extraction/install/start/stop and final
UI corrections are still pending at this checkpoint. UI draft PR12 awaits its
sandbox/evidence-path/proxy correction; sandboxed Chromium cannot launch here.
Live provider perception, judges/review, browser and Mac acceptance remain open.
The explicit live check script is an intro-only paid probe and has not been run.
