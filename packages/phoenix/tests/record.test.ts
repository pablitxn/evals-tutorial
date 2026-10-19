import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPhoenixTelemetry, createTelemetryContext, parseCsv } from '../src/index.js';
import { ServiceError } from '@evals-tutorial/contracts/services';
import { fixtureDataset, fixtureRun } from './fixtures.js';

const baseUrl = 'http://127.0.0.1:6006';
const code = (expected: string) => (error: unknown) => error instanceof ServiceError && error.detail.code === expected;

test('frozen snapshot/hash/row validation fails before a Phoenix request', async () => {
  let calls = 0;
  const telemetry = createPhoenixTelemetry({ baseUrl, stateDirectory: '/tmp/unused-et-wp07', fetch: async () => { calls++; throw Error('unexpected'); } });
  const dataset = fixtureDataset(); const run = fixtureRun(dataset);
  for (const changed of [{ ...run, status: 'running' }, { ...run, completedRows: 1 }, { ...run, codeHash: 'a'.repeat(64) },
    { ...run, rows: [run.rows[0], run.rows[0]] }, { ...run, rows: [{ ...run.rows[0], status: 'failed' }, run.rows[1]] }]) {
    await assert.rejects(telemetry.record(dataset, changed as typeof run, new AbortController().signal), code('invalid_request'));
  }
  await assert.rejects(telemetry.record({ ...dataset, contentHash: 'a'.repeat(64) }, run, new AbortController().signal), code('invalid_request'));
  assert.equal(calls, 0);
});

test('explicit frozen loopback origin is required; no ambient endpoint fallback', () => {
  for (const baseUrl of ['https://example.com', 'http://127.0.0.1:16006', 'http://key@localhost:6006', 'http://localhost:6006/api']) {
    assert.throws(() => createPhoenixTelemetry({ baseUrl, stateDirectory: '/tmp/unused' }), code('invalid_request'));
  }
});

test('unavailable Phoenix and HTML masquerading as JSON return sanitized typed failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'et-wp07-unit-'));
  try {
    for (const fetch of [async () => { throw Error('Authorization: secret-sentinel'); }, async () => new Response('<title>Phoenix</title>', { headers: { 'content-type': 'text/html' } })]) {
      const telemetry = createPhoenixTelemetry({ baseUrl, stateDirectory: directory, fetch });
      await assert.rejects(telemetry.record(fixtureDataset(), fixtureRun(fixtureDataset()), new AbortController().signal), error =>
        code('telemetry_unavailable')(error) && !(error as Error).message.includes('secret-sentinel'));
    }
  } finally { await rm(directory, { recursive: true }); }
});

test('pre-aborted recording sends no network traffic', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'et-wp07-abort-'));
  try {
    let calls = 0;
    const controller = new AbortController(); controller.abort();
    const telemetry = createPhoenixTelemetry({ baseUrl, stateDirectory: directory, fetch: async () => { calls++; throw Error('unexpected'); } });
    await assert.rejects(telemetry.record(fixtureDataset(), fixtureRun(fixtureDataset()), controller.signal), code('cancelled'));
    assert.equal(calls, 0);
  } finally { await rm(directory, { recursive: true }); }
});

test('recording deadline aborts a hung transport and returns timeout independently of execution', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'et-wp07-timeout-'));
  try {
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      const transportSignal = init!.signal!;
      if (transportSignal.aborted) throw Error('aborted');
      await new Promise((_resolve, reject) => transportSignal.addEventListener('abort', () => reject(Error('aborted')), { once: true }));
      throw Error('unreachable');
    };
    const telemetry = createPhoenixTelemetry({ baseUrl, stateDirectory: directory, maxRecordingMs: 10, fetch });
    await assert.rejects(telemetry.record(fixtureDataset(), fixtureRun(fixtureDataset()), new AbortController().signal), code('timeout'));
  } finally { await rm(directory, { recursive: true }); }
});

test('W3C context is stable, row-bound and fixture-bound', () => {
  const value = createTelemetryContext('run-1', 'example-1');
  assert.deepEqual(value, createTelemetryContext('run-1', 'example-1'));
  assert.notEqual(value.traceId, createTelemetryContext('run-1', 'example-2').traceId);
  assert.notEqual(value.traceId, createTelemetryContext('run-1', 'example-1', 'fixture').traceId);
  assert.match(value.traceparent, /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
});

test('CSV read-back handles quoted commas, quotes, newlines and CRLF', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,"quoted, ""value""\nnext"\r\n'), [['a', 'b'], ['1', 'quoted, "value"\nnext']]);
  assert.throws(() => parseCsv('a,"broken'), code('telemetry_unavailable'));
});

test('terminal agent errors preserve globally owned producer traces and retry without scores or duplicate writes', async t => {
  for (const scenario of ['provider-error', 'early-error', 'unstarted', 'disconnected', 'credential-attribute'] as const) {
    await t.test(scenario, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'et-wp07-terminal-'));
      const dataset = fixtureDataset(); const run = fixtureRun(dataset, `terminal-${scenario}`);
      run.request.mode = 'agent'; run.status = scenario === 'unstarted' ? 'cancelled' : 'failed';
      run.totalRows = 1; run.completedRows = 0;
      run.rows = [{ exampleId: 'starred', status: run.status,
        error: { code: scenario === 'unstarted' ? 'cancelled' : 'provider_unavailable', message: 'Owned synthetic operational error', retryable: false } }];
      const original = structuredClone(run);
      const context = createTelemetryContext(run.runId, 'starred');
      const sourceProjectName = 'synthetic-source'; const experimentProject = 'synthetic-experiment';
      type Span = { context: { trace_id: string; span_id: string }; parent_id?: string | null; span_kind: string; attributes?: Record<string, unknown> };
      const projects = new Map<string, Span[]>();
      if (scenario !== 'unstarted') projects.set(sourceProjectName, [{
        context: { trace_id: context.traceId, span_id: 'a'.repeat(16) },
        parent_id: scenario === 'disconnected' ? 'b'.repeat(16) : context.spanId,
        span_kind: scenario === 'early-error' ? 'UNKNOWN' : 'AGENT',
        attributes: scenario === 'credential-attribute' ? { api_key: 'must-not-be-linked' } : {},
      }]);
      const tasks: Record<string, unknown>[] = []; const examples: Record<string, unknown>[] = [];
      let experiment: Record<string, unknown> | undefined;
      let taskWrites = 0; let spanWrites = 0; let experimentWrites = 0; let annotationWrites = 0;
      const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
      const transport: typeof fetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const path = decodeURIComponent(new URL(request.url).pathname);
        if (!path.startsWith('/v1/')) return new Response('<title>Phoenix</title>', { headers: { 'content-type': 'text/html' } });
        const body = request.method === 'POST' ? await request.json() as Record<string, any> : undefined;
        if (path === '/v1/datasets/upload') {
          body!.example_ids.forEach((id: string, index: number) => examples.push({ id, node_id: `example-${index}`,
            input: body!.inputs[index], output: body!.outputs[index], metadata: body!.metadata[index] }));
          return json({ data: { dataset_id: 'dataset', version_id: 'version' } });
        }
        if (path === '/v1/datasets/dataset/examples') return json({ data: { version_id: 'version', examples } });
        if (path === '/v1/datasets/dataset/experiments') {
          if (body) {
            experimentWrites++; projects.set(experimentProject, []);
            experiment = { id: 'experiment', dataset_id: 'dataset', dataset_version_id: 'version', project_name: experimentProject, metadata: body.metadata };
            return json({ data: experiment });
          }
          return json({ data: experiment ? [experiment] : [], next_cursor: null });
        }
        if (path === '/v1/experiments/experiment') return json({ data: experiment });
        if (path === '/v1/experiments/experiment/runs') {
          if (body) { taskWrites++; tasks.push({ id: `task-${tasks.length}`, ...body }); return json({ data: tasks.at(-1) }); }
          return json({ data: tasks, next_cursor: null });
        }
        if (path === '/v1/experiments/experiment/csv') return new Response('example_id,repetition_number,error\n', { headers: { 'content-type': 'text/csv' } });
        if (path === '/v1/experiment_evaluations') { annotationWrites++; return json({}); }
        const match = path.match(/^\/v1\/projects\/([^/]+)(\/spans)?$/);
        if (match) {
          const requestedProject = match[1]!;
          if (!projects.has(requestedProject)) return json({ error: 'Project does not exist' }, 404);
          if (!match[2]) return json({ data: { id: requestedProject, name: requestedProject } });
          if (body) {
            spanWrites++;
            // Phoenix trace IDs are global: a new parent stays with any existing
            // producer trace even when the caller posts it to another project.
            const owner = [...projects.entries()].find(([, spans]) => spans.some(span => span.context.trace_id === context.traceId))?.[0] ?? requestedProject;
            projects.get(owner)!.push(...body.data.map((span: Span) => ({ ...span, parent_id: span.parent_id ?? null })));
          }
          return json({ data: projects.get(requestedProject), next_cursor: null });
        }
        throw new Error(`Unexpected synthetic Phoenix route: ${request.method} ${path}`);
      };
      try {
        const telemetry = createPhoenixTelemetry({ baseUrl, stateDirectory: directory, sourceProjectName, fetch: transport });
        if (scenario === 'disconnected' || scenario === 'credential-attribute') {
          await assert.rejects(telemetry.record(dataset, run, new AbortController().signal), code('telemetry_unavailable'));
          assert.equal(spanWrites, 0); assert.equal(taskWrites, 0);
        } else {
          const first = await telemetry.record(dataset, run, new AbortController().signal);
          const second = await telemetry.record(dataset, run, new AbortController().signal);
          assert.deepEqual(second, first);
          assert.equal(experimentWrites, 1); assert.equal(taskWrites, 1); assert.equal(spanWrites, 1);
          assert.equal(tasks[0]!.error, `${run.status}:${run.rows[0]!.error!.code}`);
          assert.equal(tasks[0]!.output, null);
          const owner = scenario === 'unstarted' ? experimentProject : sourceProjectName;
          assert(first.rowLinks[0]!.phoenix.traceUrl!.includes(`/projects/${owner}/`));
          assert.equal(projects.get(owner)!.filter(span => span.context.span_id === context.spanId).length, 1);
        }
        assert.equal(annotationWrites, 0);
        assert.deepEqual(run, original);
      } finally { await rm(directory, { recursive: true }); }
    });
  }
});
