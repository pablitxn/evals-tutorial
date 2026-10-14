# ET-WP-07 GlobalID acceptance publication and log clarification

This additive note clarifies the check wording in
[the second receipt](20261014-02-globalid-acceptance.md), published at
`b0267028c3180f43771fe3ee88dc1fe0a01c3126`. Both earlier receipts and their
artifact directories remain immutable. The successful-return results are unchanged:
7 offline, 16 local Phoenix and 8 actual-corpus checks pass; local and corpus JSON
both state `serviceReturn: verified`. The padded version ID remains exactly
`RGF0YXNldFZlcnNpb246MQ==`, with actual returned top-level and per-row links.

## Check clarification

The second receipt's combined row "Diff whitespace / prior immutable evidence
checks: Clean" was too broad. The complete staged whitespace check reported
trailing whitespace and final blank lines in exact captured stdout artifacts:
`contracts-check.txt`, `local-tests-initial-startup.txt`, and `typecheck.txt`.
These were emitted by npm/Turbo and Node's failed-startup assertion renderer.
The shell continued to the guarded commit, so this was not a successful complete
whitespace check. Preserve those raw logs as observed evidence rather than silently
rewriting published output or claiming the check passed.

The explicit source/test/README/Markdown/JSON check below returned exit 0 after
publication. Previous published evidence was separately compared byte-for-byte
with `eb50cf489b8a5ecb7904fa82e4e595ad839303a8` and remained unchanged. Read that
receipt row as **source/document differences clean; raw stdout whitespace
exceptions present; prior evidence unchanged**.

```sh
git diff --check 77f4940424d15ef079fd1cdba04c8ffef1735bd6 HEAD -- \
  packages/phoenix apps/server/src/telemetry \
  'docs/evidence/ET-WP-07/*.md' 'docs/evidence/ET-WP-07/**/*.json'
```

## Exact integration and remaining gates

PR #8 stays draft and targets main. Accepted contract head is
`d98a2247bf68338b1a2a5b37449816abc0ab4e7d`, incorporated through accepted main
`77f4940424d15ef079fd1cdba04c8ffef1735bd6` by additive local commit
`0dae7c38f2df5746e17516fc5f1d4744292c27c9`. The production adapter remains
unchanged; stricter tests remove the former blocked-return fallback.
Publication head after committing this note is recorded in PR metadata/handoff.

The narrow GlobalID blocker is closed. Real producer integration, bootstrap/root
activation, live credentials/model, real MAF/provider traces and browser/host/release
acceptance remain separate dependencies. There were zero provider calls/tokens,
no producer shared-contract edits, no force push or hosted merge/deployment.
