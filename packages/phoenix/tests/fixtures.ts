import type { Dataset, RunRecord } from '@evals-tutorial/contracts';
import { datasetHash, sha256 } from '@evals-tutorial/contracts/node';

export function fixtureDataset(id = 'et-wp07-synthetic'): Dataset {
  const value: Dataset = { schemaVersion: '1.0.0', datasetId: id, datasetVersion: '1', contentHash: '', documentManifestRef: null,
    examples: [{ id: 'starred', input: { starred: true }, expected: { label: 'starred' }, metadata: { synthetic: true },
      fixtures: [{ id: 'correct', output: { label: 'starred' }, expectedEvaluation: { allowedLabels: ['pass'], minScore: 1, maxScore: 1, requiredEvidence: [] }, rationale: 'Owned correct fixture' },
        { id: 'incorrect', output: { label: 'not-starred' }, expectedEvaluation: { allowedLabels: ['fail'], minScore: 0, maxScore: 0, requiredEvidence: [] }, rationale: 'Owned negative fixture' }] }] };
  value.contentHash = datasetHash(value); return value;
}

export function fixtureRun(dataset: Dataset, id = 'synthetic-run'): RunRecord {
  const source = 'export async function evaluate() { /* synthetic receipt; never executed */ }\n';
  return { schemaVersion: '1.0.0', runId: id, codeHash: sha256(source), status: 'completed', telemetryStatus: 'pending',
    createdAt: '2026-10-14T13:00:00.000Z', updatedAt: '2026-10-14T13:00:01.000Z', totalRows: 2, completedRows: 2, diagnostics: [],
    request: { requestId: id, mode: 'fixtures', agentVariant: 'synthetic-fixtures', snapshot: {
      tutorialVersion: 'test-1', exerciseId: 'intro', exerciseVersion: 'test-1', rubricVersion: 'test-1', datasetId: dataset.datasetId,
      datasetVersion: dataset.datasetVersion, datasetHash: dataset.contentHash, source } },
    provenance: { codeHash: sha256(source), datasetHash: dataset.contentHash, repositoryRevision: 'synthetic-contract-fixture',
      dependencyLockHash: sha256('synthetic-lock'), runnerImageDigest: 'synthetic-no-execution' },
    rows: [{ exampleId: 'starred', fixtureId: 'correct', status: 'completed', output: { label: 'starred' }, fixtureMatched: true,
      evaluation: { score: 1, label: 'pass', explanation: 'Matches independent reference, including "starred".\nOwned fixture.' } },
      { exampleId: 'starred', fixtureId: 'incorrect', status: 'completed', output: { label: 'not-starred' }, fixtureMatched: true,
        evaluation: { score: 0, label: 'fail', explanation: 'Does not match independent reference' } }] };
}
