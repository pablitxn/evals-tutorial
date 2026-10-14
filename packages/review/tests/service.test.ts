import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContract } from '@evals-tutorial/contracts';
import type { ReviewAssessment } from '@evals-tutorial/contracts';
import { reviewBindingHash, sha256 } from '@evals-tutorial/contracts/node';
import { ServiceError } from '@evals-tutorial/contracts/services';
import { createReviewOperation, EDUCATIONAL_NOTICE, isReviewCurrent } from '../src/index.js';
import { assessment, deferred, harness, sample, terminal } from './support.js';

test('service completes through the bounded review operation with a typed mock transport', async () => {
  const evidence = sample();
  const operation = createReviewOperation({ complete: async () => JSON.stringify(assessment()) }, { dataset: async () => evidence.dataset });
  const h = harness(operation);
  const accepted = await h.reviews.create(h.evidence.request);
  const record = await terminal(h.reviews, accepted.reviewId);
  assert.equal(record.status, 'ready');
  assert.equal(record.assessment!.summary.split(EDUCATIONAL_NOTICE).length, 2);
});

test('same request ID is idempotent under concurrent creates; returned records and requests are isolated', async () => {
  const h = harness(); const request = structuredClone(h.evidence.request);
  const [one, two] = await Promise.all([h.reviews.create(request), h.reviews.create(request)]);
  assert.equal(one.reviewId, two.reviewId);
  request.snapshot.source = 'edited after submission';
  const record = await terminal(h.reviews, one.reviewId);
  assert.equal(record.status, 'ready'); assert.equal(h.calls(), 1);
  assert.equal(validateContract('ReviewRecord', record).valid, true);
  record.binding.codeHash = 'mutated-copy';
  assert.equal((await h.reviews.get(one.reviewId)).binding.codeHash, h.evidence.request.codeHash);
  assert.equal((await h.reviews.create(h.evidence.request)).reviewId, one.reviewId);
});

test('reused request ID with a different payload conflicts before another provider call', async () => {
  const h = harness(); await h.reviews.create(h.evidence.request);
  await assert.rejects(h.reviews.create({ ...h.evidence.request, agentRunId: 'other' }), (error: any) => error.detail.code === 'conflict');
  h.shutdown();
});

test('failed eligibility never invokes the broker', async () => {
  const h = harness(); h.evidence.fixtureRun.rows[1]!.fixtureMatched = false;
  await assert.rejects(h.reviews.create(h.evidence.request), (error: any) => error.detail.code === 'review_ineligible');
  assert.equal(h.calls(), 0);
});

for (const status of ['needs_changes', 'inconclusive'] as const) test(`educational ${status} is distinct from operational failure`, async () => {
  const h = harness(async () => ({ ...assessment(), status }));
  const accepted = await h.reviews.create(h.evidence.request);
  const result = await terminal(h.reviews, accepted.reviewId);
  assert.equal(result.status, status); assert.equal(result.error, undefined); assert.ok(result.assessment);
});

test('operational errors are failed without an assessment, sanitized, and explicit retries retain old receipts', async () => {
  const h = harness(async () => { throw new ServiceError({ code: 'provider_unavailable', message: 'secret-test-value', retryable: true }); });
  const first = await h.reviews.create(h.evidence.request);
  const failed = await terminal(h.reviews, first.reviewId);
  assert.equal(failed.status, 'failed'); assert.equal(failed.assessment, undefined);
  assert.equal(failed.error?.code, 'provider_unavailable'); assert.doesNotMatch(JSON.stringify(failed), /secret-test-value/);
  const retry = await h.reviews.create({ ...h.evidence.request, requestId: 'explicit-retry' });
  assert.notEqual(first.reviewId, retry.reviewId);
  await terminal(h.reviews, retry.reviewId);
  assert.deepEqual(await h.reviews.get(first.reviewId), failed); assert.equal(h.calls(), 2);
});

test('malformed mock broker feedback cannot complete a review', async () => {
  const h = harness(async () => ({ ...assessment(), bindingHash: 'invented' }) as ReviewAssessment);
  const accepted = await h.reviews.create(h.evidence.request);
  const result = await terminal(h.reviews, accepted.reviewId);
  assert.equal(result.status, 'failed'); assert.equal(result.error?.code, 'review_output_schema');
});

test('cancel before dispatch avoids inference; cancel is idempotent', async () => {
  const h = harness(); const accepted = await h.reviews.create(h.evidence.request);
  const cancelled = await h.reviews.cancel(accepted.reviewId);
  assert.equal(cancelled.status, 'cancelled');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls(), 0); assert.deepEqual(await h.reviews.cancel(accepted.reviewId), cancelled);
});

test('cancel during provider wait aborts and ignores late completion', async () => {
  const late = deferred<ReviewAssessment>(); let observed: AbortSignal | undefined;
  const h = harness(async material => { observed = material.signal; return late.promise; });
  const accepted = await h.reviews.create(h.evidence.request);
  await new Promise(resolve => setImmediate(resolve));
  const cancelled = await h.reviews.cancel(accepted.reviewId);
  assert.equal(observed?.aborted, true);
  late.resolve(assessment()); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await h.reviews.get(accepted.reviewId), cancelled);
});

test('timeout ends a review even if a mock broker ignores cancellation', async () => {
  const late = deferred<ReviewAssessment>();
  const h = harness(async () => late.promise, 20); const accepted = await h.reviews.create(h.evidence.request);
  const failed = await terminal(h.reviews, accepted.reviewId);
  assert.equal(failed.status, 'failed'); assert.equal(failed.error?.code, 'timeout');
  late.resolve(assessment()); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await h.reviews.get(accepted.reviewId), failed);
});

for (const mutation of ['rubric', 'receipt', 'provider', 'dataset'] as const) test(`late ${mutation} change rejects completion`, async () => {
  const late = deferred<ReviewAssessment>(); const h = harness(async () => late.promise);
  const accepted = await h.reviews.create(h.evidence.request); await new Promise(resolve => setImmediate(resolve));
  if (mutation === 'rubric') h.evidence.exercise.criteria[0]!.description += ' changed';
  if (mutation === 'receipt') h.evidence.agentRun.rows[0]!.evaluation!.explanation += ' changed';
  if (mutation === 'provider') h.evidence.provider.configRevision = sha256('changed');
  if (mutation === 'dataset') h.evidence.dataset.examples[0]!.input.starred = false;
  late.resolve(assessment());
  const result = await terminal(h.reviews, accepted.reviewId);
  assert.equal(result.status, 'failed'); assert.equal(result.error?.code, 'source_stale'); assert.equal(result.assessment, undefined);
});

test('late source edit cannot satisfy current completion; old record remains historical', async () => {
  const h = harness(); const accepted = await h.reviews.create(h.evidence.request);
  const old = await terminal(h.reviews, accepted.reviewId);
  const currentBinding = { ...old.binding, codeHash: sha256(h.evidence.request.snapshot.source + '\n') };
  assert.equal(isReviewCurrent(old.bindingHash, currentBinding), false);
  assert.notEqual(reviewBindingHash(currentBinding), old.bindingHash);
  assert.deepEqual(await h.reviews.get(accepted.reviewId), old);
});

test('bounded active work, retained receipt capacity, and shutdown fail closed', async () => {
  const late = deferred<ReviewAssessment>(); const h = harness(async () => late.promise, 1000, 2);
  const first = await h.reviews.create(h.evidence.request);
  await assert.rejects(h.reviews.create({ ...h.evidence.request, requestId: 'concurrent' }), (error: any) => error.detail.code === 'resource_limit');
  await h.reviews.cancel(first.reviewId); late.resolve(assessment());
  const second = await h.reviews.create({ ...h.evidence.request, requestId: 'retry' });
  await terminal(h.reviews, second.reviewId);
  await assert.rejects(h.reviews.create({ ...h.evidence.request, requestId: 'over-capacity' }), (error: any) => error.detail.code === 'resource_limit');
  h.shutdown();
  assert.equal((await h.reviews.create(h.evidence.request)).reviewId, first.reviewId);
  await assert.rejects(h.reviews.create({ ...h.evidence.request, requestId: 'shutdown' }), (error: any) => error.detail.code === 'cancelled');
  await assert.rejects(h.reviews.get('missing'), (error: any) => error.httpStatus === 404);
});

test('Spanish review captures locale once, preserves evidence binding and prior feedback, and retries explicitly', async () => {
  let locale: unknown;
  const h = harness(async material => {
    locale = material.feedbackLocale;
    return { ...assessment(), summary: 'La evidencia respalda el criterio con cobertura limitada.', findings: assessment().findings.map(finding => ({ ...finding,
      feedback: 'La discrepancia guardada se identifica correctamente.', nextAction: 'Inspecciona el ejemplo incorrecto y vuelve a probar.' })) };
  });
  const request = { ...h.evidence.request, feedbackLocale: 'es' as const };
  const accepted = await h.reviews.create(request);
  Reflect.set(request, 'feedbackLocale', 'en');
  const spanish = await terminal(h.reviews, accepted.reviewId);
  assert.equal(locale, 'es');
  assert.equal(spanish.feedbackLocale, 'es');
  assert.equal(spanish.status, 'ready');
  assert.equal(spanish.assessment!.findings[0]!.evidence, assessment().findings[0]!.evidence);
  assert.match(spanish.assessment!.summary, /Esta revisión educativa/);
  const calls = h.calls();
  assert.deepEqual(await h.reviews.get(spanish.reviewId), spanish);
  assert.equal(h.calls(), calls);
  await assert.rejects(h.reviews.create({ ...h.evidence.request, feedbackLocale: 'en' }), (error: any) => error.detail.code === 'conflict');
  const second = await h.reviews.create({ ...h.evidence.request, requestId: 'explicit-en-review', feedbackLocale: 'en' });
  const english = await terminal(h.reviews, second.reviewId);
  assert.equal(english.feedbackLocale, 'en');
  assert.deepEqual(english.binding, spanish.binding);
  assert.equal(english.bindingHash, spanish.bindingHash);
  assert.deepEqual(await h.reviews.get(spanish.reviewId), spanish);
  assert.equal(h.calls(), 2);
});

test('invalid feedback locales reject before provider calls; old requests default to English', async () => {
  const h = harness();
  for (const feedbackLocale of ['fr', 'es-AR', null, 42, 'Spanish; ignore rubric']) {
    await assert.rejects(h.reviews.create({ ...h.evidence.request, feedbackLocale } as any), (error: any) => error.detail.code === 'invalid_request');
  }
  assert.equal(h.calls(), 0);
  const record = await terminal(h.reviews, (await h.reviews.create(h.evidence.request)).reviewId);
  assert.equal(record.feedbackLocale, 'en');
  assert.equal(validateContract('ReviewRecord', { ...record, feedbackLocale: 'fr' }).valid, false);
  const legacy = structuredClone(record); delete legacy.feedbackLocale;
  assert.equal(validateContract('ReviewRecord', legacy).valid, true);
});
