import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { Dataset, EvalInput, EvalResult, Exercise, RunRecord, Tutorial } from '@evals-tutorial/contracts';
import { sha256 } from '@evals-tutorial/contracts/node';
import { comparePreparedRuns, type ComparisonAttempt } from '../src/comparison.js';
import { snapshot } from '../src/model.js';
import { loadWork, save, storageKey } from '../src/storage.js';
import { run, status } from './mock-data.js';

const tutorial = JSON.parse(readFileSync(new URL('../../../content/tutorial.json', import.meta.url), 'utf8')) as Tutorial;
const exercise = tutorial.exercises.find(item => item.id === '07-spec-regression')!;
const dataset = JSON.parse(readFileSync(new URL('../../../content/datasets/07-spec-regression-v1/1.0.0.json', import.meta.url), 'utf8')) as Dataset;
const current = snapshot(tutorial, exercise, exercise.starterSource);
const codeHash = sha256(current.source);
const compiled = ts.transpileModule(exercise.starterSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { evaluate } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`) as { evaluate(row: EvalInput, context: unknown): Promise<EvalResult> };

// These are synthetic mocked agent outputs graded by the real prepared evaluator.
// They are test data only, never presented as actual provider receipts.
async function receipts() {
  const pair: ComparisonAttempt = { id: 'attempt-1', baselineRequestId: 'request-baseline', candidateRequestId: 'request-candidate', baselineRunId: 'baseline-1', candidateRunId: 'candidate-1' };
  const make = async (variant: string): Promise<RunRecord> => {
    const record = run('agent', exercise);
    record.runId = variant === 'baseline' ? pair.baselineRunId! : pair.candidateRunId!;
    record.request = { requestId: variant === 'baseline' ? pair.baselineRequestId : pair.candidateRequestId!, snapshot: current, mode: 'agent', agentVariant: variant };
    record.codeHash = codeHash; record.provenance.codeHash = codeHash; record.provenance.datasetHash = dataset.contentHash;
    record.provenance.agentSourceHash = 'e'.repeat(64); record.provenance.promptHash = (variant === 'baseline' ? 'b' : 'c').repeat(64);
    record.totalRows = record.completedRows = dataset.examples.length;
    record.rows = await Promise.all(dataset.examples.map(async example => {
      const options = example.input.options as Array<Record<string, string | number>>;
      const eligible = (example.expected.eligibleOptionIds as string[]);
      const selected = variant === 'baseline' ? options.find(option => eligible.includes(String(option.id))) : [...options].sort((a, b) => Number(a.fareCents) - Number(b.fareCents))[0];
      const output = { status: selected ? 'recommendation' : 'no_options', optionId: selected?.id ?? null, departDate: selected?.departDate ?? null,
        returnDate: selected?.returnDate ?? null, totalCents: selected ? Number(selected.fareCents) + (variant === 'baseline' ? Number(selected.feesCents) : 0) : null,
        currency: example.input.currency, simulated: true, booked: false };
      const evaluation = await evaluate({ input: example.input, expected: example.expected, output, metadata: { ...example.metadata, exampleId: example.id } } as EvalInput, {});
      return { exampleId: example.id, status: 'completed' as const, output, evaluation };
    }));
    return record;
  };
  const baseline = await make('baseline'); const candidate = await make('omit-fees');
  return { pair, baseline, candidate, compare: () => comparePreparedRuns(pair, baseline, candidate, dataset, current, codeHash, status) };
}

test('real prepared evaluator evidence produces requirement-linked pass to fail regressions from clearly mocked outputs', async () => {
  const { compare, candidate } = await receipts();
  const result = compare();
  assert.equal(result.comparable, true);
  assert.equal(result.rows.length, 3);
  assert.ok(result.rows.every(row => row.regression));
  assert.deepEqual(candidate.rows[1]!.evaluation!.criteria!.filter(criterion => criterion.label === 'fail').map(criterion => criterion.criterionId), ['R3', 'R4']);
});

test('operational errors, cancellation and incomplete rows never become scored regressions', async () => {
  for (const change of [
    (r: RunRecord) => { r.status = 'cancelled'; },
    (r: RunRecord) => { r.error = { code: 'runtime_error', message: 'Synthetic error', retryable: false }; },
    (r: RunRecord) => { r.rows.pop(); },
    (r: RunRecord) => { r.rows[0]!.status = 'failed'; delete r.rows[0]!.evaluation; },
    (r: RunRecord) => { delete r.rows[0]!.evaluation!.criteria; },
    (r: RunRecord) => { r.rows[0]!.evaluation!.criteria![0]!.label = 'partial'; },
    (r: RunRecord) => { r.rows[0]!.evaluation!.label = 'pass'; r.rows[0]!.evaluation!.score = 1; },
  ]) {
    const { candidate, compare } = await receipts(); change(candidate);
    const result = compare(); assert.equal(result.comparable, false);
    if (result.rows.length) { assert.equal(result.rows[0]!.compared, false); assert.equal(result.rows[0]!.regression, false); }
  }
});

test('comparison refuses mismatched source, data, variants, mode, provider, config and execution provenance', async () => {
  const changes: Array<(r: RunRecord) => void> = [
    r => { r.request.snapshot = { ...r.request.snapshot, source: 'different' }; },
    r => { r.request.snapshot = { ...r.request.snapshot, datasetHash: 'f'.repeat(64) }; },
    r => { r.codeHash = 'e'.repeat(64); },
    r => { r.request.agentVariant = 'baseline'; },
    r => { r.request.mode = 'fixtures'; },
    r => { r.provenance.provider = { ...r.provenance.provider!, model: 'different' }; },
    r => { r.provenance.provider = { ...r.provenance.provider!, configRevision: 'f'.repeat(64) }; },
    r => { r.provenance.repositoryRevision = 'f'.repeat(40); },
    r => { delete r.provenance.agentVersion; },
    r => { delete r.provenance.agentSourceHash; },
    r => { r.provenance.agentSourceHash = 'f'.repeat(64); },
    r => { delete r.provenance.promptHash; },
    r => { r.provenance.dependencyLockHash = 'f'.repeat(64); },
    r => { r.provenance.runnerImageDigest = `sha256:${'f'.repeat(64)}`; },
    r => { r.rows[1]!.exampleId = r.rows[0]!.exampleId; },
  ];
  for (const change of changes) { const { candidate, compare } = await receipts(); change(candidate); assert.equal(compare().comparable, false); assert.equal(compare().rows.length, 0); }
});

test('repeat attempts cannot reuse the prior candidate or unrelated receipts', async () => {
  const { pair, baseline, candidate } = await receipts();
  const next = { id: 'attempt-2', baselineRequestId: 'baseline-request-2', baselineRunId: 'baseline-2' };
  assert.equal(comparePreparedRuns(next, baseline, candidate, dataset, current, codeHash, status).comparable, false);
  assert.equal(comparePreparedRuns(pair, baseline, undefined, dataset, current, codeHash, status).comparable, false);
  assert.equal(comparePreparedRuns({ ...pair, candidateRequestId: 'unrelated' }, baseline, candidate, dataset, current, codeHash, status).comparable, false);
  assert.equal(comparePreparedRuns(pair, baseline, candidate, dataset, current, codeHash, { ...status, provider: { ...status.provider!, configRevision: 'e'.repeat(64) } }).comparable, false);
});

test('comparison pair identities persist independently of locale and reject malformed storage', () => {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (key: string, value: string) => values.set(key, value), getItem: (key: string) => values.get(key) ?? null } });
  try {
    const work = loadWork(tutorial, exercise).work;
    const comparison = { id: 'attempt-1', baselineRequestId: 'request-1', baselineRunId: 'run-1', candidateRequestId: 'request-2', candidateRunId: 'run-2' };
    save(storageKey(tutorial, exercise), { ...work, comparison });
    save('evals-tutorial:locale', 'es');
    assert.deepEqual(loadWork(tutorial, exercise).work.comparison, comparison);
    save(storageKey(tutorial, exercise), { ...work, comparison: { ...comparison, candidateRunId: '../../bad' } });
    assert.equal(loadWork(tutorial, exercise).work.comparison, undefined);
  } finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});
