# ET-WP-10 narrow integration corrections

2026-10-14 UTC. Combined parent: 9601aaf (full identity in Git history).
Corrections are additive to the published producer checkpoints. No published
receipt, screenshot or old artifact manifest was edited. The integrator applied
small cross-package corrections needed for a safe local launch; affected producer
source files now intentionally differ from their original artifact hashes.

UI: browser harness requires chromium_sandbox=True and no longer passes
--no-sandbox. Rehearsal artifacts default to a fresh UUID directory in ignored
.local/ui-browser; an explicit --artifacts directory must not exist. Attempting
the original published evidence directory fails before browser launch, preserving
its files. Executable selection is optional/explicit instead of hardcoding Linux.
Prior 21 mocked checks remain historical disabled-sandbox observations, not
accepted sandboxed browser evidence. Sandboxed Chromium launch remains unavailable
in this Cloud environment; no relaxed security flag is used to close that gate.

The Vite proxy rewrites only the exact trusted http://127.0.0.1:5173 dev Origin
and Host to the existing API origin. Foreign Origins retain their value and remain
rejected by HTTP policy. Production CSP/origin policy is unchanged. The UI gains
an explicit Retry Phoenix recording button for terminal stored results, wired to
the new non-inference endpoint. DOUBLE CHECK waits until pending recording settles
so its whole-receipt binding does not change during normal background persistence.

Mac/local Docker contexts: bootstrap/lifecycle/installation resolve the existing
selected context to a local Unix socket, then use a private CLI configuration.
The host adapter accepts only that trusted local socket option; its CLI environment
contains PATH and DOCKER_HOST only. No socket is mounted in a worker, no TCP/SSH
remote endpoint is accepted and container restrictions are unchanged. Producer
Docker tests receive the same trusted endpoint explicitly. A new fake-CLI boundary
test checks exact environment keys and rejects remote/newline endpoints. This
closes the earlier default-socket limitation without a host-execution fallback.

Verification: root typecheck/build pass. Aggregate offline tests pass 130 TS checks
with one separately gated Docker case skipped, plus 15 Python checks. After the
Docker context change the full actual Docker/service suite was repeated: 21 pass,
zero skips. All 40 locked Python packages downloaded as hashed Python 3.12 macOS
ARM64-compatible wheels; the wheel manifest is retained. This proves distribution
availability, not execution on a Mac. No dependency pins changed.

The first actual HTTP rehearsal successfully compiled seven starters and recorded
the intro's positive fixture, then the integrator check incorrectly expected an
intro negative fixture. Inspection confirmed the intro contains exactly one good
response. The corrected check uses case 1 with the already taught intro evaluator
to prove positive/negative discrimination, and separately verifies unfinished
starter errors have no score. This was a check correction, not a corpus change.
Final complete HTTP, proxy, restart and fresh-ZIP results follow in a new receipt.
All inference counts remain zero; live/browser/Mac gates remain pending.
