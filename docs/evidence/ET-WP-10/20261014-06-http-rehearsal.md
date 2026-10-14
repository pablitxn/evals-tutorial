# ET-WP-10 actual offline HTTP rehearsal

2026-10-14 UTC. Running committed source:
1596a027b8b82bc3ec522b0dbfa63dc64ba173e6.
Standard npm run start launched the built UI and integrated backend with a null
provider profile; validation, isolated runner and local Phoenix were available.
No model credential or inference call was used.

The first immediate health assertion raced Phoenix startup. After health became
available the complete HTTP check passed. Startup now explicitly waits for bounded
Phoenix readiness and the check tolerates the bounded initial health window;
this small lifecycle correction is included with this receipt. It has not weakened
any capability assertion or converted an error into success.

Actual HTTP observations: all seven exact starter snapshots compiled in Docker.
The intro's one positive fixture completed and was verified in Phoenix. Case 1,
using the intro's taught evaluator, correctly classified all four positive/negative
fixtures. The unchanged unfinished case-1 starter produced four operational errors
with no scores; those errors were also verified in Phoenix. Reusing the exact
request returned the same run ID, and explicit telemetry retry preserved the same
experiment. Stored IDs and exact source provenance are in http.json.

The development proxy was exercised against this actual server. An exact local
5173 Origin reached request schema validation (400 for deliberately empty source),
while https://untrusted.invalid remained rejected (403 same-origin policy). The
production server retained script-src self and no unsafe-eval. This is HTTP/static
evidence, not browser rendering acceptance.

Before stop, all three decorated receipts were hashed. npm run stop completed,
removed its own PID record and stopped only the task's Phoenix service, preserving
the volume and receipt directories. Subsequent restart/fresh-ZIP verification will
be recorded separately. Previous producer evidence and screenshots are unchanged.

A Mac handoff is prepared at docs/mac-handoff.md. This Cloud run does not close
sandboxed browser, actual Mac/ARM64, live OpenAI/Azure, multimodal, semantic judge,
DOUBLE CHECK or complete workshop acceptance. No hosted deployment was performed.
