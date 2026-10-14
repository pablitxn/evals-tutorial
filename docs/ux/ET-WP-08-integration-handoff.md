# ET-WP-08 frontend integration handoff

Implementation starts from foundation `5f95fca766616b770152665d00031e516f967c22` and incorporates main `d54fe4add6c0e3be74f2e660e990a7c9c19d5e3d` without changing the v1 contracts. Original ET-WP-02 specification/wireframes are preserved beside this additive handoff.

## Integrator changes requested

Only ET-INTEGRATOR should activate these scripts in `apps/web/package.json`:

```json
{
  "build": "vite build",
  "typecheck": "tsc --noEmit -p tsconfig.json",
  "dev": "vite --host 127.0.0.1"
}
```

Include `apps/web/tests/model.test.ts` in the root Node test command if desired. No new dependency, package manifest, lock, HTTP route, source schema or root configuration is needed. Existing dependencies are React/react-dom 19.2.0, React types 19.2.2, Vite 7.1.10, TypeScript 5.9.3, and `@evals-tutorial/contracts` 0.1.0. The editable TS surface is a labeled native textarea with Tab escape, Ctrl/Cmd+] indentation, expand/copy controls, line gutter and positioned diagnostic focus; semantic validation remains in the isolated backend. No browser evaluation, syntax-highlighting package or editor install.

Build emits `apps/web/dist/index.html` and hashed assets; existing server bootstrap already serves that directory. Hash-based lesson URLs (`#intro` through `#06-simulated-travel`) avoid requiring an HTTP history fallback. Production uses relative same-origin `/api/*`; Vite dev serves at 127.0.0.1:5173 and proxies `/api` to 127.0.0.1:3000. The dev proxy is tooling only; distribution uses the single server origin.

## Exact exports and boundaries

| File | Exports / consumer purpose |
| --- | --- |
| `apps/web/src/main.tsx` | Browser entry, mounts `App`; imports the stylesheet. No service export. |
| `apps/web/src/App.tsx` | Named `App()` React component; owns seven-lesson navigation, workflow/polling, reset and local work state. No server injection required. |
| `apps/web/src/api.ts` | `ApiError`, `request<T>(path, schema, body?, signal?)`, `errorText(error)`. Schema-checks every response; GET by default, JSON POST only on explicit operations, 15-second transport timeout. |
| `apps/web/src/model.ts` | `LESSON_IDS`, `LESSON_LABELS`, `LESSON_MINUTES`, `snapshot`, `sourceHash`, `sameSnapshot`, `runCurrent`, `fixturesDiscriminate`, `reviewCurrent`, `reviewFindingsValid`, `runActive`, `reviewActive`, `safeUrl`, `lessonFromHash`. Pure state/binding checks except browser hashing/navigation helpers. |
| `apps/web/src/storage.ts` | `SavedWork`, `PendingSubmission`, `PREFIX`, `PENDING_KEY`, `storageKey`, `save`, `read`, `remove`, `loadWork`, `resetStorage`. Stores source/version/variant and receipt/request IDs; no keys or full provider configuration. |
| `apps/web/src/components.tsx` | `ModeBadge`, `ExternalLink`, `PhoenixEvidence`, `LessonText`, `Editor`, `ReferenceTabs`, `RunResults`, `DocumentPreviews`, `ReviewFeedback`. Shared rendered primitives. |
| `apps/web/vite.config.ts` | Default Vite configuration. |

The app consumes exactly Tutorial, Dataset, ServiceStatus, ValidateRequest/ValidationResult, RunRequest/AcceptedRun/RunRecord, ReviewRequest/AcceptedReview/ReviewRecord and typed errors through frozen v1 routes. It imports only the browser-safe contracts entry, never `/node`. sourceHash is SHA-256 of exact UTF-8 bytes; no whitespace normalization. Backend review service owns canonical receipt digests and trusted binding construction; client compares all visible bound identities, versions, source, variant/profile and invalidates reviews after newer receipt timestamps. localStorage never grants completion.

## Implemented behavior

- One read-only introduction and six cases; free navigation never submits a run/review. Separate editable TS, read-only JSON/Python reference tabs, per-criterion/case mode badges, glossary and official links.
- Explicit Validate, Test Fixtures, Run Agent, optional prepared variant comparison, Cancel, DOUBLE CHECK, Retry Review/Review Again, scoped reset and copy actions. Cost/budget cues use frozen limits; unavailable capabilities disable applicable actions. Code fixture testing remains usable during provider outage when validation/runner are healthy.
- Fixture assertion is separate from observed evaluator score. Correctly failing a known bad response can match a fixture and satisfy educational eligibility. Execution/timeout/provider/schema failure is never a score. Real response/reference and fixture expected evaluation remain distinct.
- Accepted run/review recovery is GET-only. Unknown POST acceptance retains the same request ID and requires explicit Recover submission; no automatic new paid attempt. Transport failure preserves the operation. A definitive backend not_found after restart clears unavailable active evidence and allows local recovery without restoring completion.
- Mutation locks during active operations; reading/navigation remain available. Source/rubric/data/profile/variant/receipt changes invalidate current reviews. Matching ready reviews are fallible educational status; missing Phoenix recording still leaves the overall demonstration incomplete.
- Current drafts/version IDs/latest receipt IDs and bounded previous receipt IDs persist. Older version source remains inspectable/copyable with a new unvalidated starter. Reset removes only this tutorial's scoped keys, with Cancel-first dialog focus; Phoenix history survives. Failed storage remains visible with in-memory source and copy access.
- Reference tabs use accessible selected/focus state and arrows/Home/End. Diagnostics focus exact line/column; native Tab exits editor. Polite summaries, visible focus, semantic tables, labeled scroll regions, reduced motion and 320px/200% layouts. Narrow flow puts editor/actions before references, results and review.
- Phoenix links only render backend-supplied HTTP(S) URLs; no generated localhost experiment/trace paths. Document previews use frozen `/api/documents/:id` for explicit `documentId`/`documentIds` or `documents[].id` in synthetic input; other shapes remain visible in JSON. PDF/image opening remains available if inline preview is unsupported.

## Verification and remaining integration work

Direct commands (root manifest scripts do not yet include the frontend):

```sh
./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json
./node_modules/.bin/vite build apps/web
node --import tsx --test apps/web/tests/model.test.ts
```

Browser rehearsal: start `../../node_modules/.bin/vite preview --host 127.0.0.1 --port 4173 --strictPort` from `apps/web`, then run `python3 apps/web/tests/browser-test.py` from repo root using the existing system Playwright and Chromium. Test mocks validate against shared schemas and are not imported by production code. Screenshots explicitly show synthetic content/profile. The test script writes task-owned evidence; published receipts are immutable, so later runs should use a new receipt/artifact path when publishing amendments.

Real integration still needs producer content/services, actual provider and Phoenix artifacts, and the requested web scripts. V1 supplies one `pythonSource` per exercise, not variant-specific consultation source; the UI says this explicitly. No telemetry-retry endpoint exists in v1, so the UI provides recovery guidance rather than inventing one or repeating inference. Run receipts omit usage/prices, so the table says Not reported. Screen reader/manual software-keyboard and real provider/Docker checks remain integration/rehearsal work; synthetic browser checks do not certify those systems.
