/** Actual isolated evaluation of explicit synthetic agent doubles; no live model evidence. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createContentService } from '../../apps/server/src/http/content.js';
import { withPreparedConsultation } from '../../apps/server/src/http/consultation.js';
import { createRunnerServices } from '../../apps/server/src/runs/index.js';
import { DockerExecutor } from '@evals-tutorial/evaluator-runtime';
import type { RunRecord, RunRequest, ServiceStatus } from '@evals-tutorial/contracts';
import { comparePreparedRuns } from '../../apps/web/src/comparison.js';

test('actual Docker evaluates the fixed requirements for synthetic version doubles on one dataset', { skip: !process.env.ET_RUNNER_IMAGE, timeout: 60000 }, async () => {
  const content = await withPreparedConsultation(await createContentService(resolve('content')), resolve('.'));
  const tutorial = await content.tutorial();
  const exercise = await content.exercise('07-spec-regression');
  const dataset = await content.dataset(exercise.id);
  const provider = { provider: 'openai' as const, model: 'synthetic-test-double', configured: true, configRevision: 'a'.repeat(64) };
  const directory = await mkdtemp(join(tmpdir(), 'spec-isolated-receipts-'));
  const executor = new DockerExecutor({ imageDigest: process.env.ET_RUNNER_IMAGE!, dockerHost: process.env.ET_RUNNER_DOCKER_HOST });
  const { runs } = createRunnerServices({ content, executor, imageDigest: executor.imageDigest,
    repositoryRevision: 'b'.repeat(40), dependencyLockHash: 'c'.repeat(64), provider, receiptDirectory: directory,
    agent: { invoke: async request => {
      assert.equal('expected' in request, false); assert.equal('fixtures' in request, false);
      const example = dataset.examples.find(item => item.id === request.exampleId)!;
      const regressing = request.agentVariant === 'omit-fees';
      // These are explicit author-owned synthetic doubles, not observed model outputs.
      const output = structuredClone(example.fixtures[regressing && example.fixtures.length > 1 ? 1 : 0]!.output);
      if (regressing && example.id === 'spec-routine') output.totalCents = 28000;
      return { schemaVersion: '1.0.0', runId: request.runId, exampleId: request.exampleId, status: 'completed', output,
        agentVersion: 'synthetic-test-double', sourceHash: 'd'.repeat(64), promptHash: (regressing ? 'e' : 'f').repeat(64), durationMs: 0 };
    } },
  });
  const snapshot = { tutorialVersion: tutorial.tutorialVersion, exerciseId: exercise.id, exerciseVersion: exercise.exerciseVersion,
    rubricVersion: exercise.rubricVersion, datasetId: dataset.datasetId, datasetVersion: dataset.datasetVersion,
    datasetHash: dataset.contentHash, source: exercise.starterSource };
  async function execute(agentVariant: string): Promise<RunRecord> {
    const request: RunRequest = { requestId: `synthetic-${agentVariant}`, snapshot, mode: 'agent', agentVariant };
    const { runId } = await runs.create(request);
    for (let i = 0; i < 300; i++) {
      const record = await runs.get(runId);
      if (!['queued', 'validating', 'running', 'cancelling'].includes(record.status)) return record;
      await new Promise(done => setTimeout(done, 100));
    }
    throw new Error('Isolated run did not finish');
  }
  try {
    const baseline = await execute('baseline'); const candidate = await execute('omit-fees');
    assert.equal(baseline.status, 'completed', JSON.stringify(baseline.error ?? baseline.rows));
    assert.equal(candidate.status, 'completed', JSON.stringify(candidate.error ?? candidate.rows));
    const available = { available: true };
    const status: ServiceStatus = { schemaVersion: '1.0.0', phase: 'integrated', provider, automaticInference: false,
      capabilities: { content: available, agents: available, runner: available, validation: available, telemetry: available, review: available, judge: available } };
    const attempt = { id: 'synthetic-attempt', baselineRequestId: baseline.request.requestId, candidateRequestId: candidate.request.requestId,
      baselineRunId: baseline.runId, candidateRunId: candidate.runId };
    const result = comparePreparedRuns(attempt, baseline, candidate, dataset, snapshot, baseline.codeHash, status);
    assert.equal(result.comparable, true, result.reason);
    assert.deepEqual(result.rows.map(row => row.regression), [true, true, true]);
    assert.deepEqual(candidate.rows.find(row => row.exampleId === 'spec-no-affordable')!.evaluation!.criteria!.filter(item => item.label === 'fail').map(item => item.criterionId), ['R3', 'R4', 'R5']);
    if (process.env.ET_SDD_EVIDENCE) await writeFile(process.env.ET_SDD_EVIDENCE, JSON.stringify({
      evidence: 'Actual isolated evaluator; explicitly synthetic agent doubles; no live provider calls.', status, baseline, candidate,
    }, null, 2) + '\n');
  } finally { await runs.shutdown(); }
});
