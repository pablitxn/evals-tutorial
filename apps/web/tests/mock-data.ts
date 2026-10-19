import { validateContract, type Dataset, type Exercise, type RunRecord, type ReviewRecord, type ServiceStatus, type Tutorial } from '@evals-tutorial/contracts';
import { sha256 } from '@evals-tutorial/contracts/node';
import { LESSON_IDS, LESSON_LABELS } from '../src/model.js';

export const hash = 'a'.repeat(64);
export const source = 'export async function evaluate(row, ctx) {\n  return { score: 1, label: "pass", explanation: "Check the criterion." };\n}\n';
const capability = { available: true };
export const status: ServiceStatus = { schemaVersion: '1.0.0', phase: 'integrated', provider: { provider: 'openai', model: 'synthetic-ui-mock', configRevision: 'c'.repeat(64), configured: true }, automaticInference: false,
  capabilities: { content: capability, validation: capability, runner: capability, agents: capability, judge: capability, telemetry: capability, review: capability } };
export const tutorial: Tutorial = { schemaVersion: '1.0.0', tutorialVersion: 'ui-mock-v1', title: 'Synthetic UI test mock', exercises: LESSON_IDS.map((id, i): Exercise => ({
  id, title: LESSON_LABELS[i]!, exerciseVersion: '1', rubricVersion: '1', mode: i === 4 ? 'Mixed' : 'Code', readOnly: i === 0 || i === 7,
  lessonMarkdown: 'Synthetic UI test mock. No real provider or Phoenix artifacts.\n\nWrite an evaluator that distinguishes a correct response from a known mistake. The independent reference stays separate from the agent input.',
  starterSource: source, pythonSource: '"""Synthetic prepared source for UI verification only."""\nasync def respond(input):\n    return {"label": "starred"}\n',
  datasetId: `mock-${id}`, datasetVersion: '1', datasetHash: hash, criteria: [{ id: 'criterion', description: 'Check the declared criterion and explain a known mistake.', mode: 'Code' }, ...(i === 4 ? [{ id: 'support', description: 'Judge faithful support against the synthetic policy.', mode: 'LLM Judge' as const }] : [])],
  agentVariants: i === 7 ? ['baseline', 'omit-fees'] : ['baseline', 'alternative'], defaultAgentVariant: 'baseline', maxJudgeCallsPerRow: i === 4 ? 2 : 0,
  inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, expectedSchema: { type: 'object' }, officialDocs: [{ title: 'Phoenix documentation', url: 'https://arize.com/docs/phoenix' }],
})) };
export function dataset(exercise = tutorial.exercises[1]!): Dataset { return { schemaVersion: '1.0.0', datasetId: exercise.datasetId, datasetVersion: '1', contentHash: hash, documentManifestRef: null,
  examples: [{ id: 'example-1', input: { starred: true }, expected: { label: 'starred' }, metadata: {}, fixtures: [
    { id: 'good', output: { label: 'starred' }, rationale: 'Known correct response.', expectedEvaluation: { allowedLabels: ['pass'], minScore: 1, maxScore: 1, requiredEvidence: ['label'] } },
    { id: 'bad', output: { label: 'not_starred' }, rationale: 'Known wrong label.', expectedEvaluation: { allowedLabels: ['fail'], minScore: 0, maxScore: 0, requiredEvidence: ['label'] } },
  ] }] }; }
export function run(mode: 'fixtures' | 'agent' = 'fixtures', exercise = tutorial.exercises[1]!): RunRecord {
  return { schemaVersion: '1.0.0', runId: `mock-${mode}`, request: { requestId: `mock-request-${mode}`, snapshot: { tutorialVersion: tutorial.tutorialVersion, exerciseId: exercise.id, exerciseVersion: exercise.exerciseVersion, rubricVersion: exercise.rubricVersion, datasetId: exercise.datasetId, datasetVersion: exercise.datasetVersion, datasetHash: exercise.datasetHash, source }, mode, agentVariant: 'baseline' },
    codeHash: sha256(source), status: 'completed', telemetryStatus: 'failed', createdAt: '2026-10-14T14:00:00Z', updatedAt: '2026-10-14T14:00:01Z', totalRows: mode === 'fixtures' ? 2 : 1, completedRows: mode === 'fixtures' ? 2 : 1,
    rows: mode === 'fixtures' ? ['good', 'bad'].map((fixtureId, i) => ({ exampleId: 'example-1', fixtureId, status: 'completed', fixtureMatched: true, output: { label: i === 0 ? 'starred' : 'not_starred' }, evaluation: { score: i === 0 ? 1 : 0, label: i === 0 ? 'pass' : 'fail', explanation: 'Compared the actual label to the independent reference.' } })) : [{ exampleId: 'example-1', status: 'completed', output: { label: 'not_starred' }, evaluation: { score: 0, label: 'fail', explanation: 'The evaluator correctly detected the wrong label.' } }],
    diagnostics: [], provenance: { codeHash: sha256(source), datasetHash: hash, repositoryRevision: 'd'.repeat(40), dependencyLockHash: hash, runnerImageDigest: `sha256:${hash}`, agentVersion: 'mock-agent-1', ...(mode === 'agent' ? { provider: status.provider! } : {}) },
  };
}
export function review(exercise = tutorial.exercises[1]!): ReviewRecord { return {
  schemaVersion: '1.0.0', reviewId: 'mock-review', requestId: 'mock-review-request', bindingHash: hash,
  binding: { tutorialVersion: tutorial.tutorialVersion, exerciseId: exercise.id, exerciseVersion: exercise.exerciseVersion, rubricVersion: exercise.rubricVersion, rubricHash: hash, codeHash: sha256(source), datasetId: exercise.datasetId, datasetVersion: exercise.datasetVersion, datasetHash: hash,
    fixtureRunId: 'mock-fixtures', fixtureReceiptHash: hash, agentRunId: 'mock-agent', agentReceiptHash: hash, agentVariant: 'baseline', agentVersion: 'mock-agent-1', providerConfigRevision: 'c'.repeat(64) },
  status: 'ready', createdAt: '2026-10-14T14:00:02Z', updatedAt: '2026-10-14T14:00:03Z', assessment: { status: 'ready', summary: 'Synthetic review: the known mistake was distinguished.', findings: [] },
}; }
export const mockData = { tutorial, status, dataset: dataset(), fixtures: run(), agent: run('agent'), review: review() };
for (const [name, value] of [['Tutorial', tutorial], ['ServiceStatus', status], ['Dataset', mockData.dataset], ['RunRecord', mockData.fixtures], ['RunRecord', mockData.agent], ['ReviewRecord', mockData.review]] as const) {
  const result = validateContract(name, value); if (!result.valid) throw new Error(`${name}: ${result.errors.join('; ')}`);
}
if (process.argv[1]?.endsWith('mock-data.ts')) console.log(JSON.stringify(mockData));
