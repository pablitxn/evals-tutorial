import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServiceError } from '@evals-tutorial/contracts/services';
import { createPhoenixTelemetry } from '../src/index.js';
import { fixtureDataset, fixtureRun } from './fixtures.js';

test('readable experiment annotations distinguish criterion failures from fixture matches and verify persistence', async t => {
  for (const scenario of ['expanded', 'legacy', 'missing-criterion', 'empty-zero-score', 'missing-fixture-match'] as const) {
    await t.test(scenario, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'tutorial-annotations-'));
      const dataset = fixtureDataset(); const run = fixtureRun(dataset);
      run.rows[1]!.evaluation!.criteria = [{
        criterionId: 'R2', score: 0, label: 'fail', explanation: 'Mandatory fees were excluded.',
      }];
      const original = structuredClone(run);
      const examples: any[] = []; const tasks: any[] = []; const spans: any[] = [];
      const evaluations = new Map<string, any>(); let experiment: any; let creates = 0;
      const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
      const transport: typeof fetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url); const path = decodeURIComponent(url.pathname);
        const body = request.method === 'POST' ? await request.json() : undefined;
        if (!path.startsWith('/v1/')) return new Response('<title>Phoenix</title>', { headers: { 'content-type': 'text/html' } });
        if (path === '/v1/datasets/upload') {
          body.example_ids.forEach((id: string, index: number) => examples.push({
            id, node_id: `example-${index}`, input: body.inputs[index], output: body.outputs[index], metadata: body.metadata[index],
          }));
          return json({ data: { dataset_id: 'dataset', version_id: 'version' } });
        }
        if (path === '/v1/datasets/dataset/examples') return json({ data: { version_id: 'version', examples } });
        if (path === '/v1/datasets/dataset/experiments') {
          if (body) {
            creates++;
            experiment = { ...body, id: 'experiment', dataset_id: 'dataset', dataset_version_id: 'version', project_name: 'project' };
            if (scenario === 'legacy') delete experiment.metadata.tutorial_annotation_version;
            return json({ data: experiment });
          }
          return json({ data: experiment ? [experiment] : [], next_cursor: null });
        }
        if (path === '/v1/experiments/experiment') return json({ data: experiment });
        if (path === '/v1/experiments/experiment/runs') {
          if (body) { tasks.push({ id: `task-${tasks.length}`, ...body }); return json({ data: tasks.at(-1) }); }
          return json({ data: tasks, next_cursor: null });
        }
        if (path === '/v1/experiment_evaluations') {
          evaluations.set(`${body.experiment_run_id}:${body.name}`, body);
          return json({});
        }
        if (path === '/v1/experiments/experiment/csv') {
          const names = [...new Set([...evaluations.values()].map(value => value.name as string))]
            .filter(name => scenario !== 'missing-criterion' || name !== 'tutorial_criterion_R2')
            .filter(name => scenario !== 'missing-fixture-match' || name !== 'tutorial_fixture_match');
          const header = ['example_id', 'repetition_number', ...names.flatMap(name =>
            ['score', 'label', 'explanation'].map(field => `annotation_${name}_${field}`))];
          const rows = tasks.map(task => [task.dataset_example_id, 1, ...names.flatMap(name => {
            const result = evaluations.get(`${task.id}:${name}`)?.result;
            return [scenario === 'empty-zero-score' && name === 'tutorial_criterion_R2' ? '' : result?.score ?? '', result?.label ?? '', result?.explanation ?? ''];
          })]);
          return new Response([header, ...rows].map(row =>
            row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n'),
          { headers: { 'content-type': 'text/csv' } });
        }
        if (path === '/v1/projects/project') return json({ data: { id: 'project', name: 'project' } });
        if (path === '/v1/projects/project/spans') {
          if (body) spans.push(...body.data.map((span: any) => ({ ...span, parent_id: null })));
          return json({ data: spans.filter(span => span.context.trace_id === url.searchParams.get('trace_id')), next_cursor: null });
        }
        throw Error(`Unexpected route: ${request.method} ${path}`);
      };
      try {
        const service = createPhoenixTelemetry({ baseUrl: 'http://127.0.0.1:6006', stateDirectory: directory, fetch: transport });
        if (scenario.startsWith('missing-') || scenario === 'empty-zero-score') {
          await assert.rejects(service.record(dataset, run, new AbortController().signal),
            error => error instanceof ServiceError && error.detail.code === 'telemetry_unavailable');
        } else {
          const first = await service.record(dataset, run, new AbortController().signal);
          assert.deepEqual(await service.record(dataset, run, new AbortController().signal), first);
          assert.equal(creates, 1); assert.equal(tasks.length, 2); assert.equal(spans.length, 2);
          assert.match(experiment.name, /^intro \| fixtures \| synthetic-fixtures \| 2026-10-14T13:00:00.000Z \| syntheti$/);
          assert.equal(experiment.metadata.tutorial_exercise_id, 'intro');
          assert.equal(evaluations.get('task-1:tutorial_result').result.score, 0);
          if (scenario === 'legacy') {
            assert.equal(evaluations.size, 2);
          } else {
            assert.equal(evaluations.size, 5);
            assert.equal(evaluations.get('task-1:tutorial_criterion_R2').result.score, 0);
            assert.equal(evaluations.get('task-1:tutorial_fixture_match').result.score, 1);
            assert.equal(evaluations.get('task-1:tutorial_fixture_match').result.label, 'matched');
          }
        }
        assert.deepEqual(run, original);
      } finally { await rm(directory, { recursive: true }); }
    });
  }
});
