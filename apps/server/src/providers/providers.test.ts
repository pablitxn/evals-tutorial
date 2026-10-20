import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentRequest, AgentResponse, Exercise } from '@evals-tutorial/contracts';
import { sha256 } from '@evals-tutorial/contracts/node';
import type { ContentService } from '@evals-tutorial/contracts/services';
import { profileFromEnv } from './profile.js';
import { createAgentService } from './agents.js';
import { createPythonTransport } from './process.js';

const env = { TUTORIAL_PROVIDER: 'openai', TUTORIAL_MODEL: 'mock-model', TUTORIAL_API_KEY: 'offline-placeholder' };
const request = (): AgentRequest => ({ schemaVersion: '1.0.0', runId: 'run-1', exampleId: 'row-1', exerciseId: '01-starred-classifier', agentVariant: 'baseline', input: { starred: true }, documents: [], deadlineMs: 1000 });
const success = (): AgentResponse => ({ schemaVersion: '1.0.0', runId: 'run-1', exampleId: 'row-1', status: 'completed', output: { label: 'starred' }, agentVersion: '1.0.0', sourceHash: 'a'.repeat(64), promptHash: 'b'.repeat(64), durationMs: 1 });
const exercise = { agentVariants: ['baseline', 'careful'], inputSchema: { type: 'object', required: ['starred'], additionalProperties: false, properties: { starred: { type: 'boolean' } } }, outputSchema: { type: 'object', required: ['label'], additionalProperties: false, properties: { label: { enum: ['starred', 'not_starred'] } } } } as unknown as Exercise;
const content = { exercise: async () => exercise, document: async () => { throw Error('No documents'); } } as unknown as ContentService;

test('profile has no ambient fallback and revision excludes secret', () => {
  assert.throws(() => profileFromEnv({ OPENAI_API_KEY: 'ambient' }));
  assert.throws(() => profileFromEnv({ ...env, TUTORIAL_PROVIDER: 'other' }));
  assert.throws(() => profileFromEnv({ ...env, TUTORIAL_AZURE_ENDPOINT: 'https://wrong.invalid' }));
  const a = profileFromEnv(env), b = profileFromEnv({ ...env, TUTORIAL_API_KEY: 'rotated-offline-placeholder' });
  assert.deepEqual(a.summary, b.summary);
  assert.ok(!JSON.stringify(a.summary).includes('placeholder'));
  assert.notEqual(a.summary.configRevision, profileFromEnv({ ...env, TUTORIAL_MODEL: 'other' }).summary.configRevision);
});
test('Azure requires explicit resource routing, rejects arbitrary paths and credentials', () => {
  const azure = { ...env, TUTORIAL_PROVIDER: 'azure_foundry', TUTORIAL_API_VERSION: 'user-selected-version' };
  for (const endpoint of ['http://synthetic.openai.azure.com', 'https://x.services.ai.azure.com/api/projects/a', 'https://synthetic.openai.azure.com/openai/v1', 'https://user:password@synthetic.openai.azure.com', 'https://synthetic.openai.azure.com/?key=secret']) assert.throws(() => profileFromEnv({ ...azure, TUTORIAL_AZURE_ENDPOINT: endpoint }));
  assert.equal(profileFromEnv({ ...azure, TUTORIAL_AZURE_ENDPOINT: 'https://synthetic.openai.azure.com/' }).processEnv.TUTORIAL_AZURE_ENDPOINT, 'https://synthetic.openai.azure.com');
});
test('agent rejects input references, unknown variants and domain mismatch before inference', async () => {
  let calls = 0;
  const agents = createAgentService(content, tmpdir(), async () => { calls++; return success(); });
  for (const change of [{ expected: {} }, { agentVariant: 'arbitrary' }, { input: { starred: 'yes' } }, { input: { nested: { fixtures: [] } } }, { deadlineMs: 60001 }]) {
    const result = await agents.invoke({ ...request(), ...change } as AgentRequest, new AbortController().signal);
    assert.equal(result.status, 'failed');
    if (result.status === 'failed') assert.equal(result.error.code, 'invalid_request');
  }
  assert.equal(calls, 0);
});
test('known variants still require installation for the selected exercise', async () => {
  let calls = 0;
  const transport = async () => { calls++; return success(); };
  const regression = { ...content, exercise: async () => ({ ...exercise, agentVariants: ['baseline', 'omit-fees'] }) } as ContentService;
  const selected = { ...request(), exerciseId: '07-spec-regression' as const, agentVariant: 'omit-fees' };
  const accepted = await createAgentService(regression, tmpdir(), transport).invoke(selected, new AbortController().signal);
  assert.equal(accepted.status, 'completed');
  for (const [installed, input] of [
    [content, { ...request(), agentVariant: 'omit-fees' }],
    [regression, { ...selected, agentVariant: 'careful' }],
    [{ ...content, exercise: async () => ({ ...exercise, agentVariants: ['arbitrary'] }) }, { ...request(), agentVariant: 'arbitrary' }],
  ] as const) {
    const rejected = await createAgentService(installed as ContentService, tmpdir(), transport).invoke(input, new AbortController().signal);
    assert.equal(rejected.status, 'failed');
    if (rejected.status === 'failed') assert.equal(rejected.error.code, 'invalid_request');
  }
  assert.equal(calls, 1);
});
test('agent validates output schema and correlation and preserves operational refusal', async () => {
  for (const response of [{ ...success(), output: { label: 'invented' } }, { ...success(), runId: 'other' }, { ...success(), output: [] }]) {
    const result = await createAgentService(content, tmpdir(), async () => response).invoke(request(), new AbortController().signal);
    assert.equal(result.status, 'failed');
  }
  const refusal: AgentResponse = { schemaVersion: '1.0.0', runId: 'run-1', exampleId: 'row-1', status: 'failed', error: { code: 'provider_refusal', message: 'Refused.', retryable: false } };
  assert.deepEqual(await createAgentService(content, tmpdir(), async () => refusal).invoke(request(), new AbortController().signal), refusal);
});
test('agent cancellation and timeout reject transport that ignores signal', async () => {
  const agents = createAgentService(content, tmpdir(), async () => new Promise(() => {}));
  const controller = new AbortController();
  const cancelled = agents.invoke(request(), controller.signal);
  setTimeout(() => controller.abort(), 10);
  const a = await cancelled;
  assert.equal(a.status, 'failed');
  if (a.status === 'failed') assert.equal(a.error.code, 'cancelled');
  const b = await agents.invoke({ ...request(), deadlineMs: 20 }, new AbortController().signal);
  assert.equal(b.status, 'failed');
  if (b.status === 'failed') assert.equal(b.error.code, 'timeout');
});
test('agent document boundary verifies manifest, root, media, digest and duplicates', async t => {
  const root = await mkdtemp(join(tmpdir(), 'et-agent-doc-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from('synthetic test bytes');
  const path = join(root, 'page.png'); await writeFile(path, bytes);
  const document = { id: 'doc-1', absolutePath: path, sha256: sha256(bytes), mimeType: 'image/png' as const };
  let calls = 0;
  const documents = { ...content, exercise: async () => ({ ...exercise, inputSchema: { type: 'object', properties: { documentId: { type: 'string' } }, required: ['documentId'] } }), document: async () => ({ mimeType: 'image/png', bytes }) } as ContentService;
  const agents = createAgentService(documents, root, async () => { calls++; return success(); });
  const selected = { ...request(), exerciseId: '02-document-classification' as const, input: { documentId: 'doc-1' } };
  assert.equal((await agents.invoke({ ...selected, documents: [document] }, new AbortController().signal)).status, 'completed');
  for (const docs of [[{ ...document, absolutePath: '/etc/passwd' }], [{ ...document, sha256: '0'.repeat(64) }], [{ ...document, mimeType: 'application/pdf' }], [document, document]]) {
    assert.equal((await agents.invoke({ ...selected, documents: docs } as AgentRequest, new AbortController().signal)).status, 'failed');
  }
  assert.equal(calls, 1);
});

async function processFixture(t: test.TestContext, source: string) {
  const root = await mkdtemp(join(tmpdir(), 'et-python-process-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'tutorial_agents'));
  await writeFile(join(root, 'tutorial_agents', '__init__.py'), '');
  await writeFile(join(root, 'tutorial_agents', '__main__.py'), source);
  return createPythonTransport({ pythonExecutable: process.env.ET_TEST_PYTHON ?? '/usr/bin/python3', agentsSourceRoot: root, contractsPythonRoot: root }, profileFromEnv(env));
}
test('supervisor passes allowlisted environment only and emits one bounded JSON response', async t => {
  const python = await processFixture(t, 'import json,os,sys\njson.loads(sys.stdin.read())\nprint(json.dumps({"keys":sorted(os.environ)}))\n');
  const output = await python('tutorial_agents', {}, Date.now() + 2000, new AbortController().signal) as { keys: string[] };
  assert.ok(output.keys.includes('TUTORIAL_API_KEY'));
  assert.ok(!output.keys.includes('OPENAI_API_KEY'));
  assert.ok(!output.keys.includes('HOME'));
  assert.ok(!output.keys.includes('DOCKER_HOST'));
  assert.ok(!output.keys.includes('NODE_OPTIONS'));
});
test('supervisor rejects extra stdout, malformed JSON and over-limit protocol', async t => {
  for (const source of ['print("{}\\n{}")', 'print("not json")', 'import sys\nsys.stdout.write("x"*1048577)']) {
    const python = await processFixture(t, source);
    await assert.rejects(python('tutorial_agents', {}, Date.now() + 2000, new AbortController().signal));
  }
});
test('supervisor bounds hanging process and cancellation with no stderr secrets', async t => {
  const python = await processFixture(t, 'import time,sys\nsys.stderr.write("secret-never-publish")\nsys.stderr.flush()\ntime.sleep(30)');
  await assert.rejects(python('tutorial_agents', {}, Date.now() + 30, new AbortController().signal), (error: unknown) => (error as { detail: { code: string } }).detail.code === 'timeout' && !(error as Error).message.includes('secret'));
  const controller = new AbortController();
  const pending = python('tutorial_agents', {}, Date.now() + 2000, controller.signal);
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(pending, (error: unknown) => (error as { detail: { code: string } }).detail.code === 'cancelled');
});
