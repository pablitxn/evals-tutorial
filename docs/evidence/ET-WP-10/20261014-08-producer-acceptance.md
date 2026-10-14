# ET-WP-10 updated producer acceptance

2026-10-14 UTC. During final PR metadata verification, Phoenix PR8 advanced to
769a597e257544f9c5fe65ed17140d657ed450be. The parent confirmed that exact head.
It was incorporated additively by merge 659ad949030f82179baaaa423cc28777c731cb29.
The README and overlapping test conflicts were resolved to the producer's exact
stronger versions. No producer production adapter or shared contract was changed.

All 22 new producer artifact hashes match. Original ET-WP-07 receipts remain
unchanged. Its additive publication clarification explicitly documents trailing
whitespace in three preserved raw stdout captures; the complete historical diff
whitespace check has those known evidence exceptions. Source/test/Markdown/JSON
checks pass. No raw producer log was rewritten to hide or normalize that history.

The merged owner tests were rerun against a fresh task-owned Phoenix Compose
project/volume, evals-tutorial-owner-gate-769, after bounded health readiness.
All 16 local tests and eight corpus tests pass with serviceReturn verified.
The additional test requires an actual padded GlobalID and verifies all returned
top-level/per-row links. Cross-process restart, concurrency, idempotency, errors,
cancellation, exact dataset versions and Python OTel parent continuity remain
covered. The production adapter is unchanged. The test instance was stopped after
completion; its localhost URLs are historical observed evidence while stopped.

The prior fresh source-ZIP rehearsal also stopped cleanly: no server PID remained
and no .env had been packaged or created. The exact extracted source manifest
still verified e92b86c7bce9e6e0f08bda485300a9ae8e9870d1. A Git tree comparison
confirms all post-rehearsal changes so far are tests, documentation and evidence;
application, dependency and installer source remain byte-identical.

Parent also reported the UI producer active on its acceptance correction. Its
final head/evidence will be reconciled before the final main merge. Existing
integrator UI corrections already require browser sandboxing and unique artifacts,
preserve same-origin dev behavior, and wire recording-only retry. No browser
sandbox bypass is accepted. Mac/browser/live-provider/full-workshop gates remain
open; all application provider calls and real token spend remain zero.
