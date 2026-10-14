import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, reviewBindingHash, sha256 } from '@evals-tutorial/contracts/node';
import { deriveReviewBinding, isReviewCurrent, receiptHash } from '../src/index.js';
import { sample } from './support.js';

test('binding derives exact source/data/rubric/receipt/agent/provider identities from saved evidence', () => {
  const evidence = sample();
  const binding = deriveReviewBinding(evidence);
  assert.equal(binding.codeHash, sha256(evidence.request.snapshot.source));
  assert.equal(binding.fixtureReceiptHash, sha256(canonicalJson(evidence.fixtureRun)));
  assert.equal(binding.agentReceiptHash, receiptHash(evidence.agentRun));
  assert.equal(binding.providerConfigRevision, evidence.provider.configRevision);
  assert.equal(binding.agentVersion, evidence.agentRun.provenance.agentVersion);
  assert.equal(evidence.agentRun.rows[0]!.evaluation!.label, 'fail');
});

const rejected: Record<string, (e: ReturnType<typeof sample>) => void> = {
  'late edit with old code hash': e => { e.request.snapshot.source += '\n'; },
  'matching hash but different stored source': e => { e.request.snapshot.source += '\n'; e.request.codeHash = sha256(e.request.snapshot.source); },
  'modified dataset bytes': e => { e.dataset.examples[0]!.input.starred = false; },
  'new rubric version': e => { e.exercise.rubricVersion = '2'; },
  'different tutorial': e => { e.tutorialVersion = '2'; },
  'operational failure in a completed run': e => { e.agentRun.rows[0]!.error = { code: 'timeout', message: 'No response', retryable: true }; },
  'partial agent execution': e => { e.agentRun.status = 'partial'; },
  'unvalidated source': e => { e.fixtureRun.diagnostics.push({ file: 'evaluator.ts', line: 1, column: 1, code: 'test', severity: 'error', message: 'Invalid source' }); },
  'missing fixture coverage': e => { e.fixtureRun.rows.pop(); e.fixtureRun.totalRows--; e.fixtureRun.completedRows--; },
  'duplicate fixture rows': e => { e.fixtureRun.rows[1] = structuredClone(e.fixtureRun.rows[0]!); },
  'incorrect fixture output': e => { e.fixtureRun.rows[0]!.output = { label: 'invented' }; },
  'forged fixture verdict': e => { e.fixtureRun.rows[0]!.evaluation = { score: 0, label: 'fail', explanation: 'classification correct' }; },
  'unmatched fixture': e => { e.fixtureRun.rows[0]!.fixtureMatched = false; },
  'missing explanatory evidence': e => { e.fixtureRun.rows[0]!.evaluation!.explanation = 'okay'; },
  'missing agent source digest': e => { delete e.agentRun.provenance.agentSourceHash; },
  'missing agent prompt digest': e => { delete e.agentRun.provenance.promptHash; },
  'missing provider provenance': e => { delete e.agentRun.provenance.provider; },
  'provider configuration changed': e => { e.provider.configRevision = sha256('new-provider'); },
  'provider model changed without revision': e => { e.provider.model = 'other-model'; },
  'disabled provider': e => { e.provider.configured = false; },
  'unknown agent variant': e => { e.agentRun.request.agentVariant = 'unknown'; },
  'mismatched receipt ID': e => { e.request.agentRunId = 'different-run'; },
  'wrong run mode': e => { e.agentRun.request.mode = 'fixtures'; },
  'wrong provenance code hash': e => { e.agentRun.provenance.codeHash = sha256('other'); },
  'intro is read-only': e => { e.exercise.readOnly = true; },
};
for (const [name, mutate] of Object.entries(rejected)) test(`ineligible: ${name}`, () => {
  const e = sample(); mutate(e);
  assert.throws(() => deriveReviewBinding(e), (error: any) => error.detail.code === 'review_ineligible');
});

test('any agent source, prompt, result, rubric, lock or runner identity change invalidates the binding', () => {
  const original = sample();
  const old = reviewBindingHash(deriveReviewBinding(original));
  for (const mutate of [
    (e: typeof original) => { e.agentRun.provenance.agentSourceHash = sha256('new-agent'); },
    (e: typeof original) => { e.agentRun.provenance.promptHash = sha256('new-prompt'); },
    (e: typeof original) => { e.agentRun.rows[0]!.evaluation!.explanation += ' changed'; },
    (e: typeof original) => { e.exercise.criteria[0]!.description += ' Additional criterion detail.'; },
    (e: typeof original) => { e.exercise.lessonMarkdown += ' Additional teaching context.'; },
    (e: typeof original) => { e.exercise.pythonSource += '\n# Consultation changed.'; },
    (e: typeof original) => { e.agentRun.provenance.dependencyLockHash = sha256('new-lock'); },
    (e: typeof original) => { e.agentRun.provenance.runnerImageDigest += '-new'; },
  ]) {
    const changed = sample(); mutate(changed);
    assert.equal(isReviewCurrent(old, deriveReviewBinding(changed)), false);
  }
});
