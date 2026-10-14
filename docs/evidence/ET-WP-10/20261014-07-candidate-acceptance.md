# ET-WP-10 offline candidate acceptance

2026-10-14 UTC. ET-INTEGRATOR. Tested source candidate:
e92b86c7bce9e6e0f08bda485300a9ae8e9870d1, branch integration/et-runtime-services,
PR13. Parent reported producer task-service resume failures and explicitly
instructed the integrator to handle narrow acceptance corrections directly while
preserving evidence. The earlier Phoenix-owner coordination dependency is therefore
completed here with stricter tests, rather than silently waived.

Phoenix local/corpus acceptance no longer tolerates the former padded-GlobalID
contract failure or substitutes IDs read from a journal. The restart subprocess
also requires the real TelemetryService return. All 15 local and eight corpus
checks pass with serviceReturn verified; exact new JSON receipts/logs are retained.
The original ET-WP-07 blocked receipt remains unchanged and historically accurate.
The final delta from the installed candidate is limited to these acceptance tests,
Phoenix/Mac documentation and this evidence; application/dependency/installer
source is unchanged. Root strict typecheck passes after the test correction.

The allowlisted ZIP was built twice with identical SHA-256
7f0aaf221b68411b714b23e989e7355f4012b409d2521300ce6e85932160d43f.
It contains 303 source files plus SOURCE-MANIFEST.json, 1,962,144 bytes compressed.
ZIP integrity, allowlist, exact file hashes and secret-pattern exclusion pass.
No .env, local receipts, dependency tree, Git metadata or compiled bundle is shipped.

Fresh extraction into /tmp/Evals Tutorial Clean e92b86c/evals-tutorial had no Git
metadata or preinstalled dependencies. npm run install:all passed: locked npm,
hash-required Python install and pip check, generated contract check, all builds,
pinned image preparation and network-disabled runner build. The isolated image
remained sha256:291ae3ea80955f76a1373d8c17f5edc93b29832938956618c06788ab73470cf9.
The complete post-install source manifest still verified exact revision e92b86c.

A separate Compose project/volume, evals-tutorial-clean-e92, supplied fresh Phoenix
state. Standard start passed its bounded health wait. Standard demo:check passed:
130 TS checks plus 15 Python checks, one declared Docker skip in the lightweight
suite followed by all 21 actual Docker/service checks passing with zero skips,
seven real starter compilations, one intro fixture, four discriminating case-1
fixtures and four unfinished-evaluator errors. Actual execution and error results
were recorded/read back in Phoenix; IDs/provenance are in clean-http.json. Same
request IDs and telemetry-only retry did not duplicate execution or experiments.
Provider remained unconfigured and automaticInference false: zero model calls.

A separate restart rehearsal preserved all three decorated execution receipts
byte-for-byte across server and Phoenix restart. Stop removed its own PID record
and retained the task's volume/state. Fresh-extraction stop is checked separately
before publication. Private local Docker socket forwarding was exercised without
credential/proxy configuration or worker-mounted sockets. All 40 locked Python
packages also downloaded as Python 3.12 macOS ARM64-compatible wheels (receipt 05);
no Mac execution is claimed by that download check.

The previously corrected browser harness requires a sandbox and fresh artifact
paths. Cloud sandboxed Chromium cannot launch; the old 21 disabled-sandbox mock
checks are not accepted browser evidence. The UI production build/HTTP/CSP/proxy
checks pass, but actual browser rendering remains a Mac validation gate. Also open:
actual Mac/ARM64, live OpenAI/Azure, multimodal perception, semantic judge, real
DOUBLE CHECK and the full 150-180 minute workshop. No hosted deployment, credential
generation, model inference, booking, filing or transmission occurred.

This is an offline-tested candidate suitable for turning on the user's Mac and
performing the explicit handoff in docs/mac-handoff.md. It is not a claim that the
whole tutorial has completed live/host acceptance. Final merged SHA and final ZIP
identity are supplied in the publication handoff; a final test/evidence-only delta
must preserve the verified application tree of this clean-installed candidate.
