# ET-WP-11 raw log formatting correction

Date: 2026-10-14. Additive correction to
[the first localization receipt](20261014-01-i18n.md), frozen in
`e1f41b403327baf1f2d7def72696e00bc592fd25`.

The first receipt's `git diff --check` success applies to the source changes before
new raw console logs were staged. The staged full diff then reported trailing
spaces and terminal blank lines in the frozen Turbo build/type and contract logs.
The command runner continued to commit/push after that nonzero formatting check;
this was an integration preflight error. No test, build, typecheck or contract
failure was ignored. The published logs and first receipt remain unchanged.

`git diff --check origin/main -- . ':!docs/evidence/ET-WP-11/*.txt'` passes.
The unrestricted comparison against the original base reports only those raw
console-output whitespace warnings. They are an explicitly documented evidence
formatting exception, not a clean full-diff result. New authored source and prose
have no whitespace defects. Raw logs are preserved rather than normalized after
publication; these warnings do not alter their test evidence or executable behavior.
