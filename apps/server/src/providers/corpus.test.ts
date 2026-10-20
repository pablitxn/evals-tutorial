import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateContract } from '@evals-tutorial/contracts';
import type { AgentRequest } from '@evals-tutorial/contracts';
import { createContentService } from '../http/content.js';
import { createAgentService, containsReference } from './agents.js';
import { resolveAgentDocuments } from './documents.js';

const root = process.env.ET_TEST_CONTENT_ROOT;
test('actual corpus schemas, all rows and installed variants reach the agent transport', { skip: !root }, async () => {
  const content = await createContentService(root!);
  const tutorial = await content.tutorial();
  const projection = JSON.parse(await readFile('apps/agents/src/tutorial_agents/domains.json', 'utf8')) as { exercises: Record<string, { inputSchema: unknown; outputSchema: unknown }> };
  let examples = 0, docRequests = 0, providerCalls = 0, expectedRequests = 0;
  const coveredVariants = new Set<string>();
  for (const exercise of tutorial.exercises) {
    assert.deepEqual(projection.exercises[exercise.id], { inputSchema: exercise.inputSchema, outputSchema: exercise.outputSchema });
    const dataset = await content.dataset(exercise.id);
    for (const example of dataset.examples) {
      examples++;
      const ids = exercise.id === '02-document-classification' ? [example.input.documentId as string] : exercise.id === '03-independent-tie-out' ? example.input.documentIds as string[] : [];
      const documents = ids.length ? await resolveAgentDocuments(root!, dataset.documentManifestRef!, ids) : [];
      if (documents.length) docRequests++;
      for (const agentVariant of exercise.agentVariants) {
        expectedRequests++;
        coveredVariants.add(exercise.id + ':' + agentVariant);
        const request: AgentRequest = { schemaVersion: '1.0.0', runId: 'corpus-run', exampleId: example.id, exerciseId: exercise.id, agentVariant, input: example.input, documents, deadlineMs: 2000 };
        assert.equal(validateContract('AgentRequest', request).valid, true);
        const agents = createAgentService(content, root!, async prepared => {
          providerCalls++;
          assert.equal(prepared.agentVariant, agentVariant);
          assert.equal(containsReference(prepared.input), false);
          assert.equal('expected' in prepared, false); assert.equal('fixtures' in prepared, false); assert.equal('source' in prepared, false);
          // This explicitly injected fixture output tests envelope/schema wiring only.
          // It is never put in the agent request and proves no model perception.
          return { schemaVersion: '1.0.0', runId: request.runId, exampleId: request.exampleId, status: 'completed', output: example.fixtures[0]!.output, agentVersion: 'mock', sourceHash: 'a'.repeat(64), promptHash: 'b'.repeat(64), traceId: 'c'.repeat(32), durationMs: 1 };
        });
        const response = await agents.invoke(request, new AbortController().signal);
        assert.equal(response.status, 'completed', exercise.id + ':' + agentVariant + ' ' + JSON.stringify(response));
        if (response.status === 'completed') assert.equal(response.traceId, 'c'.repeat(32));
      }
    }
  }
  assert.equal(examples, 28); assert.equal(providerCalls, expectedRequests); assert.ok(docRequests > 0);
  assert.ok(coveredVariants.has('07-spec-regression:baseline'));
  assert.ok(coveredVariants.has('07-spec-regression:omit-fees'));
});
