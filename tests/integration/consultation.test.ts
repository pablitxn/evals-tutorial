import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ServiceStatus, Tutorial } from '@evals-tutorial/contracts';
import { sha256 } from '@evals-tutorial/contracts/node';
import { ServiceError, type ContentService } from '@evals-tutorial/contracts/services';
import { deriveReviewBinding } from '@evals-tutorial/review';
import { createContentService } from '../../apps/server/src/http/content.js';
import { withPreparedConsultation } from '../../apps/server/src/http/consultation.js';
import { runCurrent, snapshot } from '../../apps/web/src/model.js';
import { sample } from '../../packages/review/tests/support.js';

test('served consultation binds actual prepared MAF source without changing datasets',async()=>{
  const base=await createContentService(resolve('content'));
  const integrated=await withPreparedConsultation(base,resolve('.'));
  const original=await base.tutorial();const tutorial=await integrated.tutorial();
  assert.notEqual(original.tutorialVersion,tutorial.tutorialVersion);
  for(const exercise of tutorial.exercises){
    assert.ok(exercise.pythonSource.includes('from agent_framework import Agent'));
    assert.ok(exercise.pythonSource.includes('await agent.run'));
    assert.ok(exercise.pythonSource.includes('# Installed exercise: '+exercise.id));
    assert.notEqual(exercise.exerciseVersion,(await base.exercise(exercise.id)).exerciseVersion);
    assert.deepEqual(await integrated.dataset(exercise.id),await base.dataset(exercise.id));
  }
});

async function writeRuntime(root: string, tutorial: Tutorial, source: string) {
  const sourceFile = 'apps/agents/src/tutorial_agents/maf.py';
  await mkdir(join(root, 'apps/agents/src/tutorial_agents'), { recursive: true });
  await mkdir(join(root, 'content'), { recursive: true });
  await writeFile(join(root, sourceFile), source);
  const sourceHash = sha256(Buffer.concat([Buffer.from('maf.py\0'), Buffer.from(source)]));
  await writeFile(join(root, 'content/consultation-sources.json'), JSON.stringify({
    sourceFile, sourceFileHash: sha256(source), sources: Object.fromEntries(tutorial.exercises.map(exercise =>
      [exercise.id, { pythonSource: source, sourceHash }])),
  }));
}

test('runtime changes invalidate saved run and review eligibility without changing reference material', async t => {
  const root = await mkdtemp(join(tmpdir(), 'et-consultation-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = await createContentService(resolve('content'));
  const original = await base.tutorial(), evidence = sample();
  original.tutorialVersion = evidence.tutorialVersion;
  original.exercises = original.exercises.map(exercise => exercise.id === evidence.exercise.id ? structuredClone(evidence.exercise) : exercise);
  const content: ContentService = { ...base, tutorial: async () => structuredClone(original),
    dataset: async id => id === evidence.exercise.id ? structuredClone(evidence.dataset) : base.dataset(id) };
  await writeRuntime(root, original, '# Synthetic prepared runtime before the prompt change.\n');
  const before = await withPreparedConsultation(content, root), first = await before.tutorial();
  const repeated = await (await withPreparedConsultation(content, root)).tutorial();
  assert.deepEqual(repeated, first, 'Unchanged runtime keeps stable saved-work versions');
  evidence.tutorialVersion = first.tutorialVersion;
  evidence.exercise = await before.exercise(evidence.exercise.id);
  const previous = snapshot(first, evidence.exercise, evidence.request.snapshot.source);
  evidence.request.snapshot = structuredClone(previous);
  evidence.fixtureRun.request.snapshot = structuredClone(previous);
  evidence.agentRun.request.snapshot = structuredClone(previous);
  const status = { provider: evidence.provider } as ServiceStatus;
  assert.equal(runCurrent(evidence.agentRun, previous, evidence.request.codeHash, 'baseline', status), true);
  assert.doesNotThrow(() => deriveReviewBinding(evidence));

  await writeRuntime(root, original, '# Synthetic prepared runtime after the prompt change.\n');
  const after = await withPreparedConsultation(content, root), second = await after.tutorial();
  const changedExercise = await after.exercise(evidence.exercise.id);
  const current = snapshot(second, changedExercise, previous.source);
  assert.notEqual(first.tutorialVersion, second.tutorialVersion);
  assert.notEqual(evidence.exercise.exerciseVersion, changedExercise.exerciseVersion);
  assert.equal(changedExercise.rubricVersion, evidence.exercise.rubricVersion);
  assert.deepEqual(changedExercise.criteria, evidence.exercise.criteria);
  assert.deepEqual(await after.dataset(evidence.exercise.id), await before.dataset(evidence.exercise.id));
  assert.equal(runCurrent(evidence.agentRun, current, evidence.request.codeHash, 'baseline', status), false);
  const updated = { ...evidence, tutorialVersion: second.tutorialVersion, exercise: changedExercise };
  const ineligible = (error: unknown) => error instanceof ServiceError && error.detail.code === 'review_ineligible';
  assert.throws(() => deriveReviewBinding(updated), ineligible, 'An old review request is stale');
  assert.throws(() => deriveReviewBinding({ ...updated, request: { ...evidence.request, snapshot: current } }), ineligible,
    'A current request cannot relabel old fixture and agent receipts');
  assert.deepEqual(evidence.agentRun.request.snapshot, previous, 'Historical receipts remain unchanged');
});

test('runtime versions retain full base-version identity within the contract length bound', async t => {
  const root = await mkdtemp(join(tmpdir(), 'et-consultation-version-bound-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = await createContentService(resolve('content')), original = await base.tutorial();
  original.tutorialVersion = 'a'.repeat(64);
  for (const exercise of original.exercises) exercise.exerciseVersion = 'a'.repeat(64);
  const content: ContentService = { ...base, tutorial: async () => structuredClone(original) };
  await writeRuntime(root, original, '# Stable synthetic prepared runtime.\n');
  const first = await (await withPreparedConsultation(content, root)).tutorial();
  original.tutorialVersion = 'a'.repeat(63) + 'b';
  for (const exercise of original.exercises) exercise.exerciseVersion = original.tutorialVersion;
  const second = await (await withPreparedConsultation(content, root)).tutorial();
  assert.ok(first.tutorialVersion.length <= 64 && second.tutorialVersion.length <= 64);
  assert.notEqual(first.tutorialVersion, second.tutorialVersion);
  for (const exercise of second.exercises) {
    assert.ok(exercise.exerciseVersion.length <= 64);
    assert.notEqual(exercise.exerciseVersion, first.exercises.find(item => item.id === exercise.id)!.exerciseVersion);
  }
});
