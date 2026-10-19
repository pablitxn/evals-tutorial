import type { Dataset, RunRecord, ServiceStatus, SourceSnapshot } from '@evals-tutorial/contracts';
import { sameSnapshot } from './model.js';

export type ComparisonAttempt = {
  id: string;
  baselineRequestId: string;
  candidateRequestId?: string;
  baselineRunId?: string;
  candidateRunId?: string;
};
export const REQUIREMENT_IDS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'] as const;
export type ComparedRow = { exampleId: string; compared: boolean; regression: boolean; reason?: string; baseline?: RunRecord['rows'][number]; candidate?: RunRecord['rows'][number] };
export type Comparison = { comparable: boolean; reason?: string; rows: ComparedRow[] };

/** Compare only the two receipts explicitly bound to this attempt. Errors have no score. */
export function comparePreparedRuns(attempt: ComparisonAttempt | undefined, baseline: RunRecord | undefined, candidate: RunRecord | undefined,
  dataset: Dataset | undefined, current: SourceSnapshot, codeHash: string | null, status?: ServiceStatus): Comparison {
  const unavailable = (reason: string): Comparison => ({ comparable: false, reason, rows: [] });
  if (!attempt || !baseline || !candidate || !dataset) return unavailable('Run both versions explicitly to compare this attempt.');
  if (baseline.runId !== attempt.baselineRunId || candidate.runId !== attempt.candidateRunId || baseline.runId === candidate.runId
    || baseline.request.requestId !== attempt.baselineRequestId || candidate.request.requestId !== attempt.candidateRequestId)
    return unavailable('Receipts do not belong to the same explicit comparison attempt.');
  if (baseline.request.mode !== 'agent' || candidate.request.mode !== 'agent' || baseline.request.agentVariant !== 'baseline' || candidate.request.agentVariant !== 'omit-fees')
    return unavailable('Comparison requires baseline and omit-fees agent runs.');
  if (!codeHash || baseline.codeHash !== codeHash || candidate.codeHash !== codeHash
    || !sameSnapshot(baseline.request.snapshot, current) || !sameSnapshot(candidate.request.snapshot, current)
    || dataset.datasetId !== current.datasetId || dataset.datasetVersion !== current.datasetVersion || dataset.contentHash !== current.datasetHash)
    return unavailable('Source, rubric or dataset changed. Start a new comparison attempt.');
  const a = baseline.provenance; const b = candidate.provenance;
  if (a.codeHash !== codeHash || b.codeHash !== codeHash || a.datasetHash !== current.datasetHash || b.datasetHash !== current.datasetHash
    || !a.agentVersion || !b.agentVersion || !a.agentSourceHash || !b.agentSourceHash || a.agentSourceHash !== b.agentSourceHash || !a.promptHash || !b.promptHash
    || a.repositoryRevision !== b.repositoryRevision || a.dependencyLockHash !== b.dependencyLockHash || a.runnerImageDigest !== b.runnerImageDigest || a.agentVersion !== b.agentVersion
    || !a.provider || !b.provider || a.provider.provider !== b.provider.provider || a.provider.model !== b.provider.model
    || a.provider.configRevision !== b.provider.configRevision || a.provider.configRevision !== status?.provider?.configRevision)
    return unavailable('Provider, configuration or repository identity differs. Start a new comparison attempt.');
  if (baseline.status !== 'completed' || candidate.status !== 'completed' || baseline.error || candidate.error)
    return unavailable('Execution incomplete or operational error. Results are not compared.');
  const ids = dataset.examples.map(example => example.id);
  if ([baseline, candidate].some(run => run.totalRows !== ids.length || run.completedRows !== ids.length || run.rows.length !== ids.length
    || new Set(run.rows.map(row => row.exampleId)).size !== ids.length || run.rows.some(row => !ids.includes(row.exampleId) || row.fixtureId)))
    return unavailable('Missing or mismatched rows. Results are not compared.');
  const rows = ids.map(exampleId => {
    const left = baseline.rows.find(row => row.exampleId === exampleId)!;
    const right = candidate.rows.find(row => row.exampleId === exampleId)!;
    const scored = (row: typeof left) => row.status === 'completed' && !row.error && row.evaluation
      && ['pass', 'fail'].includes(row.evaluation.label) && row.evaluation.score === (row.evaluation.label === 'pass' ? 1 : 0)
      && row.evaluation.criteria?.length === REQUIREMENT_IDS.length
      && REQUIREMENT_IDS.every(id => row.evaluation!.criteria!.filter(criterion => criterion.criterionId === id && ['pass', 'fail'].includes(criterion.label)
        && criterion.score === (criterion.label === 'pass' ? 1 : 0)).length === 1)
      && row.evaluation.label === (row.evaluation.criteria.every(criterion => criterion.label === 'pass') ? 'pass' : 'fail');
    const compared = !!scored(left) && !!scored(right);
    return { exampleId, baseline: left, candidate: right, compared,
      regression: compared && left.evaluation!.label === 'pass' && right.evaluation!.label === 'fail',
      ...(!compared ? { reason: 'Operational error, incomplete row or missing requirement evidence. Not compared.' } : {}) };
  });
  return { comparable: rows.every(row => row.compared), rows };
}
