# ET-WP-08 browser/proxy correction receipt

Base: integration PR #12 at `f5414f5dc355cece16e736ab9c3a079d4277a7f5`.
Main contract: `77f4940424d15ef079fd1cdba04c8ffef1735bd6`, verified ancestor
of the base. Branch `fix/et-wp08-browser-proxy`; isolated worktree
`/workspace/task-et-wp-08-corrections`. Final correction head is recorded in the
publication handoff rather than embedded self-referentially in this receipt.

This additive correction removes the earlier harness's sandbox bypass. Browser
launch now explicitly requires Playwright `chromium_sandbox=True`; failure writes
an unverified result and exits 2 without a fallback. Every rehearsal allocates a
fresh timestamp/UUID directory, and report creation refuses replacement. Revision
metadata records the actual checkout and dirty state instead of a fixed old base.
Historical reports/screenshots/hash manifest were compared to the base and remain
byte-for-byte unchanged. The earlier 21 mocked checks do not constitute accepted
evidence for the current sandboxed-browser gate.

Vite dev proxy changes Host to the API target and rewrites only the explicit local
dev Origins at port 5173. Foreign/null Origins and cross-site metadata remain
subject to the existing backend rejection. Production origin rules, contracts,
manifests/locks, HTTP/bootstrap, provider/runner code and UI application source
remain unchanged. No dependency, credential, merge, deployment or paid call.

| Verification | Result |
| --- | --- |
| `npm run typecheck --workspace @evals-tutorial/web` | Exit 0. |
| `npm run build --workspace @evals-tutorial/web` | Exit 0. Existing large-bundle warning (705 kB / 139 kB gzip); no bundle-polish changes introduced. |
| `node --import tsx --test apps/web/tests/model.test.ts apps/web/tests/proxy.test.ts` | Exit 0, 7 tests. Real Vite proxy + backend handler accepted three local/absent-Origin POSTs; foreign, null and cross-site cases returned 403 and did not reach validation. |
| `python3 -m unittest discover -s apps/web/tests -p 'test_browser_harness.py'` | Exit 0, 3 tests. Fresh directories, exclusive report creation, required sandbox flag and failure without insecure retry. |
| `python3 apps/web/tests/browser-test.py` | Exit 2: sandboxed Chromium launch failed before page navigation. Browser gate unverified; zero executed UI checks. No sandbox bypass or host permission/configuration change attempted. |
| Preview preparation | Port 4173 already occupied. No unrelated process was stopped and its build was not used as evidence. Browser launch failed before reaching any preview. |
| Historical evidence preservation | All five existing ET-WP-08 evidence files unchanged from the base. |
| Identity/ownership/whitespace | Approved Atlas guard verifies both roles as Pablo Coronel <git@pablocoronel.com>; staged owned-path and whitespace checks before commit. |

Actual browser failure is preserved in the unique
[unverified receipt](browser-20261014T150420381806Z-9fe04b04/browser-ui-mock.json).
Chromium reported that the SUID sandbox helper is not configured correctly and
terminated. This is an environment gate; unit tests do not substitute for browser
acceptance. Existing system Playwright/Chromium were used without installation.

The [correction guide](../../ux/ET-WP-08-browser-corrections.md) gives exact exports
and commands. `createLoopbackApiProxy(target, frontendOrigins): ProxyOptions` is
the only new TS export; Python evidence helpers are test tooling. Integrator may
include the proxy test in its owned manifest. Later sandboxed rehearsals must
publish new evidence directories, never edit this receipt or the old artifacts.
