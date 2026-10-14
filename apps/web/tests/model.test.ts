import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceHash, snapshot, runCurrent, fixturesDiscriminate, reviewCurrent, reviewFindingsValid, safeUrl } from '../src/model.js';
import { request, ApiError } from '../src/api.js';
import { loadWork, save, resetStorage } from '../src/storage.js';
import { tutorial, source, status, run, review, dataset } from './mock-data.js';

const exercise = tutorial.exercises[1]!;
const current = snapshot(tutorial, exercise, source);
test('exact UTF-8 source hash and each bound input invalidate current run/review', async () => {
  const hash = await sourceHash(source); const fixture = run(); const agent = run('agent'); const checked = review();
  assert.equal(runCurrent(agent, current, hash, 'baseline', status), true);
  assert.equal(reviewCurrent(checked, current, hash, fixture, agent, 'baseline', status), true);
  assert.notEqual(await sourceHash(source + '\n'), hash);
  for (const changed of [{ source: source + ' ' }, { datasetHash: 'b'.repeat(64) }, { rubricVersion: '2' }, { tutorialVersion: '2' }, { exerciseVersion: '2' }]) {
    assert.equal(runCurrent(agent, { ...current, ...changed }, hash, 'baseline', status), false);
    assert.equal(reviewCurrent(checked, { ...current, ...changed }, hash, fixture, agent, 'baseline', status), false);
  }
  assert.equal(reviewCurrent(checked, current, hash, fixture, { ...agent, runId: 'new-receipt' }, 'baseline', status), false);
  assert.equal(reviewCurrent(checked, current, hash, fixture, agent, 'alternative', status), false);
  assert.equal(reviewCurrent(checked, current, hash, fixture, agent, 'baseline', { ...status, provider: { ...status.provider!, configRevision: 'new-profile' } }), false);
});
test('negative fixture fail is a matching assertion, while partial/missing/mismatched evidence is ineligible', () => {
  assert.equal(fixturesDiscriminate(run(), dataset()), true);
  const fixture = run(); fixture.rows[1]!.fixtureMatched = false;
  assert.equal(fixturesDiscriminate(fixture, dataset()), false);
  assert.equal(fixturesDiscriminate({ ...run(), rows: [] }, dataset()), false);
  assert.equal(fixturesDiscriminate({ ...run(), status: 'partial' }, dataset()), false);
  const allPositive = dataset(); allPositive.examples[0]!.fixtures[1]!.expectedEvaluation.allowedLabels = ['pass'];
  assert.equal(fixturesDiscriminate(run(), allPositive), false);
});
test('operational or malformed review cannot grant educational completion', async () => {
  const hash = await sourceHash(source); const checked = review();
  assert.equal(reviewCurrent({ ...checked, assessment: undefined }, current, hash, run(), run('agent'), 'baseline', status), false);
  assert.equal(reviewFindingsValid(checked, exercise, run(), run('agent')), true);
  checked.assessment!.findings.push({ criterionId: 'invented', exampleIds: ['example-1'], evidence: 'x', feedback: 'y', nextAction: 'z' });
  assert.equal(reviewFindingsValid(checked, exercise, run(), run('agent')), false);
  checked.assessment!.findings[0]!.criterionId = 'criterion'; checked.assessment!.findings[0]!.exampleIds = ['invented-row'];
  assert.equal(reviewFindingsValid(checked, exercise, run(), run('agent')), false);
});
test('verified URL display rejects executable URLs, credentials and guessed empty values', () => {
  assert.equal(safeUrl('javascript:alert(1)'), undefined); assert.equal(safeUrl('data:text/html,x'), undefined);
  assert.equal(safeUrl('https://user:password@example.com/'), undefined); assert.equal(safeUrl(undefined), undefined);
  assert.equal(safeUrl('http://127.0.0.1:6006/actual'), 'http://127.0.0.1:6006/actual');
});
test('response boundary rejects malformed success and preserves typed service failures', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ codeHash: 'bad', valid: true }), { status: 200 });
    await assert.rejects(request('/api/validate', 'ValidationResult', current), /does not match/);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'provider_unavailable', message: 'Synthetic outage', retryable: true } }), { status: 503 });
    await assert.rejects(request('/api/runs', 'AcceptedRun', {}), error => error instanceof ApiError && error.detail.code === 'provider_unavailable');
  } finally { globalThis.fetch = original; }
});
test('version storage/reset retains old source and unrelated application storage; blocked storage fails visibly', () => {
  const values: Record<string, string> = {};
  const storage = new Proxy(values, { get(target, key) {
    if (key === 'setItem') return (k: string, v: string) => { target[k] = v; };
    if (key === 'getItem') return (k: string) => target[k] ?? null;
    if (key === 'removeItem') return (k: string) => { delete target[k]; };
    return target[key as string];
  } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  save('another-application', 'keep'); save(`evals-tutorial:old:${exercise.id}:old`, { source: 'old work' });
  const loaded = loadWork(tutorial, exercise); assert.equal(loaded.work.source, exercise.starterSource); assert.equal(loaded.oldSource, 'old work');
  resetStorage(exercise.id); assert.equal(values['another-application'], '"keep"');
  save('evals-tutorial:other', 'remove'); resetStorage(); assert.deepEqual(values, { 'another-application': '"keep"' });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Blocked storage'); } });
  assert.equal(save('key', 'value'), false); assert.equal(resetStorage(), false);
  assert.equal(loadWork(tutorial, exercise).work.source, exercise.starterSource);
});
