import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../../apps/server/src/http/app.js';
import { createContentService } from '../../apps/server/src/http/content.js';
import type { ServiceStatus } from '@evals-tutorial/contracts';

test('production UI assets and actual content share the restricted HTTP origin',async()=>{
  const webRoot=await mkdtemp(join(tmpdir(),'evals-tutorial-web-'));
  const built=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','apps/web','--outDir',webRoot,'--emptyOutDir'],{encoding:'utf8',timeout:30000});
  assert.equal(built.status,0,built.stderr || built.error?.message);
  const content=await createContentService(resolve('content'));
  const missing={available:false,reason:'Not integrated'};
  const status:ServiceStatus={schemaVersion:'1.0.0',phase:'foundation',provider:null,automaticInference:false,capabilities:{content:{available:true},validation:missing,runner:missing,agents:missing,judge:missing,telemetry:missing,review:missing}};
  const server=createApp({content,status:async()=>status},{webRoot});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try{
    const response=await fetch(base+'/');assert.equal(response.status,200);
    const csp=response.headers.get('content-security-policy')!;
    assert.ok(csp.includes("script-src 'self'"));assert.ok(!csp.includes('unsafe-eval'));
    const html=await response.text();assert.ok(html.includes('<div id="root"></div>'));
    const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(match=>match[1]!);
    assert.equal(assets.length,2);
    for(const path of assets){const asset=await fetch(base+path);assert.equal(asset.status,200);assert.ok((await asset.arrayBuffer()).byteLength>0);}
    const tutorial=await (await fetch(base+'/api/tutorial')).json() as {exercises:unknown[]};assert.equal(tutorial.exercises.length,7);
    assert.equal((await fetch(base+'/api/status',{headers:{origin:'https://untrusted.invalid'}})).status,403);
    assert.equal((await fetch(base+'/%2e%2e%2fpackage.json')).status,404);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(webRoot,{recursive:true,force:true});}
});
