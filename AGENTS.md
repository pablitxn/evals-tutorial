# Evals Tutorial

English code, comments, documentation and scoped Conventional Commits are required.
Before each commit verify author and committer are Pablo Coronel <git@pablocoronel.com>
with the Atlas `tools/cloud_git_identity.py` guard when the Atlas checkout is available.
No force push, history rewriting, automatic merge or hosted deployment.

Read `docs/contracts/v1.md` and the task evidence before changing interfaces.
ET-INTEGRATOR exclusively owns root manifests, all package manifests and locks,
root scripts/configuration/README, packages/contracts/**, server HTTP/bootstrap,
cross-package integration and aggregate evidence. Producers request dependency or
schema changes through the integrator. Their ownership excludes these files.

- ET-WP-01: docs/curriculum/** and its own evidence.
- ET-WP-02: docs/ux/** and its own evidence.
- ET-WP-04: content/** and its own evidence.
- ET-WP-05: apps/agents/src/**, apps/agents/tests/**, server providers/judge-broker.
- ET-WP-06: packages/evaluator-runtime/**, server validation/runs/runner.
- ET-WP-07: packages/phoenix/**, server telemetry.
- ET-WP-08: apps/web/**.
- ET-WP-09: packages/review/**, server review.

One read-only intro and six cases. Learners edit TypeScript evaluators; Python
agents and datasets are read-only consultation. Use owned synthetic data only.
No credential generation, real transmission, booking or inference on navigation.
A child process is not a sandbox. Missing isolated execution must fail closed.
Fixtures, real runs and operational errors must remain distinguishable.
Freeze evidence under docs/evidence/ET-WP-XX/<unique-receipt>.md. Corrections are
additive receipts, never rewritten published evidence. Parent dispatches producers.
