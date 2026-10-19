/** Prepared-source tests use explicit synthetic outputs, never provider run evidence. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluate } from '../exercises/07-spec-regression/starter.js';
import type { EvalContext } from '@evals-tutorial/contracts/services';
import { assertContract, type Dataset, type EvalInput, type Tutorial } from '@evals-tutorial/contracts';
import { datasetHash } from '@evals-tutorial/contracts/node';

const root = resolve(import.meta.dirname, '..');
const context = { judge: () => { throw new Error('Code evaluator must never call a judge'); } } as unknown as EvalContext;
const ids = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
const tutorial = JSON.parse(await readFile(resolve(root, 'tutorial.json'), 'utf8')) as Tutorial;
const exercise = tutorial.exercises.find(item => item.id === '07-spec-regression')!;
const dataset = JSON.parse(await readFile(resolve(root, 'datasets/07-spec-regression-v1/1.0.0.json'), 'utf8')) as Dataset;
function inputAt(index: number, output = dataset.examples[index]!.fixtures[0]!.output): EvalInput {
  const row = structuredClone(dataset.examples[index]!);
  return { input: row.input, output: structuredClone(output), expected: row.expected,
    metadata: { ...row.metadata, exampleId: row.id, exerciseId: exercise.id, datasetVersion: dataset.datasetVersion } };
}

async function grade(row: EvalInput) {
  const result = await evaluate(row, context);
  assertContract('EvalResult', result);
  assert.deepEqual(result.criteria?.map(item => item.criterionId), ids);
  for (const item of result.criteria!) {
    assert.ok(item.score === 0 || item.score === 1);
    assert.equal(item.label, item.score === 1 ? 'pass' : 'fail');
    assert.ok(item.explanation.includes(String(row.metadata.exampleId)));
    assert.ok(item.explanation.includes(item.criterionId));
  }
  assert.equal(result.score, result.criteria!.every(item => item.score === 1) ? 1 : 0);
  assert.equal(result.label, result.score === 1 ? 'pass' : 'fail');
  return result;
}

test('guided example preserves travel schemas, three normal cases and one shared dataset identity', async () => {
  assert.equal(exercise.readOnly, true);
  assert.equal(exercise.mode, 'Code');
  assert.deepEqual(exercise.agentVariants, ['baseline', 'omit-fees']);
  assert.deepEqual(exercise.criteria.map(item => item.id), ids);
  const travel = tutorial.exercises.find(item => item.id === '06-simulated-travel')!;
  for (const key of ['inputSchema', 'outputSchema', 'expectedSchema'] as const) assert.deepEqual(exercise[key], travel[key]);
  assert.deepEqual(dataset.examples.map(item => item.id), ['spec-routine', 'spec-fare-choice', 'spec-no-affordable']);
  assert.equal(dataset.contentHash, datasetHash(dataset));
  assert.equal(exercise.datasetHash, dataset.contentHash);
  assert.equal(exercise.starterSource, await readFile(resolve(root, 'exercises/07-spec-regression/starter.ts'), 'utf8'));
  for (const row of dataset.examples) {
    assert.deepEqual(row.metadata.requirementIds, ids);
    assert.equal(typeof row.metadata.title, 'string');
    assert.deepEqual(Object.keys(row.metadata.expectedByRequirement as object), ids);
    // This is author reference material, not an execution receipt or canned agent output.
    assert.equal('criteria' in row.metadata, false);
    assert.equal('output' in row, false);
    for (const fixture of row.fixtures) {
      const result = await grade(inputAt(dataset.examples.indexOf(row), fixture.output));
      assert.deepEqual(fixture.expectedEvaluation.allowedLabels, [result.label]);
      assert.equal(fixture.expectedEvaluation.minScore, result.score);
      for (const evidence of fixture.expectedEvaluation.requiredEvidence) {
        assert.ok(result.explanation.includes(evidence) || result.criteria!.some(item => item.explanation.includes(evidence)));
      }
    }
  }
});

test('each requirement has an independent deterministic assertion', async () => {
  for (const [criterionId, changes] of [
    ['R1', { optionId: 'FL-NOT-SUPPLIED' }],
    ['R2', { departDate: '2027-03-11' }],
    ['R2', { returnDate: '2027-03-14' }],
    ['R3', { totalCents: 28000 }],
    ['R3', { currency: 'EUR' }],
    ['R4', { totalCents: 41000 }],
    ['R5', { status: 'no_options', optionId: null, departDate: null, returnDate: null, totalCents: null }],
    ['R6', { simulated: false }],
    ['R6', { booked: true }],
  ] as const) {
    const row = inputAt(0);
    Object.assign(row.output, changes);
    const result = await grade(row);
    assert.equal(result.criteria!.find(item => item.criterionId === criterionId)!.score, 0, criterionId);
    assert.equal(result.label, 'fail');
  }
});

test('fee omission exposes amount, budget and no-options failures without fabricated provider results', async () => {
  const routine = inputAt(0);
  routine.output.totalCents = 28000;
  const routineResult = await grade(routine);
  assert.deepEqual(routineResult.criteria!.filter(item => item.score === 0).map(item => item.criterionId), ['R3']);
  const choice = await grade(inputAt(1, dataset.examples[1]!.fixtures[1]!.output));
  assert.deepEqual(choice.criteria!.filter(item => item.score === 0).map(item => item.criterionId), ['R3', 'R4']);
  const noAffordable = await grade(inputAt(2, dataset.examples[2]!.fixtures[1]!.output));
  assert.deepEqual(noAffordable.criteria!.filter(item => item.score === 0).map(item => item.criterionId), ['R3', 'R4', 'R5']);
  const contradiction = inputAt(2);
  contradiction.output.optionId = 'FL-OVER-BUDGET';
  assert.equal((await grade(contradiction)).criteria!.find(item => item.criterionId === 'R5')!.score, 0);
});

test('author reference corruption remains an operational error', async () => {
  const row = inputAt(0);
  row.expected.eligibleOptionIds = [];
  await assert.rejects(evaluate(row, context), /Reference mismatch for spec-routine/);
});
