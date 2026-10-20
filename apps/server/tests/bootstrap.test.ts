import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateContract } from '@evals-tutorial/contracts';
import { ServiceError } from '@evals-tutorial/contracts/services';
import { DockerExecutor } from '@evals-tutorial/evaluator-runtime';
import { createTutorialServices } from '../src/http/bootstrap.js';

const repository = resolve(import.meta.dirname, '../../..');
const imageDigest = 'sha256:' + 'a'.repeat(64);
const unavailable = () => new ServiceError({ code: 'isolation_unavailable', message: 'Synthetic restricted worker unavailable', retryable: true }, 503);

async function degradedBootstrap(t: test.TestContext, cleanupError?: Error) {
  const root = await mkdtemp(join(tmpdir(), 'et-bootstrap-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await symlink(join(repository, 'content'), join(root, 'content'), 'dir');
  await symlink(join(repository, 'apps'), join(root, 'apps'), 'dir');
  const originalShutdown = DockerExecutor.prototype.shutdown;
  const preflight = t.mock.method(DockerExecutor.prototype, 'available', async () => { throw unavailable(); });
  const cleanup = t.mock.method(DockerExecutor.prototype, 'shutdown', async function(this: DockerExecutor) {
    // The unique test session has no worker or obligations; release its temporary config.
    await originalShutdown.call(this);
    if (cleanupError) throw cleanupError;
  });
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));
  const boot = createTutorialServices({ root, repositoryRevision: 'b'.repeat(40), imageDigest, env: {} });
  return { boot, preflight, cleanup, fetch };
}

test('unresolved worker quarantine preserves read-only bootstrap and exposes its reason without enabling execution', async t => {
  const quarantine = new ServiceError({ code: 'isolation_unavailable', message: 'Docker worker cleanup remains quarantined; daemon creation or removal is unconfirmed', retryable: true }, 503);
  const { boot, preflight, cleanup, fetch } = await degradedBootstrap(t, quarantine);
  const runtime = await boot;
  assert.equal((await runtime.services.content!.tutorial()).exercises.length, 8);
  const status = await runtime.services.status();
  assert.equal(validateContract('ServiceStatus', status).valid, true);
  assert.deepEqual(status.capabilities.runner, { available: false, reason: quarantine.detail.message });
  assert.deepEqual(status.capabilities.validation, status.capabilities.runner);
  assert.equal(status.capabilities.content.available, true);
  assert.equal(status.automaticInference, false);
  for (const field of ['runs', 'validation', 'reviews', 'recordRun'] as const) assert.equal(runtime.services[field], undefined);
  assert.equal(preflight.mock.calls.length, 1);
  assert.equal(cleanup.mock.calls.length, 1);
  assert.equal(fetch.mock.calls.length, 1, 'Status checks only the stubbed local telemetry health endpoint');
  await runtime.shutdown();
  assert.equal(cleanup.mock.calls.length, 1, 'Fallback does not retry uncertain worker operations');
});

test('ordinary isolation failure preserves read-only service status after successful cleanup', async t => {
  const { boot } = await degradedBootstrap(t);
  const runtime = await boot;
  const status = await runtime.services.status();
  assert.equal(status.capabilities.runner.available, false);
  assert.equal(status.capabilities.runner.reason, unavailable().detail.message);
  assert.equal(runtime.services.runs, undefined);
  await runtime.shutdown();
});

test('unexpected cleanup failures still reject bootstrap instead of claiming a usable fallback', async t => {
  const failure = new Error('Synthetic unexpected cleanup failure');
  const { boot } = await degradedBootstrap(t, failure);
  await assert.rejects(boot, error => error === failure);
});
