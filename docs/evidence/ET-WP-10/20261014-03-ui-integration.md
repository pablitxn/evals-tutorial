# ET-WP-10 UI integration candidate

Observed 2026-10-14 UTC. Producer PR7 head
`773efd8318ddd5d6db9f6224bc6ea20be02847f8`; corrected contract main
`77f4940424d15ef079fd1cdba04c8ffef1735bd6`.

Integrator activates existing web manifest build/typecheck/dev commands and adds
six UI model tests to root checks. A real Vite production build is served through
the actual loopback HTTP server alongside all seven corpus lessons. The test
checks both hashed assets, production script-src self without unsafe-eval,
read-only content, rejected cross-origin access and a traversal attempt.
Shared ahead-of-time contract validation is covered by the separate ET-WP-03
20261014-05 receipt. No new dependencies or producer source changes.

Root typecheck/build pass; all 88 aggregate tests pass with zero failures/skips.
All 19 published UI artifact hashes match. The integration test is HTTP/static evidence, not browser acceptance.
A fresh Chromium launch with chromium_sandbox=True failed in this environment
(Target page, context or browser has been closed). No disabled-sandbox launch was
attempted by the integrator.

Producer browser-test.py currently explicitly requests --no-sandbox; the published
21 mocked checks therefore are not accepted as sandboxed browser evidence. Parent
was notified to route an additive owner correction; original screenshots, receipt
and artifact hashes remain immutable. The published browser script also writes
fixed evidence paths, so it was not rerun. UI merge is held for that correction.
The Vite dev proxy also requires owner attention for mutating requests: the API
requires Origin to match Host, while dev and API listen on 5173 and 3000. The
production single-origin route is the tested distribution path.

No inference or provider authentication occurred. Full runner/agent/Phoenix wiring,
actual browser rendering, live provider behavior and Mac end-to-end remain pending.
