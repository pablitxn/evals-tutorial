# ET-WP-08 browser and dev proxy correction

Additive correction to the original frontend handoff. Base is integration PR #12
head `f5414f5dc355cece16e736ab9c3a079d4277a7f5`, containing the corrected main
contract at `77f4940424d15ef079fd1cdba04c8ffef1735bd6`.

The browser rehearsal now explicitly requires `chromium_sandbox=True`. Removing
an explicit command-line flag alone is insufficient because Playwright defaults
Chromium's sandbox off. Launch failure produces an `unverified` JSON receipt and
exit status 2; there is no insecure retry, host sandbox reconfiguration or assumed
browser success. The original 21 mocked checks are historical evidence from the
earlier harness and do not close the current sandboxed-browser gate.

Each invocation creates a new directory under `docs/evidence/ET-WP-08` named
`browser-<UTC timestamp>-<random suffix>`. Screenshots live inside that directory;
the report is created exclusively and refuses replacement. The receipt records
the actual checkout revision and whether the worktree was dirty. Existing dated
receipts, screenshots and their hash manifest remain unchanged.

Run from the owner repository root:

```sh
python3 apps/web/tests/browser-test.py
python3 -m unittest discover -s apps/web/tests -p 'test_browser_harness.py'
node --import tsx --test apps/web/tests/model.test.ts apps/web/tests/proxy.test.ts
```

On a machine where sandboxed Chromium can launch, start the built UI preview at
127.0.0.1:4173 before the rehearsal. A busy preview port is an environmental
blocker; do not stop an unrelated process or treat its assets as the tested build.
This environment's launch failed before page navigation, so no preview assets or
UI interactions were verified by the corrected harness.

The Vite dev proxy now rewrites Host to the backend target and rewrites Origin
only for the two explicit dev origins, `http://127.0.0.1:5173` and
`http://localhost:5173`. Foreign/null origins remain unchanged for backend
rejection; cross-site fetch metadata is preserved and rejected. Production remains
on the single restricted server origin; no server HTTP/bootstrap or CORS change.

`apps/web/dev-proxy.ts` exports
`createLoopbackApiProxy(target, frontendOrigins): ProxyOptions`; no dependency was
added. The new proxy test uses the actual Vite proxy and existing backend HTTP
handler, including accepted local POSTs and rejected foreign/cross-site POSTs.
The integrator may include `apps/web/tests/proxy.test.ts` in its owned test
manifest; no manifest change is part of this correction.
