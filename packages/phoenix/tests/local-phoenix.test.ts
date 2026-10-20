import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import type { RunRecord, Dataset, PhoenixLinks } from '@evals-tutorial/contracts';
import { validateContract } from '@evals-tutorial/contracts';
import { datasetHash } from '@evals-tutorial/contracts/node';
import { ServiceError } from '@evals-tutorial/contracts/services';
import { createPhoenixTelemetry, createTelemetryContext, parseCsv, type PhoenixTelemetryOptions } from '../src/index.js';
import { fixtureDataset, fixtureRun } from './fixtures.js';

const baseUrl = 'http://127.0.0.1:6006';
const signal = () => new AbortController().signal;
const code = (expected: string) => (error: unknown) => error instanceof ServiceError && error.detail.code === expected;
async function json(path: string) {
  const response = await fetch(`${baseUrl}${path}`); assert(response.ok, `${path}: ${response.status}`);
  assert(response.headers.get('content-type')?.includes('application/json'));
  return response.json();
}

test('real local Phoenix persistence of owned synthetic contracts; zero inference', { skip: process.env.ET_WP07_LOCAL_PHOENIX !== '1' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'et-wp07-local-'));
  const nonce = randomUUID();
  const dataset = fixtureDataset(`et-wp07-${nonce}`);
  const run = fixtureRun(dataset, `fixture-${nonce}`);
  const options: PhoenixTelemetryOptions = { baseUrl, stateDirectory: directory };
  const telemetry = createPhoenixTelemetry(options);
  const observations: Record<string, unknown> = { mode: 'synthetic contract fixtures; real local Phoenix', inferenceCalls: 0, providerTokenSpend: 0 };
  // The accepted GlobalID correction now requires successful production returns.
  // No journal inspection substitutes for a TelemetryService result.
  async function observed(ds: Dataset, rr: RunRecord, opt = options): Promise<PhoenixLinks> {
    const result = await createPhoenixTelemetry(opt).record(ds, rr, signal());
    assert(validateContract('PhoenixLinks', result.phoenix).valid);
    assert(result.phoenix.datasetUrl && result.phoenix.experimentUrl);
    assert.equal(result.rowLinks.length, rr.rows.length);
    for (const row of result.rowLinks) {
      assert(validateContract('PhoenixLinks', row.phoenix).valid);
      assert(row.phoenix.traceId && row.phoenix.traceUrl);
      assert.equal(row.phoenix.datasetVersionId, result.phoenix.datasetVersionId);
      assert.equal(row.phoenix.experimentId, result.phoenix.experimentId);
    }
    return result.phoenix;
  }
  try {
    let first: PhoenixLinks;
    await t.test('identical and concurrent imports reuse dataset/version and experiment without duplicate results', async () => {
      first = await observed(dataset, run);
      const parallel = await Promise.all([observed(dataset, run), observed(dataset, run)]);
      for (const result of parallel) assert.deepEqual(result, first);
      const tasks = (await json(`/v1/experiments/${first.experimentId}/runs`)).data;
      assert.equal(tasks.length, 2);
      assert(tasks.every((task: { trace_id: string }) => /^[a-f0-9]{32}$/.test(task.trace_id)));
      observations.fixture = { ...first, tasks };
    });
    await t.test('criterion results and expected fixture rejections are independently readable in Phoenix', async () => {
      const annotated = fixtureRun(dataset, `annotations-${nonce}`);
      annotated.rows[1]!.evaluation!.criteria = [{
        criterionId: 'R2', score: 0, label: 'fail', explanation: 'Owned synthetic required-field rejection.',
      }];
      const result = await observed(dataset, annotated);
      const experiment = (await json(`/v1/experiments/${result.experimentId}`)).data;
      assert(experiment.name.includes('intro | fixtures | synthetic-fixtures |'));
      assert.equal(experiment.metadata.tutorial_annotation_version, 2);
      const csv = parseCsv(await (await fetch(`${baseUrl}/v1/experiments/${result.experimentId}/csv`)).text());
      const header = csv[0]!;
      const rejected = csv.slice(1).find(row => row[header.indexOf('annotation_tutorial_result_label')] === 'fail')!;
      assert.equal(Number(rejected[header.indexOf('annotation_tutorial_result_score')]), 0);
      assert.equal(Number(rejected[header.indexOf('annotation_tutorial_criterion_R2_score')]), 0);
      assert.equal(rejected[header.indexOf('annotation_tutorial_criterion_R2_explanation')], annotated.rows[1]!.evaluation!.criteria![0]!.explanation);
      assert.equal(Number(rejected[header.indexOf('annotation_tutorial_fixture_match_score')]), 1);
      assert.equal(rejected[header.indexOf('annotation_tutorial_fixture_match_label')], 'matched');
      observations.annotations = { ...result, expectedRejectionScore: 0, fixtureMatchScore: 1, criterionResultVerified: true };
    });
    await t.test('successful return preserves actual padded GlobalIDs and verified per-row links', async () => {
      const result = await telemetry.record(dataset, run, signal());
      assert(result.phoenix.datasetVersionId!.endsWith('='), 'Use a fresh disposable Phoenix so the first version exercises actual padding');
      const experiment = (await json(`/v1/experiments/${encodeURIComponent(result.phoenix.experimentId!)}`)).data;
      assert.equal(result.phoenix.datasetId, experiment.dataset_id);
      assert.equal(result.phoenix.datasetVersionId, experiment.dataset_version_id);
      assert.equal(result.phoenix.experimentId, experiment.id);
      const links = [result.phoenix.datasetUrl!, result.phoenix.experimentUrl!, ...result.rowLinks.map(row => row.phoenix.traceUrl!)];
      for (const url of links) {
        const response = await fetch(url); assert(response.ok); assert((await response.text()).includes('<title>Phoenix</title>'));
      }
      observations.successfulReturn = result;
    });
    await t.test('fresh Node process resumes the same journal and persisted experiment', async () => {
      const request = join(directory, 'restart.json');
      await writeFile(request, JSON.stringify({ dataset, run, options }));
      const returned = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', 'packages/phoenix/tests/restart.ts', request], { encoding: 'utf8', timeout: 20000 }));
      assert.deepEqual(returned.phoenix, first!);
      const tasks = (await json(`/v1/experiments/${first!.experimentId}/runs`)).data;
      assert.equal(tasks.length, 2);
      observations.restart = { sameExperiment: true, rows: tasks.length };
    });
    await t.test('two separate Node processes serialize fresh experiment creation', async () => {
      const concurrentRun = fixtureRun(dataset, `process-concurrent-${nonce}`);
      const request = join(directory, 'concurrent.json');
      await writeFile(request, JSON.stringify({ dataset, run: concurrentRun, options }));
      const execute = promisify(execFile);
      const results = await Promise.all([1, 2].map(() => execute(process.execPath, ['--import', 'tsx', 'packages/phoenix/tests/restart.ts', request], { encoding: 'utf8', timeout: 20000 })));
      assert.deepEqual(JSON.parse(results[0]!.stdout), JSON.parse(results[1]!.stdout));
      const result = await observed(dataset, concurrentRun);
      assert.equal((await json(`/v1/experiments/${result.experimentId}/runs`)).data.length, 2);
      observations.concurrentProcesses = { ...result, sameExperiment: true, rows: 2 };
    });
    await t.test('retry accepts previously attached fixture links and telemetry status changes', async () => {
      const updated = structuredClone(run); updated.telemetryStatus = 'recorded';
      updated.phoenix = { traceId: createTelemetryContext(run.runId, 'starred', 'correct').traceId };
      updated.rows.forEach(row => { row.phoenix = { traceId: createTelemetryContext(run.runId, row.exampleId, row.fixtureId).traceId }; });
      assert.deepEqual(await observed(dataset, updated), first!);
    });
    await t.test('changed content creates a new version; original version stays pinned', async () => {
      const changed = structuredClone(dataset); changed.datasetVersion = '2'; changed.examples[0]!.expected = { label: 'changed-reference' }; changed.contentHash = datasetHash(changed);
      const changedRun = fixtureRun(changed, `changed-${nonce}`);
      const result = await observed(changed, changedRun);
      assert.equal(result.datasetId, first!.datasetId);
      assert.notEqual(result.datasetVersionId, first!.datasetVersionId);
      assert.deepEqual(await observed(dataset, run), first!);
      const old = (await json(`/v1/datasets/${first!.datasetId}/examples?version_id=${encodeURIComponent(first!.datasetVersionId!)}`)).data;
      assert(old.examples.every((example: { output: { label: string } }) => example.output.label === 'starred'));
      observations.versioning = { oldVersion: first!.datasetVersionId, newVersion: result.datasetVersionId, oldPinnedAfterChange: true };
    });
    await t.test('reusing an application dataset version or run ID with different immutable evidence conflicts', async () => {
      const changed = structuredClone(dataset); changed.examples[0]!.expected = { label: 'conflict' }; changed.contentHash = datasetHash(changed);
      await assert.rejects(telemetry.record(changed, fixtureRun(changed, `conflict-${nonce}`), signal()), code('conflict'));
      const changedRun = structuredClone(run); changedRun.rows[0]!.evaluation!.explanation = 'Changed receipt';
      await assert.rejects(telemetry.record(dataset, changedRun, signal()), code('conflict'));
    });
    await t.test('cancelled execution preserves completed scores and operational error rows', async () => {
      const partial = fixtureRun(dataset, `cancelled-${nonce}`); partial.status = 'cancelled'; partial.completedRows = 1;
      partial.rows[1] = { exampleId: 'starred', fixtureId: 'incorrect', status: 'cancelled', error: { code: 'cancelled', message: 'Owned cancellation fixture', retryable: false } };
      const result = await observed(dataset, partial);
      const tasks = (await json(`/v1/experiments/${result.experimentId}/runs`)).data;
      assert.equal(tasks.filter((task: { error: string | null }) => task.error === 'cancelled:cancelled').length, 1);
      const csv = parseCsv(await (await fetch(`${baseUrl}/v1/experiments/${result.experimentId}/csv`)).text());
      const header = csv[0]!; const failed = csv.slice(1).find(row => row[header.indexOf('error')] === 'cancelled:cancelled')!;
      assert.equal(failed[header.indexOf('annotation_tutorial_result_score')], '');
      observations.cancelled = { ...result, tasks };
    });
    await t.test('all-error agent receipts preserve existing producer traces without scores or duplicate rows', async () => {
      const sourceProjectName = `ET-WP07-error-source-${nonce}`;
      const created = await fetch(`${baseUrl}/v1/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: sourceProjectName }) });
      assert(created.ok);
      const agent = fixtureRun(dataset, `failed-agent-${nonce}`);
      agent.request.mode = 'agent'; agent.status = 'failed'; agent.totalRows = 1; agent.completedRows = 0;
      agent.rows = [{ exampleId: 'starred', status: 'failed', error: { code: 'provider_unavailable', message: 'Owned synthetic provider failure; no inference', retryable: true } }];
      const original = structuredClone(agent);
      const context = createTelemetryContext(agent.runId, 'starred');
      const agentSpanId = nonce.replaceAll('-', '').slice(0, 16);
      const modelSpanId = nonce.replaceAll('-', '').slice(16);
      const exported = await fetch(`${baseUrl}/v1/projects/${sourceProjectName}/spans`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: [
        { name: 'Synthetic failed agent; no inference', span_kind: 'AGENT', context: { trace_id: context.traceId, span_id: agentSpanId }, parent_id: context.spanId,
          start_time: agent.createdAt, end_time: agent.updatedAt, status_code: 'ERROR', attributes: {} },
        { name: 'Synthetic failed model; no inference', span_kind: 'LLM', context: { trace_id: context.traceId, span_id: modelSpanId }, parent_id: agentSpanId,
          start_time: agent.createdAt, end_time: agent.updatedAt, status_code: 'ERROR', attributes: {} },
      ] }) });
      assert(exported.ok);
      for (let attempt = 0; attempt < 20; attempt++) {
        if ((await json(`/v1/projects/${sourceProjectName}/spans?trace_id=${context.traceId}`)).data.length === 2) break;
        await delay(100);
      }
      const result = await createPhoenixTelemetry({ ...options, sourceProjectName }).record(dataset, agent, signal());
      assert.deepEqual(await createPhoenixTelemetry({ ...options, sourceProjectName }).record(dataset, agent, signal()), result);
      assert.deepEqual(agent, original);
      const tasks = (await json(`/v1/experiments/${result.phoenix.experimentId}/runs`)).data;
      assert.equal(tasks.length, 1); assert.equal(tasks[0].error, 'failed:provider_unavailable'); assert.equal(tasks[0].output, null);
      const source = (await json(`/v1/projects/${sourceProjectName}/spans?trace_id=${context.traceId}`)).data;
      assert.equal(source.length, 3); assert(source.some((span: { context: { span_id: string } }) => span.context.span_id === context.spanId));
      const project = (await json(`/v1/projects/${sourceProjectName}`)).data;
      assert(result.rowLinks[0]!.phoenix.traceUrl!.includes(`/projects/${encodeURIComponent(project.id)}/`));
      const csv = parseCsv(await (await fetch(`${baseUrl}/v1/experiments/${result.phoenix.experimentId}/csv`)).text());
      assert(!csv[0]!.includes('annotation_tutorial_result_score'));
      observations.failedAgent = { ...result, inferenceCalls: 0, persistedRows: tasks.length, sourceSpans: source.length };
    });
    await t.test('unstarted cancelled and timed-out agent rows record without requiring a producer project', async () => {
      for (const status of ['cancelled', 'timed_out'] as const) {
        const agent = fixtureRun(dataset, `${status}-agent-${nonce}`);
        agent.request.mode = 'agent'; agent.status = status; agent.totalRows = 1; agent.completedRows = 0;
        agent.rows = [{ exampleId: 'starred', status, error: { code: status === 'cancelled' ? 'cancelled' : 'timeout', message: 'Owned synthetic unstarted row', retryable: false } }];
        const result = await observed(dataset, agent, { ...options, sourceProjectName: `ET-WP07-absent-${nonce}` });
        const tasks = (await json(`/v1/experiments/${result.experimentId}/runs`)).data;
        assert.equal(tasks.length, 1); assert.equal(tasks[0].output, null);
        assert.equal(tasks[0].error, `${status}:${agent.rows[0]!.error!.code}`);
        observations[`${status}UnstartedAgent`] = { ...result, inferenceCalls: 0, persistedRows: tasks.length };
      }
    });
    for (const stage of ['experiment', 'row', 'evaluation'] as const) {
      await t.test(`lost ${stage} write response resumes by read-back without repeated execution`, async () => {
        const retryRun = fixtureRun(dataset, `${stage}-${nonce}`);
        let injected = false; let experimentCreates = 0;
        const fault: typeof fetch = async (input, init) => {
          const request = input instanceof Request ? input : new Request(input, init);
          const path = new URL(request.url).pathname;
          if (request.method === 'POST' && /\/datasets\/.*\/experiments$/.test(path)) experimentCreates++;
          const response = await fetch(input, init);
          const target = stage === 'experiment' ? /\/datasets\/.*\/experiments$/ : stage === 'row' ? /\/experiments\/.*\/runs$/ : /\/experiment_evaluations$/;
          if (!injected && request.method === 'POST' && target.test(path)) { injected = true; await response.text(); throw Error('Synthetic lost committed response'); }
          return response;
        };
        await assert.rejects(createPhoenixTelemetry({ ...options, fetch: fault }).record(dataset, retryRun, signal()), code('telemetry_unavailable'));
        assert(injected);
        const result = await observed(dataset, retryRun, { ...options, fetch: fault });
        assert.equal(experimentCreates, 1);
        assert.equal((await json(`/v1/experiments/${result.experimentId}/runs`)).data.length, 2);
        observations[`${stage}Retry`] = { ...result, experimentCreates, inferenceCalls: 0 };
      });
    }
    await t.test('cancellation during a committed recording write remains retryable without inference', async () => {
      const cancelledRun = fixtureRun(dataset, `recording-cancelled-${nonce}`);
      const controller = new AbortController(); let injected = false;
      const abort: typeof fetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const response = await fetch(input, init);
        if (!injected && request.method === 'POST' && new URL(request.url).pathname.endsWith('/spans')) { injected = true; controller.abort(); }
        return response;
      };
      await assert.rejects(createPhoenixTelemetry({ ...options, fetch: abort }).record(dataset, cancelledRun, controller.signal), code('cancelled'));
      assert(injected);
      await delay(150);
      const result = await observed(dataset, cancelledRun);
      assert.equal((await json(`/v1/experiments/${result.experimentId}/runs`)).data.length, 2);
      observations.recordingCancellation = { ...result, retrySucceededByReadback: true, inferenceCalls: 0 };
    });
    await t.test('missing completed-agent traces fail explicitly instead of returning fixture telemetry', async () => {
      const agent = fixtureRun(dataset, `missing-agent-${nonce}`); agent.request.mode = 'agent'; agent.totalRows = 1; agent.completedRows = 1;
      const { fixtureId: _fixture, ...row } = agent.rows[0]!;
      agent.rows = [row];
      await assert.rejects(telemetry.record(dataset, agent, signal()), code('telemetry_unavailable'));
    });
    await t.test('experiment task points to the real Node/Python trace in its actual source project', { skip: !process.env.ET_WP07_PYTHON }, async () => {
      const sourceProjectName = `ET-WP07-synthetic-source-${nonce}`;
      const created = await fetch(`${baseUrl}/v1/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: sourceProjectName }) });
      assert(created.ok);
      const agent = fixtureRun(dataset, `python-agent-${nonce}`); agent.request.mode = 'agent'; agent.totalRows = 1; agent.completedRows = 1;
      const { fixtureId: _fixture, ...row } = agent.rows[0]!;
      const context = createTelemetryContext(agent.runId, row.exampleId);
      agent.rows = [{ ...row, phoenix: { traceId: context.traceId } }];
      execFileSync(process.env.ET_WP07_PYTHON!, ['packages/phoenix/tests/python_trace.py'], { timeout: 10000,
        env: { ET_TRACEPARENT: context.traceparent, ET_TRACE_PROJECT: sourceProjectName } });
      for (let attempt = 0; attempt < 20; attempt++) {
        const source = (await json(`/v1/projects/${sourceProjectName}/spans?trace_id=${context.traceId}`)).data;
        if (source.length >= 2) break; await delay(100);
      }
      const result = await observed(dataset, agent, { ...options, sourceProjectName });
      const tasks = (await json(`/v1/experiments/${result.experimentId}/runs`)).data;
      assert.equal(tasks[0].trace_id, context.traceId);
      const spans = (await json(`/v1/projects/${sourceProjectName}/spans?trace_id=${context.traceId}`)).data;
      assert.equal(spans.length, 3);
      const root = spans.find((span: { attributes: Record<string, string> }) => span.attributes['tutorial.span_origin'] === 'stored_receipt');
      assert(root);
      const pythonAgent = spans.find((span: { span_kind: string }) => span.span_kind === 'AGENT');
      const pythonModel = spans.find((span: { span_kind: string }) => span.span_kind === 'LLM');
      assert.equal(root.context.span_id, context.spanId);
      assert.equal(pythonAgent.parent_id, root.context.span_id); assert.equal(pythonModel.parent_id, pythonAgent.context.span_id);
      assert(!JSON.stringify(spans).includes('must-not-enter-recorded-spans'));
      observations.pythonContinuity = { ...result, sourceProjectName, traceId: context.traceId, spans, inferenceCalls: 0, boundary: 'real exporter; synthetic spans; no provider or MAF invocation' };
    });
    await t.test('incorrect evaluation read-back is rejected', async () => {
      const malformedRun = fixtureRun(dataset, `bad-readback-${nonce}`);
      const corrupt: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        if (new URL(input instanceof Request ? input.url : String(input)).pathname.endsWith('/csv')) {
          return new Response((await response.text()).replace('pass,1.0,', 'fail,0.0,'), { headers: response.headers });
        }
        return response;
      };
      await assert.rejects(createPhoenixTelemetry({ ...options, fetch: corrupt }).record(dataset, malformedRun, signal()), code('telemetry_unavailable'));
    });
    observations.serviceReturn = 'verified';
    observations.serverVersion = await (await fetch(`${baseUrl}/arize_phoenix_version`)).text();
    if (process.env.ET_WP07_RECEIPT) await writeFile(process.env.ET_WP07_RECEIPT, JSON.stringify(observations, null, 2));
    console.log(JSON.stringify({ serviceReturn: observations.serviceReturn, serverVersion: observations.serverVersion, inferenceCalls: 0 }));
  } finally { await rm(directory, { recursive: true }); }
});
