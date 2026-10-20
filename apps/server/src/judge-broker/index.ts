import { LIMITS, validateContract } from '@evals-tutorial/contracts';
import type { EvalResult, ReviewAssessment } from '@evals-tutorial/contracts';
import type { ContentService, JudgeBinding, ProviderBroker, ReviewBrokerBinding } from '@evals-tutorial/contracts/services';
import { createReviewOperation } from '@evals-tutorial/review';
import { ServiceError } from '@evals-tutorial/contracts/services';
import { sha256, canonicalJson } from '@evals-tutorial/contracts/node';
import { boundedCall, operation } from '../providers/process.js';
import { createTelemetryContext } from '@evals-tutorial/phoenix';
import type { BrokerTransport, ProviderCall } from '../providers/process.js';

function result(name: 'EvalResult' | 'ReviewAssessment', value: unknown) {
  const raw = JSON.stringify(value);
  if (!raw || Buffer.byteLength(raw) > LIMITS.protocolBytes || !validateContract(name, value).valid) throw operation(name === 'EvalResult' ? 'agent_output_schema' : 'review_output_schema', 'Provider returned an invalid structured result.');
}
export function createProviderBroker(transport: BrokerTransport, content?: Pick<ContentService, 'dataset'>): ProviderBroker {
  // A fresh bind for the same immutable row cannot replenish its lifetime budget.
  const budgets = new Map<string, { identity: string; calls: number }>();
  const reviews = new Set<string>();
  let active = 0;
  async function dispatch(call: ProviderCall) {
    if (active >= LIMITS.rowConcurrency) throw operation('resource_limit', 'Provider broker concurrency limit reached.');
    active++;
    try { return await boundedCall(transport, call); }
    finally { active--; }
  }
  return {
    bind(binding: JudgeBinding) {
      const rowIdentity = { exampleId: binding.exampleId, ...(binding.fixtureId !== undefined ? { fixtureId: binding.fixtureId } : {}), status: 'completed' };
      if (!validateContract('RowResult', rowIdentity).valid) throw operation('invalid_request', 'Invalid trusted judge row identity.');
      if (!validateContract('EvalInput', binding.row).valid || binding.exampleId !== binding.row.metadata.exampleId || !['Code', 'Mixed', 'LLM Judge'].includes(binding.mode) || !Number.isInteger(binding.maxCalls) || binding.maxCalls < 0 || binding.maxCalls > LIMITS.maxJudgeCallsPerRow || !Number.isInteger(binding.maxOutputTokens) || binding.maxOutputTokens < 1 || binding.maxOutputTokens > LIMITS.maxProviderOutputTokens || !Number.isFinite(binding.deadlineEpochMs)) throw operation('invalid_request', 'Invalid trusted judge binding.');
      if (Buffer.byteLength(JSON.stringify(binding.row)) > LIMITS.protocolBytes) throw operation('resource_limit', 'Judge row exceeds the protocol limit.');
      const row = structuredClone(binding.row);
      const criteria = [...binding.criterionIds];
      const mode = binding.mode, maxCalls = binding.maxCalls, maxOutputTokens = binding.maxOutputTokens;
      const deadlineEpochMs = binding.deadlineEpochMs, signal = binding.signal;
      const telemetry = {
        traceparent: createTelemetryContext(binding.runId, binding.exampleId, binding.fixtureId).traceparent,
        runId: binding.runId, exampleId: binding.exampleId, exerciseId: row.metadata.exerciseId,
        ...(binding.fixtureId === undefined ? {} : { fixtureId: binding.fixtureId }),
      };
      // Each installed fixture is a distinct row, including fixtures with equal outputs.
      // The absent fixture ID gives real-agent rows a separate namespace.
      const key = JSON.stringify([binding.runId, binding.exampleId, binding.fixtureId ?? null]);
      const identity = sha256(canonicalJson({ row, criteria, mode, maxCalls, maxOutputTokens, deadlineEpochMs }));
      let budget = budgets.get(key);
      if (budget && budget.identity !== identity) throw operation('conflict', 'Judge row binding cannot change within a run.');
      if (!budget) {
        if (budgets.size >= 10000) throw operation('resource_limit', 'Broker lifetime binding limit reached; create a new service for the next session.');
        budget = { identity, calls: 0 }; budgets.set(key, budget);
      }
      const lifetime = budget;
      return { async judge(request) {
        if (mode === 'Code') throw operation('budget_exceeded', 'Judge calls are disabled for Code exercises.');
        if (!validateContract('JudgeRequest', request).valid || request.criterionIds.length === 0 || new Set(request.criterionIds).size !== request.criterionIds.length || request.criterionIds.some(id => !criteria.includes(id))) throw operation('invalid_request', 'Judge request must use allowed criteria and a bounded rubric.');
        if (signal.aborted) throw operation('cancelled', 'Judge operation cancelled.');
        if (Date.now() >= deadlineEpochMs) throw operation('timeout', 'Judge deadline expired.');
        if (lifetime.calls >= maxCalls) throw operation('budget_exceeded', 'Judge lifetime call budget exhausted.');
        lifetime.calls++;
        const output = await dispatch({ role: 'judge', material: { row, request: structuredClone(request) }, telemetry, maxOutputTokens, deadlineEpochMs, signal });
        result('EvalResult', output);
        return output as EvalResult;
      } };
    },
    async review(binding: ReviewBrokerBinding): Promise<ReviewAssessment> {
      if ((binding.feedbackLocale !== undefined && !['en', 'es'].includes(binding.feedbackLocale)) || !validateContract('ReviewBinding', binding.binding).valid || !validateContract('Exercise', binding.exercise).valid || !validateContract('RunRecord', binding.fixtureRun).valid || !validateContract('RunRecord', binding.agentRun).valid || typeof binding.source !== 'string' || Buffer.byteLength(binding.source) > LIMITS.sourceBytes || !Number.isInteger(binding.maxOutputTokens) || binding.maxOutputTokens < 1 || binding.maxOutputTokens > LIMITS.maxProviderOutputTokens || !Number.isFinite(binding.deadlineEpochMs)) throw operation('invalid_request', 'Invalid trusted review binding.');
      if (sha256(binding.source) !== binding.binding.codeHash || binding.fixtureRun.runId !== binding.binding.fixtureRunId || binding.agentRun.runId !== binding.binding.agentRunId || binding.exercise.id !== binding.binding.exerciseId) throw operation('review_ineligible', 'Review source, exercise and stored run identities must match the frozen binding.');
      const material = structuredClone({ feedbackLocale: binding.feedbackLocale, binding: binding.binding, criteria: binding.exercise.criteria, source: binding.source, fixtureRun: binding.fixtureRun, agentRun: binding.agentRun });
      const telemetry = { reviewId: binding.reviewId, exerciseId: binding.exercise.id,
        fixtureRunId: binding.fixtureRun.runId, agentRunId: binding.agentRun.runId };
      if (Buffer.byteLength(JSON.stringify(material)) > LIMITS.protocolBytes) throw operation('resource_limit', 'Review evidence exceeds the protocol limit.');
      const criterionIds = material.criteria.map(c => c.id);
      const examples = new Set([...material.fixtureRun.rows, ...material.agentRun.rows].map(row => row.exampleId));
      if (binding.signal.aborted) throw operation('cancelled', 'Review operation cancelled.');
      if (Date.now() >= binding.deadlineEpochMs) throw operation('timeout', 'Review deadline expired.');
      if (reviews.has(binding.reviewId)) throw operation('budget_exceeded', 'Review call already consumed; explicit retry requires a new review ID.');
      if (reviews.size >= 10000) throw operation('resource_limit', 'Broker lifetime review limit reached.');
      reviews.add(binding.reviewId);
      if (content) {
        // Reuse WP09's grounded evidence prompt and validator with this exact
        // global-profile transport. No second request or evaluator execution.
        const review = createReviewOperation({ complete: async request => JSON.stringify(await dispatch({
          role: 'review', material: { trustedSystem: request.messages[0].content, evidence: JSON.parse(request.messages[1].content) },
          telemetry,
          maxOutputTokens: request.maxOutputTokens, deadlineEpochMs: request.deadlineEpochMs, signal: request.signal,
        })) }, content);
        return review({ ...binding, binding: material.binding, source: material.source, exercise: structuredClone(binding.exercise), fixtureRun: material.fixtureRun, agentRun: material.agentRun });
      }
      const output = await dispatch({ role: 'review', material, telemetry, maxOutputTokens: binding.maxOutputTokens, deadlineEpochMs: binding.deadlineEpochMs, signal: binding.signal });
      result('ReviewAssessment', output);
      const assessment = output as ReviewAssessment;
      if (assessment.findings.some(f => !criterionIds.includes(f.criterionId) || f.exampleIds.some(id => !examples.has(id)))) throw operation('review_output_schema', 'Review finding refers to unknown criteria or examples.');
      return assessment;
    },
  };
}

/** Parse the private Python broker envelope; operational failures never become scores. */
export function parseBrokerResponse(value: unknown): unknown {
  if (!value || typeof value !== 'object') throw operation('protocol_error', 'Invalid broker response.');
  const response = value as { result?: unknown; error?: unknown };
  if (response.error !== undefined && response.result === undefined && Object.keys(response).length === 1 && validateContract('OperationError', response.error).valid) throw new ServiceError(response.error as ServiceError['detail']);
  if (response.result !== undefined && response.error === undefined && Object.keys(response).length === 1) return response.result;
  throw operation('protocol_error', 'Invalid broker response envelope.');
}
