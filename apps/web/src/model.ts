import type { Dataset, Exercise, ExerciseId, RunRecord, ReviewRecord, ServiceStatus, SourceSnapshot, Tutorial } from '@evals-tutorial/contracts';

export const LESSON_IDS: readonly ExerciseId[] = ['intro', '01-starred-classifier', '02-document-classification', '03-independent-tie-out', '04-policy-recommendation', '05-package-readiness', '06-simulated-travel'];
export const LESSON_LABELS = ['Introduction', 'Starred messages', 'Document types', 'Salary tie-out', 'Policy support', 'Package readiness', 'Simulated travel'];
export const LESSON_MINUTES = [10, 15, 20, 25, 20, 15, 20];

export function snapshot(tutorial: Tutorial, exercise: Exercise, source: string): SourceSnapshot {
  return { tutorialVersion: tutorial.tutorialVersion, exerciseId: exercise.id, exerciseVersion: exercise.exerciseVersion,
    rubricVersion: exercise.rubricVersion, datasetId: exercise.datasetId, datasetVersion: exercise.datasetVersion,
    datasetHash: exercise.datasetHash, source };
}

export async function sourceHash(source: string): Promise<string> {
  const bytes = new TextEncoder().encode(source);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function sameSnapshot(a: SourceSnapshot, b: SourceSnapshot): boolean {
  return a.tutorialVersion === b.tutorialVersion && a.exerciseId === b.exerciseId && a.exerciseVersion === b.exerciseVersion
    && a.rubricVersion === b.rubricVersion && a.datasetId === b.datasetId && a.datasetVersion === b.datasetVersion
    && a.datasetHash === b.datasetHash && a.source === b.source;
}

export function runCurrent(run: RunRecord | undefined, current: SourceSnapshot, hash: string | null, variant: string, status?: ServiceStatus): boolean {
  if (!run || !hash || run.codeHash !== hash || !sameSnapshot(run.request.snapshot, current) || run.request.agentVariant !== variant) return false;
  const provider = run.provenance.provider;
  if ((run.request.mode === 'agent' || provider) && provider?.configRevision !== status?.provider?.configRevision) return false;
  return true;
}

export function fixturesDiscriminate(run: RunRecord | undefined, dataset?: Dataset): boolean {
  if (!run || !dataset || run.status !== 'completed' || run.request.mode !== 'fixtures' || !run.totalRows || run.rows.length !== run.totalRows) return false;
  const fixtures = dataset.examples.flatMap(example => example.fixtures.map(fixture => ({ example, fixture })));
  if (fixtures.length !== run.rows.length || !fixtures.some(({ fixture }) => fixture.expectedEvaluation.allowedLabels.includes('pass'))
    || !fixtures.some(({ fixture }) => fixture.expectedEvaluation.allowedLabels.includes('fail'))) return false;
  return fixtures.every(({ example, fixture }) => run.rows.some(row => row.exampleId === example.id && row.fixtureId === fixture.id
    && row.status === 'completed' && row.fixtureMatched === true && row.evaluation));
}

export function reviewCurrent(review: ReviewRecord | undefined, current: SourceSnapshot, hash: string | null, fixture: RunRecord | undefined, agent: RunRecord | undefined, variant: string, status?: ServiceStatus): boolean {
  if (!review || !hash || !fixture || !agent || fixture.status !== 'completed' || agent.status !== 'completed') return false;
  if (['ready', 'needs_changes', 'inconclusive'].includes(review.status) && (!review.assessment || review.assessment.status !== review.status)) return false;
  if (!fixture.rows.length || !fixture.rows.every(row => row.status === 'completed' && row.fixtureMatched === true)) return false;
  // A later receipt update must not silently inherit an earlier review binding.
  if (Date.parse(fixture.updatedAt) > Date.parse(review.createdAt) || Date.parse(agent.updatedAt) > Date.parse(review.createdAt)) return false;
  const b = review.binding;
  return b.tutorialVersion === current.tutorialVersion && b.exerciseId === current.exerciseId && b.exerciseVersion === current.exerciseVersion
    && b.rubricVersion === current.rubricVersion && b.datasetId === current.datasetId && b.datasetVersion === current.datasetVersion
    && b.datasetHash === current.datasetHash && b.codeHash === hash && b.fixtureRunId === fixture.runId && b.agentRunId === agent.runId
    && b.agentVariant === variant && b.agentVersion === agent.provenance.agentVersion && b.providerConfigRevision === status?.provider?.configRevision
    && runCurrent(fixture, current, hash, variant, status) && runCurrent(agent, current, hash, variant, status);
}

export function reviewFindingsValid(review: ReviewRecord | undefined, exercise: Exercise, fixture?: RunRecord, agent?: RunRecord): boolean {
  if (!review?.assessment) return false;
  const criteria = new Set(exercise.criteria.map(criterion => criterion.id));
  const examples = new Set([...(fixture?.rows ?? []), ...(agent?.rows ?? [])].map(row => row.exampleId));
  return review.assessment.findings.every(finding => criteria.has(finding.criterionId) && finding.exampleIds.length > 0
    && finding.exampleIds.every(id => examples.has(id)) && finding.evidence.trim() && finding.feedback.trim() && finding.nextAction.trim());
}

export const runActive = (run: RunRecord): boolean => ['queued', 'validating', 'running', 'cancelling'].includes(run.status);
export const reviewActive = (review: ReviewRecord): boolean => ['pending', 'running'].includes(review.status);
export function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function lessonFromHash(): ExerciseId {
  let id: string;
  try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return 'intro'; }
  return LESSON_IDS.includes(id as ExerciseId) ? id as ExerciseId : 'intro';
}
