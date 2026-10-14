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
