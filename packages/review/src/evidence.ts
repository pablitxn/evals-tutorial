import { LIMITS, validateContract, validateDomain } from '@evals-tutorial/contracts';
import type { Dataset, Exercise, ProviderSummary, ReviewBinding, ReviewRequest, RunRecord, SourceSnapshot } from '@evals-tutorial/contracts';
import { canonicalJson, datasetHash, reviewBindingHash, sha256 } from '@evals-tutorial/contracts/node';
import { ServiceError } from '@evals-tutorial/contracts/services';

export function rejectEvidence(message: string): never {
  throw new ServiceError({ code: 'review_ineligible', message, retryable: false }, 409);
}

export function receiptHash(receipt: RunRecord): string { return sha256(canonicalJson(receipt)); }

/** Include teaching context and domain schemas so silent edits also invalidate review. */
export function rubricContext(exercise: Exercise) {
  return { exerciseId: exercise.id, exerciseVersion: exercise.exerciseVersion,
    rubricVersion: exercise.rubricVersion, mode: exercise.mode, criteria: exercise.criteria,
    lessonMarkdown: exercise.lessonMarkdown, inputSchema: exercise.inputSchema,
    outputSchema: exercise.outputSchema, expectedSchema: exercise.expectedSchema,
    consultationSourceHash: sha256(exercise.pythonSource) };
}
export function rubricHash(exercise: Exercise): string { return sha256(canonicalJson(rubricContext(exercise))); }

export interface ReviewEvidence {
  request: ReviewRequest;
  tutorialVersion: string;
  exercise: Exercise;
  dataset: Dataset;
  fixtureRun: RunRecord;
  agentRun: RunRecord;
  provider: ProviderSummary;
}

function sameSnapshot(a: SourceSnapshot, b: SourceSnapshot): boolean { return canonicalJson(a) === canonicalJson(b); }

/** Pure, nonexecuting eligibility check. All evidence except the requested IDs comes from host stores. */
export function deriveReviewBinding(material: ReviewEvidence): ReviewBinding {
  const { request, exercise, dataset, fixtureRun, agentRun, provider } = material;
  for (const [name, value] of [['ReviewRequest', request], ['Exercise', exercise], ['Dataset', dataset],
    ['RunRecord', fixtureRun], ['RunRecord', agentRun], ['ProviderSummary', provider]] as const) {
    if (!validateContract(name, value).valid) rejectEvidence(`Invalid stored ${name} or review request.`);
  }
  const snapshot = request.snapshot;
  if (Buffer.byteLength(snapshot.source, 'utf8') > LIMITS.sourceBytes || sha256(snapshot.source) !== request.codeHash) {
    rejectEvidence('The exact source bytes do not match the requested code hash.');
  }
  if (exercise.readOnly || exercise.id === 'intro' || !exercise.criteria.length ||
    new Set(exercise.criteria.map(c => c.id)).size !== exercise.criteria.length) rejectEvidence('This exercise has no editable review rubric.');
  if (material.tutorialVersion !== snapshot.tutorialVersion || exercise.id !== snapshot.exerciseId ||
    exercise.exerciseVersion !== snapshot.exerciseVersion || exercise.rubricVersion !== snapshot.rubricVersion ||
    exercise.datasetId !== snapshot.datasetId || exercise.datasetVersion !== snapshot.datasetVersion ||
    exercise.datasetHash !== snapshot.datasetHash || dataset.datasetId !== snapshot.datasetId ||
    dataset.datasetVersion !== snapshot.datasetVersion || dataset.contentHash !== snapshot.datasetHash ||
    datasetHash(dataset) !== dataset.contentHash) rejectEvidence('Exercise, rubric or dataset has changed.');
  if (!provider.configured || !/^[a-f0-9]{64}$/.test(provider.configRevision)) rejectEvidence('A configured provider revision is required.');

  for (const [run, mode, id] of [[fixtureRun, 'fixtures', request.fixtureRunId], [agentRun, 'agent', request.agentRunId]] as const) {
    if (run.runId !== id || run.request.mode !== mode || run.status !== 'completed' || run.error ||
      run.diagnostics.some(d => d.severity === 'error') || !sameSnapshot(run.request.snapshot, snapshot) ||
      run.codeHash !== request.codeHash || run.provenance.codeHash !== request.codeHash ||
      run.provenance.datasetHash !== dataset.contentHash || run.totalRows !== run.rows.length ||
      run.completedRows !== run.totalRows || !run.totalRows ||
      run.rows.some(row => row.status !== 'completed' || row.error || !row.output || !row.evaluation ||
        !validateContract('EvalResult', row.evaluation).valid)) rejectEvidence('Completed, validated matching run receipts are required.');
    if (!exercise.agentVariants.includes(run.request.agentVariant)) rejectEvidence('Unknown stored agent variant.');
    if (run.provenance.provider && canonicalJson(run.provenance.provider) !== canonicalJson(provider)) {
      rejectEvidence('Run provider does not match the current global profile.');
    }
  }
  const provenance = agentRun.provenance;
  if (!provenance.agentVersion || !provenance.agentSourceHash || !provenance.promptHash || !provenance.provider ||
    !/^[a-f0-9]{64}$/.test(provenance.agentSourceHash) || !/^[a-f0-9]{64}$/.test(provenance.promptHash) ||
    fixtureRun.request.agentVariant !== agentRun.request.agentVariant) rejectEvidence('Exact agent and provider provenance is required.');

  const expectedFixtures = new Map<string, { output: unknown; expectation: Dataset['examples'][number]['fixtures'][number]['expectedEvaluation'] }>();
  const examples = new Map(dataset.examples.map(example => [example.id, example]));
  if (!examples.size || examples.size !== dataset.examples.length) rejectEvidence('Dataset example IDs must be unique.');
  let positive = false;
  let negative = false;
  for (const example of dataset.examples) {
    if (!validateDomain(exercise.inputSchema, example.input).valid || !validateDomain(exercise.expectedSchema, example.expected).valid) {
      rejectEvidence('Stored dataset does not match the exercise domain schemas.');
    }
    for (const fixture of example.fixtures) {
      const key = canonicalJson([example.id, fixture.id]);
      if (expectedFixtures.has(key) || !validateDomain(exercise.outputSchema, fixture.output).valid) rejectEvidence('Invalid or duplicate fixture.');
      const expectation = fixture.expectedEvaluation;
      if (expectation.minScore > expectation.maxScore) rejectEvidence('Invalid fixture score interval.');
      positive ||= expectation.allowedLabels.length === 1 && expectation.allowedLabels[0] === 'pass';
      negative ||= !expectation.allowedLabels.includes('pass');
      expectedFixtures.set(key, { output: fixture.output, expectation });
    }
  }
  if (!positive || !negative || fixtureRun.rows.length !== expectedFixtures.size) rejectEvidence('Discriminating positive and negative fixture coverage is required.');
  for (const row of fixtureRun.rows) {
    const key = canonicalJson([row.exampleId, row.fixtureId ?? null]);
    const fixture = expectedFixtures.get(key);
    const evaluation = row.evaluation!;
    if (!fixture || !row.fixtureMatched || canonicalJson(row.output) !== canonicalJson(fixture.output) ||
      !fixture.expectation.allowedLabels.includes(evaluation.label) || evaluation.score < fixture.expectation.minScore ||
      evaluation.score > fixture.expectation.maxScore || !fixture.expectation.requiredEvidence.every(text =>
        evaluation.explanation.toLowerCase().includes(text.toLowerCase()))) rejectEvidence('Fixture evidence does not satisfy its stored expectations.');
    expectedFixtures.delete(key);
  }
  const remaining = new Set(examples.keys());
  for (const row of agentRun.rows) {
    if (row.fixtureId !== undefined || !remaining.delete(row.exampleId) ||
      !validateDomain(exercise.outputSchema, row.output).valid) rejectEvidence('Agent receipt must cover each dataset example exactly once.');
  }
  if (remaining.size) rejectEvidence('Agent receipt is missing dataset examples.');

  const binding: ReviewBinding = {
    tutorialVersion: snapshot.tutorialVersion, exerciseId: exercise.id, exerciseVersion: exercise.exerciseVersion,
    rubricVersion: exercise.rubricVersion, rubricHash: rubricHash(exercise), codeHash: request.codeHash,
    datasetId: dataset.datasetId, datasetVersion: dataset.datasetVersion, datasetHash: dataset.contentHash,
    fixtureRunId: fixtureRun.runId, fixtureReceiptHash: receiptHash(fixtureRun), agentRunId: agentRun.runId,
    agentReceiptHash: receiptHash(agentRun), agentVariant: agentRun.request.agentVariant,
    agentVersion: provenance.agentVersion!, providerConfigRevision: provider.configRevision,
  };
  if (!validateContract('ReviewBinding', binding).valid) rejectEvidence('Invalid review binding.');
  return binding;
}

/** The UI compares the current binding; historical records are never rewritten on an edit. */
export function isReviewCurrent(bindingHash: string, current: ReviewBinding): boolean {
  return bindingHash === reviewBindingHash(current);
}
