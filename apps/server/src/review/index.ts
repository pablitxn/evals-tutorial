import { randomUUID } from 'node:crypto';
import { validateContract } from '@evals-tutorial/contracts';
import type { OperationError, ProviderSummary, ReviewRecord, ReviewRequest } from '@evals-tutorial/contracts';
import { canonicalJson, reviewBindingHash } from '@evals-tutorial/contracts/node';
import { ServiceError } from '@evals-tutorial/contracts/services';
import type { ContentService, ProviderBroker, ReviewBrokerBinding, ReviewService, RunService } from '@evals-tutorial/contracts/services';
import { deriveReviewBinding, REVIEW_LIMITS, validateReviewAssessment } from '@evals-tutorial/review';
import type { ReviewEvidence } from '@evals-tutorial/review';

export interface ReviewServiceDependencies {
  content: Pick<ContentService, 'tutorial' | 'exercise' | 'dataset'>;
  runs: Pick<RunService, 'get'>;
  broker: Pick<ProviderBroker, 'review'>;
  /** Non-secret global profile; reads must not perform inference. */
  provider(): ProviderSummary | Promise<ProviderSummary>;
  timeoutMs?: number;
  maxStoredReviews?: number;
}

export interface ReviewServices {
  reviews: ReviewService;
  /** Call during application shutdown; no change to the frozen HTTP ReviewService. */
  shutdown(): void;
}

interface Entry { record: ReviewRecord; controller: AbortController }

/** In-memory local-session receipts; all reads and broker inputs are defensive copies. */
export function createReviewServices(deps: ReviewServiceDependencies): ReviewServices {
  const timeoutMs = deps.timeoutMs ?? REVIEW_LIMITS.timeoutMs;
  const maxStored = deps.maxStoredReviews ?? 256;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > REVIEW_LIMITS.timeoutMs ||
    !Number.isInteger(maxStored) || maxStored < 1 || maxStored > 1024) throw new Error('Invalid review service limits');
  const records = new Map<string, Entry>();
  const requests = new Map<string, { fingerprint: string; promise: Promise<{ reviewId: string }> }>();
  let accepting = true;

  async function load(request: ReviewRequest): Promise<ReviewEvidence> {
    const [tutorial, exercise, dataset, fixtureRun, agentRun, provider] = await Promise.all([
      deps.content.tutorial(), deps.content.exercise(request.snapshot.exerciseId), deps.content.dataset(request.snapshot.exerciseId),
      deps.runs.get(request.fixtureRunId), deps.runs.get(request.agentRunId), deps.provider(),
    ]);
    return structuredClone({ request, tutorialVersion: tutorial.tutorialVersion, exercise, dataset, fixtureRun, agentRun, provider });
  }

  function find(reviewId: string): Entry {
    const entry = records.get(reviewId);
    if (!entry) throw new ServiceError({ code: 'not_found', message: 'Review not found.', retryable: false }, 404);
    return entry;
  }
  function active(entry: Entry): boolean { return entry.record.status === 'pending' || entry.record.status === 'running'; }
  function fail(entry: Entry, error: OperationError): void {
    if (!active(entry)) return;
    entry.record = { ...entry.record, status: error.code === 'cancelled' ? 'cancelled' : 'failed',
      updatedAt: new Date().toISOString(), error };
    entry.controller.abort();
  }
  async function execute(entry: Entry, evidence: ReviewEvidence): Promise<void> {
    if (!active(entry)) return;
    entry.record.status = 'running';
    entry.record.updatedAt = new Date().toISOString();
    const deadlineEpochMs = Date.now() + timeoutMs;
    const timer = setTimeout(() => fail(entry, { code: 'timeout', message: 'Review deadline exceeded.', retryable: true }), timeoutMs);
    const material: ReviewBrokerBinding = { reviewId: entry.record.reviewId, feedbackLocale: entry.record.feedbackLocale, binding: structuredClone(entry.record.binding),
      exercise: structuredClone(evidence.exercise), source: evidence.request.snapshot.source,
      fixtureRun: structuredClone(evidence.fixtureRun), agentRun: structuredClone(evidence.agentRun),
      maxOutputTokens: REVIEW_LIMITS.outputTokens, deadlineEpochMs, signal: entry.controller.signal };
    try {
      // The broker has no reference to any source compiler, runner or agent invocation service.
      const raw = await deps.broker.review(material);
      if (!active(entry)) return;
      const assessment = validateReviewAssessment(raw, { ...material, exercise: evidence.exercise,
        source: evidence.request.snapshot.source, fixtureRun: evidence.fixtureRun, agentRun: evidence.agentRun });
      let freshBinding;
      try { freshBinding = deriveReviewBinding(await load(evidence.request)); }
      catch {
        fail(entry, { code: 'source_stale', message: 'Review evidence could not be revalidated after provider completion.', retryable: true });
        return;
      }
      if (!active(entry)) return;
      if (Date.now() >= deadlineEpochMs) {
        fail(entry, { code: 'timeout', message: 'Review deadline exceeded.', retryable: true });
      } else if (reviewBindingHash(freshBinding) !== entry.record.bindingHash) {
        fail(entry, { code: 'source_stale', message: 'Review evidence changed while the review was pending.', retryable: true });
      } else {
        entry.record = { ...entry.record, status: assessment.status, assessment, updatedAt: new Date().toISOString() };
      }
    } catch (error) {
      // Only whitelisted error codes survive; provider messages may expose credentials or payloads.
      const detail = error instanceof ServiceError ? error.detail : undefined;
      const code = detail?.code === 'review_ineligible' ? 'source_stale' : detail?.code;
      const messages = { source_stale: 'Review evidence changed while the review was pending.',
        review_output_schema: 'The provider returned invalid review feedback.', provider_refusal: 'The review provider declined this request.',
        provider_unavailable: 'The review provider is unavailable.', timeout: 'Review deadline exceeded.',
        cancelled: 'Review cancelled.', budget_exceeded: 'Review budget exceeded.', resource_limit: 'Review evidence exceeds resource limits.',
        configuration: 'The review provider configuration is unavailable.' } as const;
      if (code && code in messages) {
        const safeCode = code as keyof typeof messages;
        fail(entry, { code: safeCode, message: messages[safeCode], retryable: !['budget_exceeded', 'resource_limit'].includes(safeCode) });
      } else fail(entry, { code: 'provider_unavailable', message: 'The review provider is unavailable.', retryable: true });
    } finally { clearTimeout(timer); }
  }

  const reviews: ReviewService = {
    async create(input) {
      if (!validateContract('ReviewRequest', input).valid) throw new ServiceError({ code: 'invalid_request', message: 'Invalid review request.', retryable: false });
      const request = structuredClone(input);
      const fingerprint = canonicalJson(request);
      const existing = requests.get(request.requestId);
      if (existing) {
        if (fingerprint !== existing.fingerprint) throw new ServiceError({ code: 'conflict', message: 'Request ID already belongs to another review payload.', retryable: false }, 409);
        return { ...await existing.promise };
      }
      if (!accepting) throw new ServiceError({ code: 'cancelled', message: 'Review service is shutting down.', retryable: true }, 503);
      if (requests.size >= maxStored) throw new ServiceError({ code: 'resource_limit', message: 'Review receipt capacity reached; preserve receipts and restart the local session.', retryable: false }, 429);
      // Reserve before awaiting host reads so concurrent duplicate creates cannot infer twice.
      const promise = (async () => {
        const evidence = await load(request);
        const binding = deriveReviewBinding(evidence);
        if (!accepting) throw new ServiceError({ code: 'cancelled', message: 'Review service is shutting down.', retryable: true }, 503);
        if ([...records.values()].some(active)) throw new ServiceError({ code: 'resource_limit', message: 'Another review is active; wait or cancel it first.', retryable: true }, 429);
        const reviewId = randomUUID();
        const timestamp = new Date().toISOString();
        const entry: Entry = { controller: new AbortController(), record: { schemaVersion: '1.0.0', reviewId,
          requestId: request.requestId, feedbackLocale: request.feedbackLocale ?? 'en', bindingHash: reviewBindingHash(binding), binding,
          status: 'pending', createdAt: timestamp, updatedAt: timestamp } };
        records.set(reviewId, entry);
        setImmediate(() => { void execute(entry, evidence); });
        return { reviewId };
      })();
      requests.set(request.requestId, { fingerprint, promise });
      try { return { ...await promise }; }
      catch (error) { requests.delete(request.requestId); throw error; }
    },
    async get(reviewId) { return structuredClone(find(reviewId).record); },
    async cancel(reviewId) {
      const entry = find(reviewId);
      fail(entry, { code: 'cancelled', message: 'Review cancelled.', retryable: true });
      return structuredClone(entry.record);
    },
  };
  return { reviews, shutdown() {
    accepting = false;
    for (const entry of records.values()) fail(entry, { code: 'cancelled', message: 'Review service stopped.', retryable: true });
  } };
}
