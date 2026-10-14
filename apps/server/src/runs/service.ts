import { randomUUID } from 'node:crypto';
import { LIMITS, validateContract, validateDomain, type Dataset, type EvalInput, type Exercise, type OperationError, type RowResult, type RunRecord, type RunRequest } from '@evals-tutorial/contracts';
import { canonicalJson, datasetHash, sha256 } from '@evals-tutorial/contracts/node';
import { ServiceError, type RunService } from '@evals-tutorial/contracts/services';
import type { IsolatedExecutor } from '@evals-tutorial/evaluator-runtime';
import type { DockerValidationService } from '../validation/index.js';
import { evaluateRow } from '../runner/index.js';
import type { RunnerServiceOptions } from './index.js';
import { ReceiptStore } from './store.js';

const terminal = new Set<RunRecord['status']>(['invalid', 'cancelled', 'completed', 'partial', 'failed', 'timed_out']);
const error = (code: OperationError['code'], message: string, httpStatus = 400) => new ServiceError({ code, message, retryable: false }, httpStatus);
const detail = (reason: unknown): OperationError => reason instanceof ServiceError ? reason.detail : { code: 'internal_error', message: 'Run operation failed', retryable: false };
type Entry = { record: RunRecord; controller: AbortController; exercise?: Exercise; dataset?: Dataset; timedOut?: boolean };
type Task = { example: Dataset['examples'][number]; fixture?: Dataset['examples'][number]['fixtures'][number] };

/** Observers receive copies; only append-only host receipts are authoritative. */
export class RunServiceImpl implements RunService {
  private readonly entries = new Map<string, Entry>();
  private readonly requests = new Map<string, string>();
  private readonly queue: Entry[] = [];
  private readonly store: ReceiptStore;
  private readonly ready: Promise<void>;
  private readonly isolationReady: Promise<void>;
  private serial: Promise<unknown> = Promise.resolve();
  private active?: Promise<void>;
  private closed = false;
  private readonly options: RunnerServiceOptions;
  constructor(options: RunnerServiceOptions, private readonly executor: IsolatedExecutor, private readonly validation: DockerValidationService) {
    this.options = { ...options, ...(options.provider ? { provider: structuredClone(options.provider) } : {}) };
    if (!/^[a-f0-9]{40}$/.test(options.repositoryRevision) || !/^[a-f0-9]{64}$/.test(options.dependencyLockHash) || options.imageDigest !== executor.imageDigest) throw error('configuration', 'Exact repository, dependency and runner provenance is required');
    this.store = new ReceiptStore(options.receiptDirectory);
    this.ready = this.recover();
    // Free startup preflight also reaps abandoned containers for this receipt session.
    this.isolationReady = this.executor.available();
    void this.isolationReady.catch(() => {});
  }
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const next = this.serial.then(action); this.serial = next.catch(() => {}); return next;
  }
  private async recover(): Promise<void> {
    const records = await this.store.load();
    for (const record of records) {
      if (this.requests.has(record.request.requestId)) throw new Error('Duplicate stored request ID');
      const entry = { record, controller: new AbortController() };
      this.entries.set(record.runId, entry); this.requests.set(record.request.requestId, record.runId);
      if (!terminal.has(record.status)) {
        // Never repeat paid work after restart; retain all already completed rows.
        entry.record = { ...record, status: 'cancelled', updatedAt: new Date().toISOString(), error: { code: 'cancelled', message: 'Server restarted during the run; use a new request ID to retry', retryable: false } };
        await this.store.append(entry.record);
      }
    }
  }
  private async update(entry: Entry, change: (record: RunRecord) => void): Promise<void> {
    await this.exclusive(async () => {
      const record = structuredClone(entry.record); change(record); record.updatedAt = new Date().toISOString();
      await this.store.append(record); entry.record = record;
    });
  }
  async create(request: RunRequest): Promise<{ runId: string }> {
    await this.ready;
    if (!validateContract('RunRequest', request).valid) throw error('invalid_request', 'Invalid run request');
    const snapshot = structuredClone(request);
    const accepted = await this.exclusive(async () => {
      const existing = this.requests.get(snapshot.requestId);
      if (existing) {
        if (canonicalJson(this.entries.get(existing)!.record.request) !== canonicalJson(snapshot)) throw error('conflict', 'Request ID already belongs to a different payload', 409);
        return { runId: existing };
      }
      if (this.closed) throw error('cancelled', 'Runner is shutting down', 503);
      await this.isolationReady;
      if (this.entries.size >= Math.min(this.options.maxRetainedRuns ?? 128, 128)) throw error('resource_limit', 'Retained run capacity reached; preserve receipts before starting a fresh session', 429);
      const tutorial = await this.options.content.tutorial();
      const exercise = structuredClone(await this.options.content.exercise(snapshot.snapshot.exerciseId));
      const dataset = structuredClone(await this.options.content.dataset(exercise.id));
      if (!validateContract('Exercise', exercise).valid || !validateContract('Dataset', dataset).valid || datasetHash(dataset) !== dataset.contentHash) throw error('source_stale', 'Installed content is not verified', 409);
      const submitted = snapshot.snapshot;
      if (submitted.tutorialVersion !== tutorial.tutorialVersion || submitted.exerciseVersion !== exercise.exerciseVersion || submitted.rubricVersion !== exercise.rubricVersion || submitted.datasetId !== exercise.datasetId || submitted.datasetVersion !== exercise.datasetVersion || submitted.datasetHash !== exercise.datasetHash || dataset.datasetId !== submitted.datasetId || dataset.datasetVersion !== submitted.datasetVersion || dataset.contentHash !== submitted.datasetHash || (exercise.readOnly && submitted.source !== exercise.starterSource)) throw error('source_stale', 'Source snapshot does not match installed content', 409);
      if (!exercise.agentVariants.includes(snapshot.agentVariant)) throw error('invalid_request', 'Agent variant is not installed');
      const totalRows = snapshot.mode === 'agent' ? dataset.examples.length : dataset.examples.reduce((sum, item) => sum + item.fixtures.length, 0);
      if (totalRows < 1 || totalRows > Math.min(this.options.maxRows ?? 64, 64)) throw error('resource_limit', 'Run row count is outside the bounded limit');
      const now = new Date().toISOString();
      const runId = randomUUID(); const codeHash = sha256(submitted.source);
      const record: RunRecord = { schemaVersion: '1.0.0', runId, request: snapshot, codeHash, status: 'queued', telemetryStatus: 'not_requested', createdAt: now, updatedAt: now, totalRows, completedRows: 0, rows: [], diagnostics: [], provenance: { codeHash, datasetHash: dataset.contentHash, repositoryRevision: this.options.repositoryRevision, dependencyLockHash: this.options.dependencyLockHash, runnerImageDigest: this.executor.imageDigest, ...(this.options.provider ? { provider: this.options.provider } : {}) } };
      await this.store.append(record);
      const entry: Entry = { record, controller: new AbortController(), exercise, dataset };
      this.entries.set(runId, entry); this.requests.set(snapshot.requestId, runId); this.queue.push(entry);
      return { runId };
    });
    this.pump(); return accepted;
  }
  private pump(): void {
    if (this.active || this.closed) return;
    const next = this.queue.shift(); if (!next) return;
    this.active = this.execute(next).catch(async reason => {
      if (!terminal.has(next.record.status)) await this.update(next, record => { record.status = 'failed'; record.error = detail(reason); });
    }).finally(() => { this.active = undefined; this.pump(); });
    // A disk error must remain observable through shutdown, without an unhandled rejection.
    void this.active.catch(() => { this.closed = true; });
  }
  private async execute(entry: Entry): Promise<void> {
    if (terminal.has(entry.record.status)) return;
    const { controller, exercise, dataset } = entry;
    const deadlineEpochMs = Date.now() + Math.min(this.options.runTimeoutMs ?? LIMITS.runTimeoutMs, LIMITS.runTimeoutMs);
    const timer = setTimeout(() => { entry.timedOut = true; controller.abort(); }, Math.max(1, deadlineEpochMs - Date.now()));
    const tasks: Task[] = dataset!.examples.flatMap(example => entry.record.request.mode === 'agent' ? [{ example }] : example.fixtures.map(fixture => ({ example, fixture })));
    try {
      await this.update(entry, record => { record.status = 'validating'; });
      const compiled = await this.validation.compile(entry.record.request.snapshot, controller.signal);
      if (controller.signal.aborted) throw error('cancelled', 'Run was cancelled');
      if (!compiled.valid) {
        await this.update(entry, record => { record.status = 'invalid'; record.diagnostics = compiled.diagnostics; record.error = { code: 'validation_failed', message: 'Evaluator has syntax or type errors', retryable: false }; }); return;
      }
      if (!compiled.javascript || compiled.codeHash !== entry.record.codeHash) throw error('protocol_error', 'Compiler artifact does not match source snapshot');
      // Isolation preflight is deliberately before any agent or judge request.
      await this.executor.available(controller.signal);
      await this.update(entry, record => { record.status = 'running'; });
      let cursor = 0;
      const work = async () => {
        while (cursor < tasks.length && !controller.signal.aborted) {
          const task = tasks[cursor++]!;
          const row = await this.row(entry, task, compiled.javascript!, exercise!, deadlineEpochMs);
          await this.update(entry, record => {
            record.rows.push(row); record.completedRows = record.rows.filter(item => item.status === 'completed').length;
          });
        }
      };
      const workers = Array.from({ length: Math.min(LIMITS.rowConcurrency, tasks.length) }, work);
      try { await Promise.all(workers); }
      catch (reason) { controller.abort(); await Promise.allSettled(workers); throw reason; }
      const missing = tasks.filter(task => !entry.record.rows.some(row => row.exampleId === task.example.id && row.fixtureId === task.fixture?.id));
      await this.update(entry, record => {
        if (controller.signal.aborted) {
          const code = entry.timedOut ? 'timeout' : 'cancelled';
          for (const task of missing) record.rows.push({ exampleId: task.example.id, ...(task.fixture ? { fixtureId: task.fixture.id } : {}), status: entry.timedOut ? 'timed_out' : 'cancelled', error: { code, message: 'Row did not complete before cancellation', retryable: false } });
          record.status = entry.timedOut ? 'timed_out' : 'cancelled'; record.error = { code, message: entry.timedOut ? 'Run deadline exceeded' : 'Run was cancelled', retryable: false };
        } else record.status = record.completedRows === record.totalRows ? 'completed' : record.completedRows ? 'partial' : 'failed';
      });
    } catch (reason) {
      await this.update(entry, record => {
        record.status = controller.signal.aborted ? entry.timedOut ? 'timed_out' : 'cancelled' : 'failed';
        record.error = entry.timedOut ? { code: 'timeout', message: 'Run deadline exceeded', retryable: false } : detail(reason);
        if (controller.signal.aborted) for (const task of tasks) if (!record.rows.some(row => row.exampleId === task.example.id && row.fixtureId === task.fixture?.id)) record.rows.push({ exampleId: task.example.id, ...(task.fixture ? { fixtureId: task.fixture.id } : {}), status: entry.timedOut ? 'timed_out' : 'cancelled', error: record.error });
      });
    } finally { clearTimeout(timer); }
  }
  private async row(entry: Entry, task: Task, javascript: string, exercise: Exercise, deadlineEpochMs: number): Promise<RowResult> {
    const base = { exampleId: task.example.id, ...(task.fixture ? { fixtureId: task.fixture.id } : {}) };
    const rowController = new AbortController();
    const abort = () => rowController.abort(); entry.controller.signal.addEventListener('abort', abort, { once: true });
    if (entry.controller.signal.aborted) abort();
    const timer = setTimeout(abort, Math.max(1, Math.min(deadlineEpochMs - Date.now(), LIMITS.judgeTimeoutMs + LIMITS.providerTimeoutMs)));
    let output = task.fixture?.output;
    let traceId: string | undefined;
    try {
      if (!validateDomain(exercise.inputSchema, task.example.input).valid || !validateDomain(exercise.expectedSchema, task.example.expected).valid) throw error('invalid_request', 'Row violates the installed input/reference schema');
      if (!output) {
        if (!this.options.agent) throw error('provider_unavailable', 'Agent service is unavailable', 503);
        if (entry.dataset!.documentManifestRef && !this.options.resolveDocuments) throw error('unsupported_media', 'Verified document resolver is unavailable', 503);
        const documents = await this.options.resolveDocuments?.({ exerciseId: exercise.id, input: structuredClone(task.example.input) }) ?? [];
        const trace = await this.options.createTelemetryContext?.(entry.record.runId, task.example.id, task.fixture?.id) ?? {};
        const agentRequest = { schemaVersion: '1.0.0' as const, runId: entry.record.runId, exampleId: task.example.id, exerciseId: exercise.id, agentVariant: entry.record.request.agentVariant, input: structuredClone(task.example.input), documents, ...(trace.traceparent ? { traceparent: trace.traceparent } : {}), ...(trace.tracestate ? { tracestate: trace.tracestate } : {}), deadlineMs: Math.max(1, Math.min(deadlineEpochMs - Date.now(), LIMITS.providerTimeoutMs)) };
        if (!validateContract('AgentRequest', agentRequest).valid) throw error('invalid_request', 'Trusted agent context is invalid');
        if (rowController.signal.aborted) throw error('cancelled', 'Row was cancelled');
        const agentSignal = AbortSignal.any([rowController.signal, AbortSignal.timeout(agentRequest.deadlineMs)]);
        let response;
        try { response = await this.bounded(this.options.agent.invoke(agentRequest, agentSignal), agentSignal); }
        catch (reason) { if (agentSignal.aborted && !rowController.signal.aborted) throw error('timeout', 'Agent deadline exceeded'); throw reason; }
        if (!validateContract('AgentResponse', response).valid || response.runId !== entry.record.runId || response.exampleId !== task.example.id) throw error('agent_output_schema', 'Agent response does not match its request');
        if (response.status === 'failed') throw new ServiceError(response.error);
        output = response.output;
        traceId = response.traceId;
        await this.update(entry, record => {
          const existing = record.provenance;
          if (existing.agentVersion && (existing.agentVersion !== response.agentVersion || existing.agentSourceHash !== response.sourceHash || existing.promptHash !== response.promptHash)) throw error('source_stale', 'Agent version changed within the run');
          Object.assign(existing, { agentVersion: response.agentVersion, agentSourceHash: response.sourceHash, promptHash: response.promptHash });
        });
      }
      if (!validateDomain(exercise.outputSchema, output).valid) throw error('agent_output_schema', 'Output violates the installed domain schema');
      const input: EvalInput = { input: task.example.input, output, expected: task.example.expected, metadata: { exampleId: task.example.id, exerciseId: exercise.id, datasetVersion: entry.dataset!.datasetVersion } };
      const evaluation = await evaluateRow(this.executor, javascript, entry.record.runId, input, exercise, this.options.judge, rowController.signal, Math.min(deadlineEpochMs, Date.now() + (exercise.mode === 'Code' ? LIMITS.codeTimeoutMs : LIMITS.judgeTimeoutMs)));
      if (rowController.signal.aborted) throw error('cancelled', 'Row was cancelled');
      if (!validateContract('EvalResult', evaluation).valid) throw error('protocol_error', 'Evaluator returned an invalid result');
      const expectation = task.fixture?.expectedEvaluation;
      if (expectation && expectation.minScore > expectation.maxScore) throw error('invalid_request', 'Fixture expectation interval is invalid');
      return { ...base, status: 'completed', output: structuredClone(output), evaluation, ...(traceId ? { phoenix: { traceId } } : {}), ...(expectation ? { fixtureMatched: expectation.allowedLabels.includes(evaluation.label) && evaluation.score >= expectation.minScore && evaluation.score <= expectation.maxScore && expectation.requiredEvidence.every(item => evaluation.explanation.includes(item)) } : {}) };
    } catch (reason) {
      const failure = entry.controller.signal.aborted ? { code: entry.timedOut ? 'timeout' as const : 'cancelled' as const, message: 'Row was cancelled', retryable: false } : rowController.signal.aborted ? { code: 'timeout' as const, message: 'Row deadline exceeded', retryable: false } : detail(reason);
      return { ...base, status: failure.code === 'cancelled' ? 'cancelled' : failure.code === 'timeout' ? 'timed_out' : 'failed', ...(output ? { output: structuredClone(output) } : {}), ...(traceId ? { phoenix: { traceId } } : {}), error: failure };
    } finally { clearTimeout(timer); entry.controller.signal.removeEventListener('abort', abort); }
  }
  private async bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) throw error('cancelled', 'Operation was cancelled');
    let abort: () => void = () => {};
    try { return await Promise.race([operation, new Promise<never>((_, reject) => { abort = () => reject(error('cancelled', 'Operation was cancelled')); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); })]); }
    finally { signal.removeEventListener('abort', abort); }
  }
  async get(runId: string): Promise<RunRecord> {
    await this.ready; const entry = this.entries.get(runId); if (!entry) throw error('not_found', 'Run not found', 404); return structuredClone(entry.record);
  }
  async cancel(runId: string): Promise<RunRecord> {
    await this.ready; const entry = this.entries.get(runId); if (!entry) throw error('not_found', 'Run not found', 404);
    if (!terminal.has(entry.record.status)) {
      entry.controller.abort();
      await this.update(entry, record => { if (!terminal.has(record.status)) { record.status = 'cancelling'; record.error = { code: 'cancelled', message: 'Run cancellation requested', retryable: false }; } });
      if (this.queue.includes(entry)) await this.update(entry, record => { record.status = 'cancelled'; });
    }
    return structuredClone(entry.record);
  }
  async shutdown(): Promise<void> {
    await this.ready; this.closed = true;
    for (const entry of this.entries.values()) if (!terminal.has(entry.record.status)) await this.cancel(entry.record.runId);
    await this.active;
    await this.executor.shutdown();
  }
}
