import test from 'node:test';
import assert from 'node:assert/strict';
import type { JudgeBinding } from '@evals-tutorial/contracts/services';
import { createProviderBroker, parseBrokerResponse } from './index.js';

const binding = (changes: Partial<JudgeBinding> = {}): JudgeBinding => ({ runId: 'run-1', exampleId: 'row-1', row: { input: { message: 'synthetic' }, output: { recommendation: 'demo' }, expected: { required: true }, metadata: { exampleId: 'row-1', exerciseId: '04-policy-recommendation', datasetVersion: '1' } }, criterionIds: ['support'], mode: 'Mixed', maxCalls: 2, maxOutputTokens: 128, deadlineEpochMs: Date.now() + 2000, signal: new AbortController().signal, ...changes });
const verdict = { score: 1, label: 'pass', explanation: 'Supported by synthetic evidence.' };
const judge = { rubric: 'Check faithful support.', criterionIds: ['support'] };
test('Code mode and malicious worker-selected routing cannot invoke provider', async () => {
  let calls = 0;
  const broker = createProviderBroker(async () => { calls++; return verdict; });
  await assert.rejects(broker.bind(binding({ mode: 'Code' })).judge(judge));
  const ctx = broker.bind(binding({ runId: 'other' }));
  for (const change of [{ model: 'other' }, { row: {} }, { endpoint: 'https://attacker.invalid' }, { tools: [] }, { criterionIds: ['unknown'] }, { criterionIds: ['support', 'support'] }]) await assert.rejects(ctx.judge({ ...judge, ...change }));
  assert.equal(calls, 0);
});
test('lifetime budget is atomic under concurrency and persists across rebinds', async () => {
  let calls = 0;
  const broker = createProviderBroker(async () => { calls++; return verdict; });
  const row = binding(), ctx = broker.bind(row);
  const outputs = await Promise.allSettled([ctx.judge(judge), ctx.judge(judge), ctx.judge(judge)]);
  assert.equal(outputs.filter(r => r.status === 'fulfilled').length, 2);
  assert.equal(calls, 2);
  await assert.rejects(broker.bind(row).judge(judge));
  assert.throws(() => broker.bind({ ...row, maxCalls: 1 }));
});
test('binding is an immutable row snapshot, preserves reference for judge only', async () => {
  const row = binding(); let captured: unknown;
  const ctx = createProviderBroker(async call => { captured = call.material; return verdict; }).bind(row);
  row.row.expected = { injected: true }; row.row.output = { mutated: true }; row.maxOutputTokens = 2048;
  await ctx.judge(judge);
  assert.deepEqual((captured as { row: JudgeBinding['row'] }).row.expected, { required: true });
  assert.deepEqual((captured as { row: JudgeBinding['row'] }).row.output, { recommendation: 'demo' });
});
test('failed/refused provider attempts consume budget and expose only typed errors', async () => {
  let calls = 0;
  const ctx = createProviderBroker(async () => { calls++; throw Error('secret-private-header'); }).bind(binding({ maxCalls: 1 }));
  await assert.rejects(ctx.judge(judge), (e: unknown) => !(e as Error).message.includes('secret'));
  await assert.rejects(ctx.judge(judge)); assert.equal(calls, 1);
});
test('normalized judge validation rejects malformed, nonfinite and contradictory results', async () => {
  for (const output of [{ score: 0, label: 'pass', explanation: 'Contradiction' }, { score: NaN, label: 'partial', explanation: 'Nonfinite' }, { score: .5, label: 'partial' }, { ...verdict, extra: true }]) {
    const ctx = createProviderBroker(async () => output).bind(binding());
    await assert.rejects(ctx.judge(judge));
  }
});
test('deadline and cancellation finish even when provider ignores abort', async () => {
  const broker = createProviderBroker(async () => new Promise(() => {}));
  await assert.rejects(broker.bind(binding({ deadlineEpochMs: Date.now() + 20 })).judge(judge), (e: unknown) => (e as { detail: { code: string } }).detail.code === 'timeout');
  const controller = new AbortController();
  const result = broker.bind(binding({ runId: 'cancel', signal: controller.signal })).judge(judge);
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(result, (e: unknown) => (e as { detail: { code: string } }).detail.code === 'cancelled');
});
test('host bounds reject token budget, expired deadline and wrong row correlation', async () => {
  const broker = createProviderBroker(async () => verdict);
  for (const changes of [{ maxCalls: 3 }, { maxOutputTokens: 2049 }, { maxOutputTokens: 0 }, { exampleId: 'other' }]) assert.throws(() => broker.bind(binding(changes)));
  await assert.rejects(broker.bind(binding({ deadlineEpochMs: Date.now() - 1 })).judge(judge));
});
test('private response envelope keeps refusal and malformed output separate from scores', () => {
  assert.deepEqual(parseBrokerResponse({ result: verdict }), verdict);
  assert.throws(() => parseBrokerResponse({ error: { code: 'provider_refusal', message: 'Refused.', retryable: false } }));
  for (const value of [{ result: verdict, error: {} }, {}, null, { result: verdict, extra: true }]) assert.throws(() => parseBrokerResponse(value));
});
