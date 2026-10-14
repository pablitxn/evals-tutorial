import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer as createViteServer } from 'vite';
import { createApp } from '../../server/src/http/app.js';
import type { ServiceStatus, SourceSnapshot } from '@evals-tutorial/contracts';
import { createLoopbackApiProxy } from '../dev-proxy.js';

test('dev proxy adapts local browser POST origin and host while rejecting foreign/cross-site requests', async () => {
  const unavailable = { available: false };
  const status: ServiceStatus = { schemaVersion: '1.0.0', phase: 'foundation', provider: null, automaticInference: false,
    capabilities: { content: unavailable, validation: unavailable, runner: unavailable, agents: unavailable, judge: unavailable, telemetry: unavailable, review: unavailable } };
  let validated = 0;
  const api = createApp({ status: async () => status, validation: { validate: async () => { validated++; return { codeHash: 'a'.repeat(64), valid: true, diagnostics: [] }; } } });
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  const target = `http://127.0.0.1:${(api.address() as { port: number }).port}`;
  const allowedOrigins: string[] = [];
  const vite = await createViteServer({ configFile: false, root: 'apps/web', optimizeDeps: { noDiscovery: true, include: [] }, server: { host: '127.0.0.1', port: 0, proxy: { '/api': createLoopbackApiProxy(target, allowedOrigins) } } });
  try {
    await vite.listen();
    const port = (vite.httpServer!.address() as { port: number }).port;
    const origin = `http://127.0.0.1:${port}`;
    allowedOrigins.push(origin, `http://localhost:${port}`);
    const source: SourceSnapshot = { tutorialVersion: '1', exerciseId: 'intro', exerciseVersion: '1', rubricVersion: '1', datasetId: 'intro', datasetVersion: '1', datasetHash: 'a'.repeat(64), source: 'export async function evaluate() {}' };
    async function post(requestOrigin?: string, site = 'same-origin') {
      return fetch(`${origin}/api/validate`, { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': site, ...(requestOrigin ? { origin: requestOrigin } : {}) }, body: JSON.stringify(source) });
    }
    const accepted = await post(origin);
    assert.equal(accepted.status, 200); assert.equal((await accepted.json()).valid, true);
    assert.equal((await post(`http://localhost:${port}`)).status, 200);
    assert.equal((await post()).status, 200);
    assert.equal(validated, 3);
    for (const rejected of [await post('https://foreign.example'), await post('null'), await post(origin, 'cross-site')]) {
      assert.equal(rejected.status, 403); assert.equal((await rejected.json()).error.code, 'invalid_request');
    }
    assert.equal(validated, 3, 'rejected requests never reach validation');
  } finally {
    await vite.close(); api.closeAllConnections(); await new Promise<void>(resolve => api.close(() => resolve()));
  }
});
