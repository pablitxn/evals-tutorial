import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateContract, type AgentRequest, type Dataset, type EvalResult, type Exercise, type RunRequest, type RunRecord, type JudgeRpcRequest, type JudgeRpcResponse } from '@evals-tutorial/contracts';
import { datasetHash, sha256 } from '@evals-tutorial/contracts/node';
import { ServiceError, type ContentService, type JudgeBroker } from '@evals-tutorial/contracts/services';
import type { IsolatedExecutor, EvaluationJob } from '@evals-tutorial/evaluator-runtime';
import { createRunnerServices, type RunnerServiceOptions } from './index.js';
import { evaluateRow } from '../runner/index.js';
import { createProviderBroker } from '../judge-broker/index.js';
import { DockerExecutor } from '@evals-tutorial/evaluator-runtime';

const success = { score: 1, label: 'pass' as const, explanation: 'synthetic evidence' };
const failure = { score: 0, label: 'fail' as const, explanation: 'synthetic evidence' };
const imageDigest = 'sha256:' + 'a'.repeat(64);
const repositoryRevision = 'b'.repeat(40);
const dependencyLockHash = 'c'.repeat(64);
const pause = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));
const matches = (code: string) => (error: unknown) => error instanceof ServiceError && error.detail.code === code;
const dataset: Dataset = { schemaVersion: '1.0.0', datasetId: 'synthetic-data', datasetVersion: '1', contentHash: '', documentManifestRef: null, examples: [0, 1, 2].map(n => ({ id: 'example-' + n, input: { value: n }, expected: { correct: true }, metadata: {}, fixtures: [{ id: 'correct', output: { correct: true }, rationale: 'synthetic happy path', expectedEvaluation: { allowedLabels: ['pass'], minScore: 1, maxScore: 1, requiredEvidence: ['evidence'] } }, { id: 'incorrect', output: { correct: false }, rationale: 'synthetic negative path', expectedEvaluation: { allowedLabels: ['fail'], minScore: 0, maxScore: 0, requiredEvidence: ['evidence'] } }] })) };
dataset.contentHash = datasetHash(dataset);
const exercise: Exercise = { id: '01-starred-classifier', title: 'Synthetic test', exerciseVersion: '1', rubricVersion: '1', mode: 'Code', readOnly: false, lessonMarkdown: 'Synthetic', starterSource: 'synthetic source', pythonSource: 'synthetic source', datasetId: dataset.datasetId, datasetVersion: dataset.datasetVersion, datasetHash: dataset.contentHash, criteria: [{ id: 'correct', description: 'Synthetic criterion', mode: 'Code' }], agentVariants: ['prepared'], defaultAgentVariant: 'prepared', maxJudgeCallsPerRow: 0, inputSchema: { type: 'object' }, outputSchema: { type: 'object', required: ['correct'] }, expectedSchema: { type: 'object' }, officialDocs: [{ title: 'Official TypeScript', url: 'https://www.typescriptlang.org/' }] };
const content: ContentService = { tutorial: async () => ({ schemaVersion: '1.0.0', tutorialVersion: '1', title: 'Synthetic', exercises: [exercise] }), dataset: async () => structuredClone(dataset), exercise: async () => structuredClone(exercise), document: async () => { throw new Error('No documents in mock'); } };
const request = (id: string, source = 'synthetic source', mode: RunRequest['mode'] = 'fixtures'): RunRequest => ({ requestId: id, mode, agentVariant: 'prepared', snapshot: { tutorialVersion: '1', exerciseId: exercise.id, exerciseVersion: '1', rubricVersion: '1', datasetId: dataset.datasetId, datasetVersion: dataset.datasetVersion, datasetHash: dataset.contentHash, source } });
class MockExecutor implements IsolatedExecutor {
  readonly imageDigest = imageDigest;
  active = 0; peak = 0; compilations = 0; paid = 0;
  available = async () => {};
  compile = async (source: string) => {
    this.compilations++;
    return { codeHash: sha256(source), valid: source !== 'invalid source', diagnostics: source === 'invalid source' ? [{ file: 'evaluator.ts' as const, line: 2, column: 3, code: '2322', severity: 'error' as const, message: 'Synthetic type error' }] : [], javascript: 'explicit mock artifact' };
  };
  evaluate = async (job: EvaluationJob, _judge: (request: JudgeRpcRequest) => Promise<JudgeRpcResponse>, signal?: AbortSignal): Promise<EvalResult> => {
    this.active++; this.peak = Math.max(this.peak, this.active);
    try { await pause(15); if (signal?.aborted) throw new ServiceError({ code: 'cancelled', message: 'Mock cancelled', retryable: false }); return job.row.output.correct ? success : failure; }
    finally { this.active--; }
  };
  shutdown = async () => {};
}
async function setup(overrides: Partial<RunnerServiceOptions> = {}) {
  const executor = new MockExecutor();
  const directory = await mkdtemp(join(tmpdir(), 'et-wp06-receipts-'));
  const options = { content, imageDigest, repositoryRevision, dependencyLockHash, receiptDirectory: directory, executor, ...overrides };
  return { ...createRunnerServices(options), executor, directory, options };
}
async function finished(runs: ReturnType<typeof createRunnerServices>['runs'], runId: string): Promise<RunRecord> {
  for (let i = 0; i < 400; i++) { const record = await runs.get(runId); if (['invalid', 'cancelled', 'completed', 'partial', 'failed', 'timed_out'].includes(record.status)) return record; await pause(); }
  throw new Error('Mock run did not terminate');
}

test('mocked run orchestration preserves snapshots, idempotency and fixture truth', async () => {
  const { runs, executor, directory, options } = await setup();
  const original = request('idempotent');
  const [first, second] = await Promise.all([runs.create(original), runs.create(structuredClone(original))]);
  assert.equal(first.runId, second.runId);
  original.snapshot.source += ' edited after submit';
  const complete = await finished(runs, first.runId);
  assert.equal(complete.status, 'completed');
  assert.equal(complete.codeHash, sha256('synthetic source'));
  assert.equal(complete.completedRows, 6); assert.equal(executor.peak, 2); assert.equal(executor.compilations, 1);
  assert(complete.rows.every(row => row.fixtureMatched));
  assert(complete.rows.some(row => row.evaluation?.label === 'fail' && row.status === 'completed'));
  assert(validateContract('RunRecord', complete).valid);
  await assert.rejects(runs.create(original), matches('conflict'));
  complete.request.snapshot.source = 'external mutation'; complete.rows.length = 0;
  assert.equal((await runs.get(first.runId)).rows.length, 6);
  const files = await readdir(directory); const oldBytes = await readFile(join(directory, files[0]!), 'utf8');
  await runs.cancel(first.runId); assert.equal(await readFile(join(directory, files[0]!), 'utf8'), oldBytes);
  await runs.shutdown();
  const restored = createRunnerServices({ ...options, executor: new MockExecutor() });
  assert.equal((await restored.runs.create(request('idempotent'))).runId, first.runId);
  assert.equal((await restored.runs.get(first.runId)).status, 'completed');
  await restored.runs.shutdown();
});

test('syntax errors, stale binding and missing isolation precede all provider calls', async () => {
  let calls = 0;
  const agent = { invoke: async () => { calls++; throw new Error('Must not call provider'); } };
  const { runs, executor } = await setup({ agent });
  const invalid = await runs.create(request('invalid', 'invalid source', 'agent'));
  assert.equal((await finished(runs, invalid.runId)).status, 'invalid'); assert.equal(calls, 0);
  const stale = request('stale'); stale.snapshot.datasetVersion = '2';
  await assert.rejects(runs.create(stale), matches('source_stale'));
  executor.available = async () => { throw new ServiceError({ code: 'isolation_unavailable', message: 'Explicit unavailable isolation mock', retryable: true }); };
  const unavailable = await runs.create(request('unavailable', 'synthetic source', 'agent'));
  assert.equal((await finished(runs, unavailable.runId)).error?.code, 'isolation_unavailable'); assert.equal(calls, 0);
  await runs.shutdown();
});

test('wrong fixture verdict differs from evaluator execution failure', async () => {
  const { runs, executor } = await setup();
  executor.evaluate = async () => success;
  const wrong = await runs.create(request('wrong-fixture'));
  const wrongRecord = await finished(runs, wrong.runId);
  assert.equal(wrongRecord.status, 'completed'); assert(wrongRecord.rows.some(row => row.fixtureMatched === false));
  executor.evaluate = async () => { throw new ServiceError({ code: 'runtime_error', message: 'Explicit mock exception', retryable: false }); };
  const failed = await runs.create(request('execution-failure'));
  const failedRecord = await finished(runs, failed.runId);
  assert.equal(failedRecord.status, 'failed'); assert(failedRecord.rows.every(row => !row.evaluation && row.error?.code === 'runtime_error'));
  await runs.shutdown();
});

test('prepared final example rejects incomplete, duplicated and contradictory requirement evidence', async () => {
  const prepared: Exercise = { ...exercise, id: '07-spec-regression', readOnly: true,
    criteria: Array.from({ length: 6 }, (_, i) => ({ id: `R${i + 1}`, description: 'Prepared requirement', mode: 'Code' })) };
  const preparedContent: ContentService = { ...content, exercise: async () => prepared };
  const { runs, executor } = await setup({ content: preparedContent });
  const criteria = prepared.criteria.map(item => ({ criterionId: item.id, ...success }));
  const variants: EvalResult[] = [success,
    { ...success, criteria: criteria.slice(1) },
    { ...success, criteria: [criteria[0]!, ...criteria.slice(0, 5)] },
    { ...success, criteria: [{ ...criteria[0]!, ...failure }, ...criteria.slice(1)] },
    { ...success, criteria }];
  for (const [i, result] of variants.entries()) {
    executor.evaluate = async () => structuredClone(result);
    const submitted = request(`requirement-${i}`);
    submitted.snapshot.exerciseId = prepared.id;
    const receipt = await finished(runs, (await runs.create(submitted)).runId);
    assert.equal(receipt.status, i === variants.length - 1 ? 'completed' : 'failed');
    if (receipt.status === 'failed') assert(receipt.rows.every(row => !row.evaluation && row.error?.code === 'protocol_error'));
    else assert.equal(receipt.rows[0]!.evaluation?.criteria?.length, 6);
  }
  const edited = request('prepared-edit', 'edited source'); edited.snapshot.exerciseId = prepared.id;
  await assert.rejects(runs.create(edited), matches('source_stale'));
  await runs.shutdown();
});

test('agent sees no references/fixtures/source; malformed response has no score', async () => {
  const received: AgentRequest[] = [];
  const traceparent = '00-' + 'f'.repeat(32) + '-' + 'e'.repeat(16) + '-01';
  const { runs } = await setup({ createTelemetryContext: () => ({ traceparent }), agent: { invoke: async req => { received.push(req); return { schemaVersion: '1.0.0', runId: req.runId, exampleId: req.exampleId, status: 'completed', output: { correct: true }, agentVersion: '1', sourceHash: 'd'.repeat(64), promptHash: 'e'.repeat(64), traceId: 'f'.repeat(32), durationMs: 1 }; } } });
  const run = await runs.create(request('agent', 'synthetic source', 'agent'));
  const record = await finished(runs, run.runId); assert.equal(record.status, 'completed');
  assert.equal(record.provenance.agentVersion, '1');
  assert(record.rows.every(row => row.phoenix?.traceId === 'f'.repeat(32)));
  assert(received.every(item => item.traceparent === traceparent));
  for (const item of received) { assert(!('expected' in item)); assert(!('source' in item)); assert(!('fixtures' in item)); assert(validateContract('AgentRequest', item).valid); }
  await runs.shutdown();
  const malformed = await setup({ agent: { invoke: async req => ({ schemaVersion: '1.0.0', runId: req.runId, exampleId: req.exampleId, status: 'completed', output: {}, agentVersion: '1', sourceHash: 'd'.repeat(64), promptHash: 'e'.repeat(64), durationMs: 1 }) } });
  const invalid = await malformed.runs.create(request('malformed', 'synthetic source', 'agent'));
  const invalidRecord = await finished(malformed.runs, invalid.runId);
  assert(invalidRecord.rows.every(row => row.error?.code === 'agent_output_schema' && !row.evaluation)); await malformed.runs.shutdown();
});

test('one active run, queued cancellation, bounded capacity and ignored late provider replies', async () => {
  let resolveLate: ((value: never) => void) | undefined;
  let calls = 0;
  const { runs, executor } = await setup({ maxRetainedRuns: 3, agent: { invoke: async () => { calls++; return new Promise<never>(resolve => { resolveLate = resolve; }); } } });
  const active = await runs.create(request('active', 'synthetic source', 'agent'));
  while (calls === 0) await pause();
  const queued = await runs.create(request('queued'));
  assert.equal((await runs.get(queued.runId)).status, 'queued'); assert.equal(executor.compilations, 1);
  assert.equal((await runs.cancel(queued.runId)).status, 'cancelled');
  await runs.cancel(active.runId);
  const cancelled = await finished(runs, active.runId); assert.equal(cancelled.status, 'cancelled');
  const bytes = JSON.stringify(cancelled);
  resolveLate?.({} as never); await pause(30);
  assert.equal(JSON.stringify(await runs.get(active.runId)), bytes);
  await runs.create(request('third'));
  await assert.rejects(runs.create(request('fourth')), matches('resource_limit'));
  await runs.shutdown();
});

test('run timeout is operational and unfinished rows remain in the receipt', async () => {
  const { runs } = await setup({ runTimeoutMs: 30, agent: { invoke: async () => new Promise(() => {}) } });
  const run = await runs.create(request('timeout', 'synthetic source', 'agent'));
  const record = await finished(runs, run.runId);
  assert.equal(record.status, 'timed_out'); assert.equal(record.rows.length, record.totalRows); assert.equal(record.completedRows, 0);
  assert(record.rows.every(row => row.status === 'timed_out' && !row.evaluation)); await runs.shutdown();
});

test('validation rejects concurrent compiles before allocating another isolated worker', async () => {
  const { validation, runs, executor } = await setup();
  let release: () => void = () => {};
  executor.compile = async source => { await new Promise<void>(resolve => { release = resolve; }); return { codeHash: sha256(source), valid: true, diagnostics: [], javascript: 'explicit mock' }; };
  const first = validation.validate(request('compiler').snapshot);
  await assert.rejects(validation.validate(request('duplicate-compiler').snapshot), matches('resource_limit'));
  release(); assert.equal((await first).valid, true); await runs.shutdown();
});

test('host judge rejects binding abuse, Code mode, unknown criteria and exhausted budget', async () => {
  const executor = new MockExecutor();
  const row = { input: {}, output: {}, expected: {}, metadata: { exampleId: 'example', exerciseId: exercise.id, datasetVersion: '1' } };
  let brokerCalls = 0;
  const broker: JudgeBroker = { bind: binding => { assert.equal(binding.maxOutputTokens, 2048); return { judge: async () => { brokerCalls++; return success; } }; } };
  const mixed: Exercise = { ...exercise, mode: 'Mixed', maxJudgeCallsPerRow: 2, criteria: [{ id: 'correct', mode: 'LLM Judge', description: 'Synthetic judge' }] };
  const rpc = (id: string, patch = {}): JudgeRpcRequest => ({ schemaVersion: '1.0.0', type: 'judge.request', id, runId: 'bound-run', exampleId: 'example', request: { rubric: 'Synthetic rubric', criterionIds: ['correct'] }, ...patch });
  let responses: JudgeRpcResponse[] = [];
  executor.evaluate = async (_job, judge) => { responses = []; for (const frame of [rpc('1', { runId: 'wrong-run' }), rpc('2'), rpc('3'), rpc('4')]) responses.push(await judge(frame)); return success; };
  await evaluateRow(executor, 'mock', 'bound-run', row, mixed, broker, new AbortController().signal, Date.now() + 1000);
  assert.equal(responses[0]!.error?.code, 'protocol_error'); assert.equal(responses[3]!.error?.code, 'budget_exceeded'); assert.equal(brokerCalls, 2);
  executor.evaluate = async (_job, judge) => { responses = [await judge(rpc('1'))]; return success; };
  await evaluateRow(executor, 'mock', 'bound-run', row, exercise, broker, new AbortController().signal, Date.now() + 1000);
  assert.equal(responses[0]!.error?.code, 'budget_exceeded'); assert.equal(brokerCalls, 2);
  executor.evaluate = async (_job, judge) => { responses = [await judge(rpc('1', { request: { rubric: 'Synthetic', criterionIds: ['unknown'] } }))]; return success; };
  await evaluateRow(executor, 'mock', 'bound-run', row, mixed, broker, new AbortController().signal, Date.now() + 1000);
  assert.equal(responses[0]!.error?.code, 'invalid_request'); assert.equal(brokerCalls, 2);
});

test('mixed fixture runs bind each installed fixture while worker RPC cannot select its scope', async () => {
  const mixed: Exercise = { ...exercise, mode: 'Mixed', maxJudgeCallsPerRow: 2, criteria: [{ id: 'correct', mode: 'LLM Judge', description: 'Synthetic judge' }] };
  const judged: Array<{ correct: boolean }> = [];
  const broker = createProviderBroker(async call => {
    const output = (call.material as { row: { output: { correct: boolean } } }).row.output;
    judged.push(output);
    return output.correct ? success : failure;
  });
  const { runs, executor } = await setup({ content: { ...content, exercise: async () => mixed }, judge: broker });
  executor.evaluate = async (job, judge) => {
    assert(!('fixtureId' in job));
    assert(!('fixtureId' in job.row.metadata));
    const rpc = (id: string, patch = {}): JudgeRpcRequest => ({ schemaVersion: '1.0.0', type: 'judge.request', id, runId: job.runId, exampleId: job.row.metadata.exampleId, request: { rubric: 'Synthetic rubric', criterionIds: ['correct'] }, ...patch });
    assert.equal((await judge(rpc('spoofed-fixture', { fixtureId: 'other-fixture' }))).error?.code, 'protocol_error');
    assert.equal((await judge(rpc('spoofed-example', { exampleId: 'other-example' }))).error?.code, 'protocol_error');
    const first = await judge(rpc('first'));
    assert(first.result);
    assert.equal((await judge(rpc('first'))).error?.code, 'protocol_error');
    assert((await judge(rpc('second'))).result);
    assert.equal((await judge(rpc('third'))).error?.code, 'budget_exceeded');
    return first.result;
  };
  try {
    const accepted = await runs.create(request('mixed-fixtures'));
    const record = await finished(runs, accepted.runId);
    assert.equal(record.status, 'completed', JSON.stringify(record));
    assert.equal(record.completedRows, 6);
    assert(record.rows.every(row => row.fixtureMatched));
    assert.equal(judged.length, 12);
    assert.equal(judged.filter(output => output.correct).length, 6);
  } finally { await runs.shutdown(); }
});

test('actual Docker RunService validates before mocked paid calls and records real fixture verdicts', { skip: !process.env.ET_RUNNER_IMAGE, timeout: 60000 }, async () => {
  const actualImage = process.env.ET_RUNNER_IMAGE!;
  const executor = new DockerExecutor({ dockerHost: process.env.ET_RUNNER_DOCKER_HOST, imageDigest: actualImage });
  let agentCalls = 0;
  const { runs } = await setup({ imageDigest: actualImage, executor, agent: { invoke: async () => { agentCalls++; throw new Error('No real provider is permitted in this test'); } } });
  const invalid = await runs.create(request('real-validation', 'export async function evaluate( {', 'agent'));
  let record: RunRecord;
  for (;;) { record = await runs.get(invalid.runId); if (record.status === 'invalid') break; assert(!['failed', 'cancelled'].includes(record.status), JSON.stringify(record)); await pause(20); }
  assert.equal(agentCalls, 0); assert(record.diagnostics.some(item => item.line >= 1 && item.column >= 1));
  const ts = `import type { EvalInput, EvalResult } from '@evals-tutorial/contracts';\nimport type { EvalContext } from '@evals-tutorial/contracts/services';\nexport async function evaluate(row: EvalInput, ctx: EvalContext): Promise<EvalResult> { const correct = row.output.correct === true; return {score:correct?1:0,label:correct?'pass':'fail',explanation:'synthetic evidence'}; }`;
  const accepted = await runs.create(request('actual-fixtures', ts));
  for (;;) { record = await runs.get(accepted.runId); if (['completed', 'failed', 'partial'].includes(record.status)) break; await pause(20); }
  assert.equal(record.status, 'completed', JSON.stringify(record)); assert(record.rows.every(item => item.fixtureMatched)); assert.equal(record.provenance.runnerImageDigest, actualImage); assert.equal(record.codeHash, sha256(ts));
  if (process.env.ET_RUN_EVIDENCE) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(process.env.ET_RUN_EVIDENCE, JSON.stringify(record, null, 2) + '\n');
  }
  const forever = await runs.create(request('actual-cancel', ts.replace("const correct = row.output.correct === true;", 'while (true) {} const correct = row.output.correct === true;')));
  while ((await runs.get(forever.runId)).status !== 'running') await pause(20);
  await runs.cancel(forever.runId);
  for (;;) { record = await runs.get(forever.runId); if (record.status === 'cancelled') break; await pause(20); }
  assert.equal(record.rows.length, record.totalRows); assert(record.rows.every(item => item.status === 'cancelled' && !item.evaluation));
  await runs.shutdown();
});
