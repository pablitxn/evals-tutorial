# ET-WP-03 browser/Phoenix contract correction

Observed 2026-10-14 UTC by ET-INTEGRATOR. Base main
`c144dce2c363898c04d7a9f2362a922e0d3d9e31`. This dedicated correction branch
contains shared contract changes only; no producer implementation is merged here.

UI PR7 at `773efd8318ddd5d6db9f6224bc6ea20be02847f8` exposed runtime Ajv
compilation under production CSP. Authoritative wire validators are now generated
as ESM at development time with the already locked Ajv 8.17.1. Runtime validation
requires no eval/new Function. A subprocess regression disables string code
generation and validates positive/negative scores and real Phoenix IDs. Existing
server-owned domain validation is lazy; browser consumers do not compile schemas.
No CSP weakening, new dependency, inference or schema-shape change is introduced.

Phoenix PR8 at `eb50cf489b8a5ecb7904fa82e4e595ad839303a8` supplied actual padded
GlobalIDs (`RGF0YXNldFZlcnNpb246MjU=`, `RXhwZXJpbWVudDo1OA==`) that frozen
PhoenixLinks rejected. Exactly datasetId, datasetVersionId and experimentId now
accept the bounded base64 alphabet/padding as well as prior supported IDs. IDs
remain verbatim. Tests also reject misplaced/excess padding, whitespace including
final newlines, empty/oversized values, unrelated URL origins and padded run IDs.
Python validates the same positive/negative ID cases. Generated TS/Python field
types remain unchanged because these fields are still strings.

`npm run contracts:generate`, `contracts:check`, `typecheck`, `build` and aggregate
`npm test` pass: 81 tests, zero failures/skips. `git diff --check` passes. No live
Phoenix return or browser acceptance is claimed by these shared-contract tests.
Phoenix owner must consume the published exact head and add successful-return
local/corpus evidence before its producer merge. The earlier producer receipt
remains immutable and correctly reports its former contract blocker.
