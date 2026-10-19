# Educational review adapter

`@evals-tutorial/review` contains pure evidence checks and a bounded, nonexecuting
review operation. It has no provider SDK, credentials, source compiler, agent
invocation, tools, shell or network client. ET-WP-05 owns the real shared-profile
transport and attaches the operation to `ProviderBroker.review`:

```ts
const review = createReviewOperation(transport, content);
// transport.complete receives only messages, maxOutputTokens, deadlineEpochMs, signal.
// It must use the configured global profile, honor cancellation and disable tools/retries.
// content.dataset reads the verified stored Dataset, including fixture expectations.
```

The server factory in `apps/server/src/review/index.ts` is
`createReviewServices({ content, runs, broker, provider, timeoutMs?, maxStoredReviews? })`.
It returns `{ reviews, shutdown }`. Inject `reviews` into `TutorialServices.reviews`;
call `shutdown()` with server shutdown. `provider()` returns the non-secret global
`ProviderSummary`. Content reads and provider summaries must never infer. No
additional validation or agent run is launched for a review. Eligibility requires
completed matching stored receipts with no validation/execution errors, all fixture
rows satisfying their positive/negative expectations, complete real-agent rows and
exact agent source/prompt/provider provenance. Valid failing agent scores remain
eligible. This is independent of Phoenix availability.

`deriveReviewBinding` hashes exact source bytes, canonical dataset identity,
rubric teaching context/domain schemas, full fixture and agent receipts (including
agent source/prompt, dependency and runner digests), and global provider revision.
`rubricHash`, `receiptHash` and `isReviewCurrent` are exported for inspection.
The browser must compare the returned binding with its current snapshot immediately
after edits; `ready` counts only for the current binding. Historical records remain
unchanged. The service revalidates stored content/receipts/provider after a reply.
Telemetry changes to full receipts also invalidate a pending review conservatively;
retry explicitly after receipts settle. No rehashing of a mutated receipt is trusted
as a replacement for the original recorded binding.

The operation caps input at 512 KiB, output at 32 KiB/2048 tokens and deadline at
60 seconds, with zero automatic retries. Oversized material fails rather than
silently truncating evidence. The local service admits one active review and keeps
up to 256 receipts; capacity fails explicitly without deleting historical attempts.
Receipts are in memory for this local session and are lost on process restart.
Retry uses a new request ID, creates a separate receipt and may consume tokens.
Cancellation prevents late completion but cannot recover already consumed tokens.

Feedback must cite installed criterion/example IDs and an exact source/result
quote, provide a next action and remain educational. `ready` must cover every
criterion. Output checks reject malformed, ungrounded or accusatory feedback and
add an explicit fallibility notice. Exact quotes establish inspectable anchors;
they do not prove the model's interpretation is correct. No LLM review is proof of
correctness or authorization to send, file or book anything.

The host supplies a bounded catalog of literal source/output/evaluation quotes
alongside the complete original evidence. Only deterministic ASCII quote IDs enter
the provider schema. The private Python transport requires `evidenceQuoteId`,
rejects unknown IDs and model-supplied `evidence`, then resolves each ID to the
unchanged catalog quote before validating the public `ReviewAssessment`. Public
receipts retain exact evidence text. Example correlation, criterion coverage,
input/output bounds and the no-retry policy still apply; a catalog is a selection
aid, never a substitute for the original grounding checks.

Offline verification (root manifest updates belong to ET-INTEGRATOR):

```sh
node --import tsx --test packages/review/tests/*.test.ts
./node_modules/.bin/tsc -p packages/review/tsconfig.json
```

Integrator requests: add `@evals-tutorial/review: 0.1.0` to server dependencies,
activate the review package typecheck/build scripts, include the review tests in
root checks, and supply actual ET-WP-04/05/06 dependency heads/factories for combined
validation. No new third-party dependencies or shared schema changes are needed.
