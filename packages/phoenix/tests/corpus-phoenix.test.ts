import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Dataset, DocumentManifest, EvalResult, PhoenixLinks, Tutorial } from '@evals-tutorial/contracts';
import { validateContract } from '@evals-tutorial/contracts';
import { datasetHash, sha256 } from '@evals-tutorial/contracts/node';
import { createPhoenixTelemetry } from '../src/index.js';
import { fixtureRun } from './fixtures.js';

test('actual seven-exercise corpus imports and version pins; synthetic recording receipts only', { skip: !process.env.ET_WP07_CORPUS_ROOT }, async t => {
  const root = process.env.ET_WP07_CORPUS_ROOT!;
  const tutorial: Tutorial = JSON.parse(await readFile(join(root, 'content/tutorial.json'), 'utf8'));
  assert(validateContract('Tutorial', tutorial).valid);
  const stateDirectory = await mkdtemp(join(tmpdir(), 'et-wp07-corpus-state-'));
  const baseUrl = 'http://127.0.0.1:6006'; const signal = new AbortController().signal;
  const service = createPhoenixTelemetry({ baseUrl, stateDirectory });
  const nonce = randomUUID(); const observations: object[] = [];
  async function observe(dataset: Dataset, run: ReturnType<typeof fixtureRun>): Promise<PhoenixLinks> {
    const result = await service.record(dataset, run, signal);
    assert(validateContract('PhoenixLinks', result.phoenix).valid);
    assert(result.phoenix.datasetUrl && result.phoenix.experimentUrl);
    assert.equal(result.rowLinks.length, run.rows.length);
    result.rowLinks.forEach(row => assert(validateContract('PhoenixLinks', row.phoenix).valid && row.phoenix.traceId && row.phoenix.traceUrl));
    return result.phoenix;
  }
  try {
    for (const exercise of tutorial.exercises) {
      await t.test(`${exercise.id}: exact dataset hash, document manifest and persisted fixture rows`, async () => {
        const path = `content/datasets/${exercise.datasetId}/${exercise.datasetVersion}.json`;
        const bytes = await readFile(join(root, path)); const dataset: Dataset = JSON.parse(bytes.toString('utf8'));
        assert(validateContract('Dataset', dataset).valid);
        assert.equal(datasetHash(dataset), dataset.contentHash); assert.equal(exercise.datasetHash, dataset.contentHash);
        if (dataset.documentManifestRef) {
          const manifestBytes = await readFile(join(root, 'content', dataset.documentManifestRef.path));
          assert.equal(sha256(manifestBytes), dataset.documentManifestRef.sha256);
          const manifest: DocumentManifest = JSON.parse(manifestBytes.toString('utf8'));
          assert(validateContract('DocumentManifest', manifest).valid);
          for (const document of manifest.documents) assert.equal(sha256(await readFile(join(root, 'content', document.path))), document.sha256);
        }
        const run = fixtureRun(dataset, `actual-corpus-${exercise.id}-${nonce}`);
        run.request.snapshot.exerciseId = exercise.id; run.request.snapshot.exerciseVersion = exercise.exerciseVersion;
        run.request.snapshot.rubricVersion = exercise.rubricVersion; run.request.snapshot.tutorialVersion = tutorial.tutorialVersion;
        run.request.agentVariant = exercise.defaultAgentVariant;
        run.rows = dataset.examples.flatMap(example => example.fixtures.map(fixture => {
          const label = fixture.expectedEvaluation.allowedLabels[0]!;
          const score = label === 'pass' ? 1 : label === 'fail' ? 0 : Math.max(0.001, Math.min(0.999, (fixture.expectedEvaluation.minScore + fixture.expectedEvaluation.maxScore) / 2));
          const evaluation: EvalResult = { score, label, explanation: 'Synthetic telemetry mapping probe; no evaluator or provider invocation.' };
          return { exampleId: example.id, fixtureId: fixture.id, status: 'completed' as const, output: fixture.output, evaluation };
        }));
        run.totalRows = run.completedRows = run.rows.length;
        const first = await observe(dataset, run); const second = await observe(dataset, run);
        assert.deepEqual(first, second);
        const response = await fetch(`${baseUrl}/v1/experiments/${first.experimentId}/runs`); assert(response.ok);
        const tasks = (await response.json()).data; assert.equal(tasks.length, run.rows.length);
        observations.push({ exerciseId: exercise.id, corpusPath: path, fileHash: sha256(bytes), datasetHash: dataset.contentHash,
          originalVersion: dataset.datasetVersion, ...first, fixtureRows: run.rows.length, repeatImport: 'same dataset/version/experiment',
          receiptMode: 'synthetic stored results over actual owned corpus; no inference/evaluator execution' });
      });
    }
    assert.equal(observations.length, 7);
    if (process.env.ET_WP07_CORPUS_RECEIPT) await writeFile(process.env.ET_WP07_CORPUS_RECEIPT, JSON.stringify({
      corpusHead: 'd9ab77508f6f6892f4de57594146abbd629ea471', inferenceCalls: 0,
      serviceReturn: 'verified', observations,
    }, null, 2));
  } finally { await rm(stateDirectory, { recursive: true }); }
});
