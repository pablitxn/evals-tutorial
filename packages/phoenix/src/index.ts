import { createClient, HttpError, type PhoenixClient, type Types } from '@arizeai/phoenix-client';
import { getDatasetUrl, getExperimentUrl } from '@arizeai/phoenix-client/utils/urlUtils';
import type { Dataset, PhoenixLinks, RowResult, RunRecord } from '@evals-tutorial/contracts';
import { validateContract } from '@evals-tutorial/contracts';
import { canonicalJson, datasetHash, sha256 } from '@evals-tutorial/contracts/node';
import { ServiceError, type TelemetryService } from '@evals-tutorial/contracts/services';
import { setTimeout as delay } from 'node:timers/promises';
import { createTelemetryContext } from './context.js';
import { RecordingState, unavailable } from './state.js';
export { createTelemetryContext } from './context.js';

type Schemas = Types['V1']['components']['schemas'];
type Experiment = Schemas['Experiment'];
type ExperimentRun = Schemas['ExperimentRun'];
type Span = Schemas['Span'];
type Receipt = { fingerprint: string; experimentId?: string; createAttempted?: boolean };
type Pin = { contentHash: string; datasetId: string; versionId: string };
type Projection = { id: string; input: Record<string, unknown>; output: Record<string, unknown>; metadata: Record<string, unknown>; exampleId: string; fixtureId?: string };
type Annotation = { name: string; score: number; label: string; explanation: string };

function annotations(row: RowResult, mode: RunRecord['request']['mode'], expanded: boolean): Annotation[] {
  if (!row.evaluation) return [];
  const { score, label, explanation, criteria } = row.evaluation;
  const result: Annotation[] = [{ name: 'tutorial_result', score, label, explanation }];
  if (expanded) {
    result.push(...(criteria ?? []).map(criterion => ({
      name: `tutorial_criterion_${criterion.criterionId}`,
      score: criterion.score, label: criterion.label, explanation: criterion.explanation,
    })));
    if (mode === 'fixtures' && typeof row.fixtureMatched === 'boolean') {
      result.push({ name: 'tutorial_fixture_match', score: row.fixtureMatched ? 1 : 0,
        label: row.fixtureMatched ? 'matched' : 'mismatched',
        explanation: row.fixtureMatched
          ? 'The evaluator result matches this known fixture expectation, including any expected rejection.'
          : 'The evaluator result does not match this known fixture expectation.' });
    }
  }
  return result;
}

export interface PhoenixTelemetryOptions {
  /** Explicit loopback origin. Ambient Phoenix/provider env is never read. */
  baseUrl: string;
  /** Persistent private directory, shared by every adapter targeting this origin. */
  stateDirectory: string;
  /** Project into which the producer exports its real Node/Python spans. */
  sourceProjectName?: string;
  requestTimeoutMs?: number;
  maxRecordingMs?: number;
  /** Test transport; omit in production. */
  fetch?: typeof globalThis.fetch;
}

function need(condition: unknown, message = 'Phoenix read-back did not match the immutable receipt'): asserts condition {
  if (!condition) throw unavailable(message);
}
function invalid(message: string): never {
  throw new ServiceError({ code: 'invalid_request', message, retryable: false });
}
function data<T>(response: { data?: { data: T } | null }): T {
  need(response.data && typeof response.data === 'object' && response.data.data !== undefined);
  return response.data.data;
}
function equal(a: unknown, b: unknown): boolean { return canonicalJson(a) === canonicalJson(b); }

function validate(dataset: Dataset, run: RunRecord): void {
  if (!validateContract('Dataset', dataset).valid || !validateContract('RunRecord', run).valid) invalid('Invalid telemetry contract');
  if (datasetHash(dataset) !== dataset.contentHash) invalid('Dataset content hash mismatch');
  const snapshot = run.request.snapshot;
  if (snapshot.datasetId !== dataset.datasetId || snapshot.datasetVersion !== dataset.datasetVersion ||
      snapshot.datasetHash !== dataset.contentHash || run.provenance.datasetHash !== dataset.contentHash ||
      run.codeHash !== sha256(snapshot.source) || run.provenance.codeHash !== run.codeHash) invalid('Run snapshot does not match dataset/source');
  if (!['completed', 'partial', 'failed', 'cancelled', 'timed_out'].includes(run.status)) invalid('Only terminal execution receipts can be recorded');
  if (!Number.isFinite(Date.parse(run.createdAt)) || !Number.isFinite(Date.parse(run.updatedAt)) || Date.parse(run.updatedAt) < Date.parse(run.createdAt)) invalid('Invalid run time interval');
  const examples = new Map(dataset.examples.map(example => [example.id, example]));
  if (examples.size !== dataset.examples.length) invalid('Duplicate dataset example IDs');
  if (dataset.examples.some(example => new Set(example.fixtures.map(fixture => fixture.id)).size !== example.fixtures.length)) invalid('Duplicate fixture IDs');
  const rows = new Set<string>();
  for (const row of run.rows) {
    const example = examples.get(row.exampleId);
    const key = canonicalJson([row.exampleId, row.fixtureId ?? null]);
    if (!example || rows.has(key)) invalid('Unknown or duplicate recording row');
    rows.add(key);
    if (run.request.mode === 'fixtures' ? !example.fixtures.some(f => f.id === row.fixtureId) : row.fixtureId !== undefined) invalid('Row mode/fixture identity mismatch');
    if (row.status === 'completed' ? !row.output || !row.evaluation || row.error : !!row.evaluation || !row.error) invalid('Operational errors and normalized scores must stay separate');
    if (row.evaluation) {
      const { label, score } = row.evaluation;
      if (label === 'pass' ? score !== 1 : label === 'fail' ? score !== 0 : score <= 0 || score >= 1) invalid('Evaluation score and label disagree');
    }
  }
  const total = run.request.mode === 'agent' ? dataset.examples.length : dataset.examples.reduce((n, example) => n + example.fixtures.length, 0);
  if (run.totalRows !== total || run.completedRows !== run.rows.filter(row => row.status === 'completed').length || run.rows.length > total) invalid('Run row counts disagree');
  if (run.status === 'completed' && (run.rows.length !== total || run.completedRows !== total)) invalid('Completed run has missing rows');
}

/** Expand fixture identities into separate Phoenix examples, retaining the exact
 * input/reference and full canonical Dataset identity in metadata. Agent datasets
 * contain only the original examples. No fixture output is used as a reference.
 */
function project(dataset: Dataset, mode: RunRecord['request']['mode']): Projection[] {
  return dataset.examples.flatMap(example => {
    const ids = mode === 'agent' ? [undefined] : example.fixtures.map(fixture => fixture.id);
    return ids.map(fixtureId => ({
      id: fixtureId === undefined ? example.id : sha256(canonicalJson([example.id, fixtureId])),
      input: example.input, output: example.expected, exampleId: example.id,
      ...(fixtureId === undefined ? {} : { fixtureId }),
      metadata: { tutorial_dataset_id: dataset.datasetId, tutorial_dataset_version: dataset.datasetVersion,
        tutorial_dataset_hash: dataset.contentHash, tutorial_example_id: example.id, tutorial_mode: mode,
        ...(fixtureId === undefined ? {} : { tutorial_fixture_id: fixtureId }) },
    }));
  });
}

function fingerprint(run: RunRecord): string {
  // Recording status/links/timestamps may change on retry; inference evidence may not.
  const { telemetryStatus: _status, phoenix: _links, updatedAt: _time, rows, ...rest } = run;
  return sha256(canonicalJson({ ...rest, rows: rows.map(({ phoenix, ...row }) => ({ ...row,
    ...(run.request.mode === 'agent' && row.status === 'completed' && phoenix?.traceId ? { producerTraceId: phoenix.traceId } : {}) })) }));
}

function clientFor(options: PhoenixTelemetryOptions, signal: AbortSignal): PhoenixClient {
  const implementation = options.fetch ?? globalThis.fetch;
  const boundedFetch: typeof fetch = async (input, init) => {
    signal.throwIfAborted();
    const response = await implementation(input, { ...init, redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(options.requestTimeoutMs ?? 10000)]) });
    if (response.ok && new URL(response.url || (input instanceof Request ? input.url : String(input))).pathname.startsWith('/v1/')) {
      need(response.headers.get('content-type')?.includes('/json') || response.headers.get('content-type')?.includes('text/csv'), 'Phoenix returned an unexpected API content type');
    }
    // Bound actual response bytes rather than trusting Content-Length.
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    if (reader) {
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          bytes += part.value.length;
          need(bytes <= 8 * 1024 * 1024, 'Phoenix response exceeds recording limit');
          chunks.push(part.value);
        }
      } finally { await reader.cancel(); }
    }
    return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
  };
  return createClient({ getEnvironmentOptions: () => ({}), options: { baseUrl: options.baseUrl, fetch: boundedFetch } });
}

async function importDataset(client: PhoenixClient, state: RecordingState, originKey: string, dataset: Dataset, mode: RunRecord['request']['mode'], projection: Projection[]): Promise<{ pin: Pin; exampleNodes: Map<string, string> }> {
  const journalKey = `dataset-${sha256(canonicalJson([originKey, dataset.datasetId, dataset.datasetVersion, mode]))}`;
  let pin = await state.read<Pin>(journalKey);
  if (pin && pin.contentHash !== dataset.contentHash) throw new ServiceError({ code: 'conflict', message: 'Dataset version was reused with different content', retryable: false }, 409);
  if (!pin) {
    const uploaded = data(await client.POST('/v1/datasets/upload', { params: { query: { sync: true } }, body: {
      name: `evals-tutorial:${dataset.datasetId}:${mode}`, description: `Owned synthetic ${mode} projection; no inference`, action: 'update',
      inputs: projection.map(example => example.input), outputs: projection.map(example => example.output),
      metadata: projection.map(example => example.metadata), example_ids: projection.map(example => example.id),
    } }));
    need(typeof uploaded.dataset_id === 'string' && typeof uploaded.version_id === 'string');
    pin = { contentHash: dataset.contentHash, datasetId: uploaded.dataset_id, versionId: uploaded.version_id };
    await state.write(journalKey, pin);
  }
  const persisted = data(await client.GET('/v1/datasets/{id}/examples', { params: {
    path: { id: pin.datasetId }, query: { version_id: pin.versionId },
  } }));
  need(persisted.version_id === pin.versionId && Array.isArray(persisted.examples) && persisted.examples.length === projection.length);
  const exampleNodes = new Map<string, string>();
  for (const expected of projection) {
    const actual = persisted.examples.find(example => example.id === expected.id);
    need(actual && typeof actual.node_id === 'string' && equal(actual.input, expected.input) && equal(actual.output, expected.output) && equal(actual.metadata, expected.metadata));
    exampleNodes.set(expected.id, actual.node_id);
  }
  return { pin, exampleNodes };
}

async function experimentFor(client: PhoenixClient, state: RecordingState, key: string, receipt: Receipt, pin: Pin, run: RunRecord): Promise<Experiment> {
  if (!receipt.experimentId) {
    let cursor: string | null = null;
    const found: Experiment[] = [];
    let pages = 0;
    do {
      need(++pages <= 100, 'Phoenix experiment search limit exceeded');
      const result: { data?: Schemas['ListExperimentsResponseBody'] } = await client.GET('/v1/datasets/{dataset_id}/experiments', { params: { path: { dataset_id: pin.datasetId }, query: { cursor, limit: 100 } } });
      need(Array.isArray(result.data?.data));
      found.push(...result.data.data.filter(experiment => experiment.metadata?.tutorial_recording_key === key));
      cursor = result.data.next_cursor;
    } while (cursor);
    need(found.length <= 1, 'Multiple Phoenix experiments claim the recording key');
    if (found.length) receipt.experimentId = found[0]!.id;
    else {
      // A lost response can mean a committed write. Never blindly repeat create.
      need(!receipt.createAttempted, 'Ambiguous experiment creation; retry read-back or inspect Phoenix');
      receipt.createAttempted = true;
      await state.write(key, receipt);
      const created = data(await client.POST('/v1/datasets/{dataset_id}/experiments', { params: { path: { dataset_id: pin.datasetId } }, body: {
        name: `${run.request.snapshot.exerciseId} | ${run.request.mode} | ${run.request.agentVariant} | ${run.createdAt} | ${run.runId.slice(0, 8)}`,
        version_id: pin.versionId, repetitions: 1,
        description: `Stored ${run.status} execution receipt; recording performs no inference`,
        metadata: { tutorial_recording_key: key, tutorial_fingerprint: receipt.fingerprint,
          tutorial_run_id: run.runId, tutorial_mode: run.request.mode, tutorial_status: run.status,
          tutorial_annotation_version: 2, tutorial_exercise_id: run.request.snapshot.exerciseId,
          tutorial_total_rows: run.totalRows, tutorial_completed_rows: run.completedRows,
          tutorial_provenance: run.provenance, tutorial_exercise_version: run.request.snapshot.exerciseVersion,
          tutorial_rubric_version: run.request.snapshot.rubricVersion, tutorial_agent_variant: run.request.agentVariant },
      } }));
      receipt.experimentId = created.id;
    }
    need(typeof receipt.experimentId === 'string');
    await state.write(key, receipt);
  }
  const experiment = data(await client.GET('/v1/experiments/{experiment_id}', { params: { path: { experiment_id: receipt.experimentId } } }));
  need(experiment.dataset_id === pin.datasetId && experiment.dataset_version_id === pin.versionId &&
    experiment.metadata?.tutorial_fingerprint === receipt.fingerprint && experiment.project_name);
  return experiment;
}

async function listRuns(client: PhoenixClient, experimentId: string): Promise<ExperimentRun[]> {
  const runs: ExperimentRun[] = []; let cursor: string | null = null; let pages = 0;
  do {
    need(++pages <= 100);
    const response: { data?: Schemas['ListExperimentRunsResponseBody'] } = await client.GET('/v1/experiments/{experiment_id}/runs', { params: { path: { experiment_id: experimentId }, query: { cursor, limit: 100 } } });
    need(Array.isArray(response.data?.data)); runs.push(...response.data.data); cursor = response.data.next_cursor;
  } while (cursor);
  return runs;
}

/** Deliberately minimal span attributes. No source, inputs, outputs, explanations,
 * headers, error messages, endpoint settings or environment fields enter spans.
 */
function attributes(run: RunRecord, row: RowResult): Record<string, string | number | boolean> {
  return { 'tutorial.run_id': run.runId, 'tutorial.example_id': row.exampleId,
    'tutorial.mode': run.request.mode, 'tutorial.row_status': row.status,
    'tutorial.code_hash': run.codeHash, 'tutorial.dataset_hash': run.provenance.datasetHash,
    ...(row.fixtureId ? { 'tutorial.fixture_id': row.fixtureId } : {}),
    ...(row.evaluation ? { 'tutorial.score': row.evaluation.score, 'tutorial.label': row.evaluation.label } : {}) };
}

async function spansIn(client: PhoenixClient, project: string, traceId: string, allowMissingProject = false): Promise<Span[]> {
  try {
    const response = await client.GET('/v1/projects/{project_identifier}/spans', { params: {
      path: { project_identifier: project }, query: { trace_id: [traceId], limit: 1000 },
    } });
    need(Array.isArray(response.data?.data) && !response.data.next_cursor, 'Trace is absent or exceeds bounded span count');
    return response.data.data;
  } catch (error) {
    // A terminal error can precede the first producer export (for example, a
    // cancelled row that never started). Other failures must not look like absence.
    if (allowMissingProject && error instanceof HttpError && error.status === 404) return [];
    throw error;
  }
}

async function recordTrace(client: PhoenixClient, options: PhoenixTelemetryOptions, experiment: Experiment, run: RunRecord, row: RowResult, signal: AbortSignal): Promise<{ traceId: string; projectId: string }> {
  const { traceId, spanId } = createTelemetryContext(run.runId, row.exampleId, row.fixtureId);
  const completedAgent = run.request.mode === 'agent' && row.status === 'completed';
  if (completedAgent) need(row.phoenix?.traceId === traceId && options.sourceProjectName, 'Real agent trace context/read-back is required for completed agent rows');
  // Phoenix traces and span IDs are global, including across projects. Preserve
  // producer spans in their actual source project; the experiment result stores
  // their verified trace ID, including failed invocations. An unstarted error row
  // may have no producer spans and gets only a stored-receipt span. Never
  // copy/replay AGENT or LLM spans as new activity.
  // Fixture judges also perform real inference and share this immutable row's
  // context. Keep those spans in the source project when recording their receipt.
  const sourceSpans = options.sourceProjectName
    ? await spansIn(client, options.sourceProjectName, traceId, !completedAgent) : [];
  const usesSourceProject = completedAgent || sourceSpans.length > 0;
  const projectName = usesSourceProject ? options.sourceProjectName! : experiment.project_name!;
  const existing = usesSourceProject ? sourceSpans : await spansIn(client, projectName, traceId);
  if (completedAgent) need(existing.some(span => span.span_kind === 'AGENT') && existing.some(span => span.span_kind === 'LLM'), 'Real agent/model spans are unavailable');
  if (usesSourceProject) {
    const parents = new Map(existing.map(span => [span.context.span_id, span.parent_id]));
    need(parents.size === existing.length, 'Duplicate producer span IDs');
    for (const span of existing) {
      if (span.context.span_id === spanId) continue;
      need(span.context.trace_id === traceId && /^[0-9a-f]{16}$/.test(span.context.span_id), 'Malformed producer trace context');
      // Providers must redact at export. Refuse known credential field names
      // instead of returning a verified link to a credential-bearing trace.
      need(!Object.keys(span.attributes ?? {}).some(key => /authorization|api[._-]?key|password|secret/i.test(key)), 'Producer trace contains a forbidden credential attribute');
      let parent = span.parent_id;
      const visited = new Set<string>([span.context.span_id]);
      while (parent !== spanId) {
        need(parent && !visited.has(parent) && parents.has(parent), 'Agent trace is disconnected from its trusted parent');
        visited.add(parent); parent = parents.get(parent);
      }
    }
  }
  const root: Span = { name: 'Tutorial stored row', context: { trace_id: traceId, span_id: spanId },
    span_kind: 'CHAIN', start_time: run.createdAt, end_time: run.updatedAt,
    status_code: row.status === 'completed' ? 'OK' : 'ERROR', attributes: { ...attributes(run, row),
      'tutorial.span_origin': 'stored_receipt' } };
  const currentRoot = existing.find(span => span.context.span_id === spanId);
  if (!currentRoot) {
    await client.POST('/v1/projects/{project_identifier}/spans', { params: { path: { project_identifier: projectName } }, body: { data: [root] } });
  }
  let persisted: Span[] = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    persisted = await spansIn(client, projectName, traceId);
    if (persisted.some(span => span.context.span_id === spanId)) break;
    await delay(100, undefined, { signal });
  }
  const actual = persisted.find(span => span.context.span_id === spanId);
  need(actual && actual.context.trace_id === traceId && actual.parent_id === null && equal(actual.attributes, root.attributes));
  if (usesSourceProject) need(existing.every(span => persisted.some(actual => actual.context.span_id === span.context.span_id)), 'Producer spans disappeared during recording');
  const actualProject = data(await client.GET('/v1/projects/{project_identifier}', { params: { path: { project_identifier: projectName } } }));
  need(typeof actualProject.id === 'string' && actualProject.name === projectName);
  return { traceId, projectId: actualProject.id };
}

// Phoenix 20.21.3 CSV is the supported evaluation read-back endpoint.
export function parseCsv(text: string): string[][] {
  const result: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); result.push(row); row = []; field = ''; }
    else field += c;
  }
  need(!quoted, 'Malformed Phoenix evaluation CSV');
  if (field || row.length) { row.push(field.replace(/\r$/, '')); result.push(row); }
  return result;
}

async function verifyPage(client: PhoenixClient, url: string): Promise<void> {
  const response = await client.config.fetch!(new Request(url));
  need(response.ok && response.headers.get('content-type')?.includes('text/html') && (await response.text()).includes('<title>Phoenix</title>'), 'Phoenix UI route is unavailable');
}

export function createPhoenixTelemetry(options: PhoenixTelemetryOptions): TelemetryService {
  const origin = new URL(options.baseUrl);
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname) || origin.port !== '6006' ||
      origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) invalid('Phoenix requires an explicit loopback HTTP origin');
  options = { ...options, baseUrl: origin.origin };
  const state = new RecordingState(options.stateDirectory);
  return {
    async record(inputDataset, inputRun, callerSignal) {
      let dataset: Dataset; let run: RunRecord;
      try {
        dataset = structuredClone(inputDataset); run = structuredClone(inputRun);
        validate(dataset, run);
      } catch (error) {
        if (error instanceof ServiceError) throw error;
        invalid('Telemetry requires canonical immutable JSON receipts');
      }
      const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(options.maxRecordingMs ?? 60000)]);
      try {
        return await state.exclusive(signal, async () => {
          const client = clientFor(options, signal);
          const projection = project(dataset, run.request.mode);
          const { pin, exampleNodes } = await importDataset(client, state, options.baseUrl, dataset, run.request.mode, projection);
          const key = `run-${sha256(canonicalJson([options.baseUrl, run.runId]))}`;
          const digest = fingerprint(run);
          let receipt = await state.read<Receipt>(key);
          if (receipt && receipt.fingerprint !== digest) throw new ServiceError({ code: 'conflict', message: 'Run ID was reused with different immutable evidence', retryable: false }, 409);
          receipt ??= { fingerprint: digest };
          await state.write(key, receipt);
          const experiment = await experimentFor(client, state, key, receipt, pin, run);
          // Existing experiments retain their original annotation contract on retry.
          const expandedAnnotations = experiment.metadata?.tutorial_annotation_version === 2;
          const currentRuns = await listRuns(client, experiment.id);
          const rowLinks: Array<{ exampleId: string; fixtureId?: string; phoenix: PhoenixLinks }> = [];
          const verification: Array<{ row: RowResult; nodeId: string }> = [];
          for (const row of run.rows) {
            signal.throwIfAborted();
            const example = projection.find(item => item.exampleId === row.exampleId && item.fixtureId === row.fixtureId)!;
            const nodeId = exampleNodes.get(example.id)!;
            const trace = await recordTrace(client, options, experiment, run, row, signal);
            let task = currentRuns.find(item => item.dataset_example_id === nodeId);
            need(currentRuns.filter(item => item.dataset_example_id === nodeId).length <= 1);
            if (!task) {
              await client.POST('/v1/experiments/{experiment_id}/runs', { params: { path: { experiment_id: experiment.id } }, body: {
                dataset_example_id: nodeId, repetition_number: 1, output: row.output ?? null,
                start_time: run.createdAt, end_time: run.updatedAt, trace_id: trace.traceId,
                error: row.status === 'completed' ? null : `${row.status}:${row.error!.code}`,
              } });
              task = (await listRuns(client, experiment.id)).find(item => item.dataset_example_id === nodeId);
            }
            need(task && task.trace_id === trace.traceId && equal(task.output, row.output ?? null) &&
              (task.error ?? null) === (row.status === 'completed' ? null : `${row.status}:${row.error!.code}`));
            for (const annotation of annotations(row, run.request.mode, expandedAnnotations)) {
              await client.POST('/v1/experiment_evaluations', { body: {
                experiment_run_id: task.id, name: annotation.name, annotator_kind: 'CODE',
                start_time: run.createdAt, end_time: run.updatedAt,
                result: { score: annotation.score, label: annotation.label, explanation: annotation.explanation }, trace_id: trace.traceId,
                metadata: { recorded_from_immutable_receipt: true, mode: run.request.mode,
                  fixtureMatched: row.fixtureMatched ?? null, codeHash: run.codeHash,
                  ...(row.evaluation!.criteria ? { criteria: row.evaluation!.criteria } : {}) },
              } });
            }
            verification.push({ row, nodeId });
            const traceUrl = `${options.baseUrl}/projects/${encodeURIComponent(trace.projectId)}/traces/${trace.traceId}`;
            await verifyPage(client, traceUrl);
            rowLinks.push({ exampleId: row.exampleId, ...(row.fixtureId ? { fixtureId: row.fixtureId } : {}),
              phoenix: { datasetId: pin.datasetId, datasetVersionId: pin.versionId, experimentId: experiment.id, traceId: trace.traceId, traceUrl } });
          }
          const csv = await client.GET('/v1/experiments/{experiment_id}/csv', { params: { path: { experiment_id: experiment.id } }, parseAs: 'text' });
          need(typeof csv.data === 'string');
          const [header, ...csvRows] = parseCsv(csv.data);
          need(header);
          for (const entry of verification.filter(entry => entry.row.evaluation)) {
            const values = csvRows.find(values => values[header.indexOf('example_id')] === entry.nodeId && values[header.indexOf('repetition_number')] === '1');
            for (const annotation of annotations(entry.row, run.request.mode, expandedAnnotations)) {
              const prefix = `annotation_${annotation.name}`;
              const score = values?.[header.indexOf(`${prefix}_score`)];
              need(values && score !== undefined && score !== '' && Number(score) === annotation.score &&
                values[header.indexOf(`${prefix}_label`)] === annotation.label &&
                values[header.indexOf(`${prefix}_explanation`)] === annotation.explanation);
            }
          }
          const finalRuns = await listRuns(client, experiment.id);
          need(finalRuns.length === run.rows.length, 'Phoenix contains extra or missing stored rows');
          const phoenix: PhoenixLinks = { datasetId: pin.datasetId, datasetVersionId: pin.versionId, experimentId: experiment.id,
            datasetUrl: getDatasetUrl({ baseUrl: options.baseUrl, datasetId: pin.datasetId }),
            experimentUrl: getExperimentUrl({ baseUrl: options.baseUrl, datasetId: pin.datasetId, experimentId: experiment.id }) };
          await verifyPage(client, phoenix.datasetUrl!);
          await verifyPage(client, phoenix.experimentUrl!);
          need(validateContract('PhoenixLinks', phoenix).valid, 'Verified Phoenix GlobalIDs do not fit the installed PhoenixLinks contract');
          return { phoenix, rowLinks };
        });
      } catch (error) {
        if (error instanceof ServiceError) throw error;
        if (callerSignal.aborted) throw new ServiceError({ code: 'cancelled', message: 'Phoenix recording cancelled', retryable: true }, 499);
        if (signal.aborted) throw new ServiceError({ code: 'timeout', message: 'Phoenix recording deadline exceeded', retryable: true }, 504);
        // Raw transport bodies can include credentials or submitted content.
        throw unavailable();
      }
    },
  };
}
