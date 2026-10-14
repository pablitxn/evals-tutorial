# ET-WP-10 final UI correction acceptance

2026-10-14 UTC. Integrated exact UI correction PR14 head
29466d3e86662829d40a1ef04c6898ce57208450 through merge
a30d111. The two harness/proxy conflicts use the producer's exact files. All nine
published correction artifact hashes verify. Existing UI recording-only retry
and the telemetry-pending review guard remain present. No producer receipt was
modified or reinterpreted as browser acceptance.

Root npm test now includes the actual Vite/backend proxy test and three browser
harness regressions. This candidate passes 131 Node tests with one explicitly
separate Docker gate, 15 Python agent tests and three Python harness tests.
Typecheck and all six workspace builds pass. The proxy regression accepts the
explicit loopback origins and rejects foreign, null and cross-site requests
before validation. Harness regressions require Chromium sandboxing, exclusive
new evidence paths and an unverified receipt on launch failure without retry.
They do not constitute actual browser interaction evidence.

The clean source-ZIP install, start, complete offline demo and stop rehearsal at
e92b86c7bce9e6e0f08bda485300a9ae8e9870d1 remains recorded in receipt07.
Production runtime, pinned dependencies and installers are byte-identical.
Subsequent accepted changes are development proxy configuration, test activation,
stronger acceptance tests, documentation and immutable evidence. The final main
ZIP will be generated from its exact clean commit and verified by the same
allowlist, per-file hashes and deterministic ZIP packager. Do not claim that final
ZIP itself repeated the earlier full clean-install rehearsal.

Prior actual Docker 21/21 and actual Phoenix 16 local plus eight corpus checks
remain applicable; their production code has not changed. All application
provider calls and real model tokens remain zero. The source candidate is ready
for the user's local Mac handoff. Actual Mac, sandboxed browser, live provider,
multimodal/judge/review and complete workshop acceptance remain open. No hosting
or automatic inference was introduced.
