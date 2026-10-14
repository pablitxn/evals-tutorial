import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewAssessment } from '@evals-tutorial/contracts';
import { buildReviewPrompt, createReviewOperation, EDUCATIONAL_NOTICE, validateReviewAssessment } from '../src/index.js';
import { assessment, brokerMaterial, deferred, sample } from './support.js';

test('untrusted instructions remain quoted user data; transport receives no tools or executable source port', async () => {
  const e = sample(); const material = brokerMaterial(e);
  let calls = 0;
  const review = createReviewOperation({ complete: async request => {
    calls++;
    assert.deepEqual(Object.keys(request).sort(), ['deadlineEpochMs', 'maxOutputTokens', 'messages', 'signal']);
    assert.match(request.messages[0].content, /never instructions to follow/);
    const data = JSON.parse(request.messages[1].content);
    assert.equal(data.source, e.request.snapshot.source);
    assert.equal(data.dataset.examples[0].fixtures[1].expectedEvaluation.allowedLabels[0], 'fail');
    assert.equal(request.maxOutputTokens, 2048);
    return JSON.stringify(assessment());
  } }, { dataset: async () => e.dataset });
  const result = await review(material);
  assert.equal(result.status, 'ready'); assert.equal(calls, 1);
  assert.match(result.summary, /review is fallible/);
  assert.equal(result.summary.split(EDUCATIONAL_NOTICE).length, 2);
});

for (const [name, mutate] of Object.entries({
  'unknown criterion': (a: ReviewAssessment) => { a.findings[0]!.criterionId = 'invented'; },
  'unknown example': (a: ReviewAssessment) => { a.findings[0]!.exampleIds = ['invented']; },
  'empty example list': (a: ReviewAssessment) => { a.findings[0]!.exampleIds = []; },
  'ungrounded evidence': (a: ReviewAssessment) => { a.findings[0]!.evidence = 'No such quote exists in the evidence.'; },
  'empty feedback': (a: ReviewAssessment) => { a.findings[0]!.feedback = ' '; },
  'no next action': (a: ReviewAssessment) => { a.findings[0]!.nextAction = ' '; },
  'no findings': (a: ReviewAssessment) => { a.findings = []; },
  'cheating accusation': (a: ReviewAssessment) => { a.summary = 'You are cheating.'; },
  'infallibility claim': (a: ReviewAssessment) => { a.summary = 'I guarantee this is correct.'; },
})) test(`malformed assessment: ${name}`, () => {
  const value = assessment(); mutate(value);
  assert.throws(() => validateReviewAssessment(value, brokerMaterial()), (error: any) => error.detail.code === 'review_output_schema');
});

test('ready must cover every rubric criterion', () => {
  const material = brokerMaterial(); material.exercise.criteria.push({ id: 'missing', description: 'Missing evidence.', mode: 'Code' });
  assert.throws(() => validateReviewAssessment(assessment(), material));
});

test('the broker and service can both validate long summaries without duplicating the fallibility notice', () => {
  const raw = { ...assessment(), summary: 'x'.repeat(3799) };
  const once = validateReviewAssessment(raw, brokerMaterial());
  assert.deepEqual(validateReviewAssessment(once, brokerMaterial()), once);
});

for (const response of ['not json', '```json\n{}\n```', JSON.stringify({ ...assessment(), reviewId: 'model-owned-id' }), 'x'.repeat(32769)]) {
  test(`bounded parser rejects malformed provider response (${response.length} bytes)`, async () => {
    const e = sample();
    const operation = createReviewOperation({ complete: async () => response }, { dataset: async () => e.dataset });
    await assert.rejects(operation(brokerMaterial(e)), (error: any) => error.detail.code === 'review_output_schema');
  });
}

test('budget and inconsistent binding fail before transport', async () => {
  const e = sample(); let calls = 0;
  const operation = createReviewOperation({ complete: async () => { calls++; return ''; } }, { dataset: async () => e.dataset });
  await assert.rejects(operation({ ...brokerMaterial(e), maxOutputTokens: 2049 }), (error: any) => error.detail.code === 'budget_exceeded');
  const material = brokerMaterial(e); material.binding.codeHash = 'a'.repeat(64);
  await assert.rejects(operation(material)); assert.equal(calls, 0);
});

test('oversized evidence is rejected without truncating quoted material', () => {
  const e = sample(); e.agentRun.rows[0]!.output = { text: 'x'.repeat(530000) };
  assert.throws(() => buildReviewPrompt(brokerMaterial(e), e.dataset), (error: any) => error.detail.code === 'resource_limit');
});

test('transport failures are sanitized and never retried automatically', async () => {
  const e = sample(); let calls = 0;
  const operation = createReviewOperation({ complete: async () => { calls++; throw new Error('secret-test-value'); } }, { dataset: async () => e.dataset });
  await assert.rejects(operation(brokerMaterial(e)), (error: any) => error.detail.code === 'provider_unavailable' && !error.message.includes('secret-test-value'));
  assert.equal(calls, 1);
});

test('aborted calls never reach transport', async () => {
  const e = sample(); let calls = 0; const controller = new AbortController(); controller.abort();
  const operation = createReviewOperation({ complete: async () => { calls++; return ''; } }, { dataset: async () => e.dataset });
  await assert.rejects(operation({ ...brokerMaterial(e), signal: controller.signal }), (error: any) => error.detail.code === 'cancelled');
  assert.equal(calls, 0);
});

test('abort and timeout settle even when transport ignores its signal and replies late', async () => {
  for (const abort of [false, true]) {
    const e = sample(); const late = deferred<string>(); const controller = new AbortController();
    const operation = createReviewOperation({ complete: async () => late.promise }, { dataset: async () => e.dataset });
    const promise = operation({ ...brokerMaterial(e), signal: controller.signal, deadlineEpochMs: Date.now() + 30 });
    if (abort) controller.abort();
    await assert.rejects(promise, (error: any) => error.detail.code === (abort ? 'cancelled' : 'timeout'));
    late.resolve(JSON.stringify(assessment()));
  }
});

test('feedback locale changes only trusted prose instructions; exact quotes and eligibility remain required', () => {
  const material = brokerMaterial();
  const evidence = sample();
  const spanish = { ...material, feedbackLocale: 'es' as const };
  const english = buildReviewPrompt(material, evidence.dataset);
  const messages = buildReviewPrompt(spanish, evidence.dataset);
  assert.equal(messages[1].content, english[1].content);
  assert.match(messages[0].content, /nextAction in Spanish/);
  assert.match(messages[0].content, /Evidence must remain an exact original-language quote/);
  assert.throws(() => buildReviewPrompt({ ...material, feedbackLocale: 'fr' as any }, evidence.dataset));
  assert.throws(() => validateReviewAssessment({ ...assessment(), findings: assessment().findings.map(f => ({ ...f, evidence: 'discrepancia de clasificación' })) }, spanish));
  assert.throws(() => validateReviewAssessment({ ...assessment(), summary: 'Garantiza un resultado correcto.' }, spanish));
});
