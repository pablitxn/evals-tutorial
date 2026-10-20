import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createApp } from '../../apps/server/src/http/app.js';
import { createContentService } from '../../apps/server/src/http/content.js';
import { datasetHash, sha256 } from '@evals-tutorial/contracts/node';
import type { Dataset, DocumentManifest, ServiceStatus, Tutorial } from '@evals-tutorial/contracts';
test('actual corpus is served read-only with exact dataset and document identities',async()=>{
  const content=await createContentService(resolve('content'));
  const missing={available:false,reason:'Not integrated'};
  const status:ServiceStatus={schemaVersion:'1.0.0',phase:'foundation',provider:null,automaticInference:false,capabilities:{content:{available:true},validation:missing,runner:missing,agents:missing,judge:missing,telemetry:missing,review:missing}};
  const server=createApp({content,status:async()=>status});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try{
    const response=await fetch(base+'/api/tutorial');assert.equal(response.status,200);
    const tutorial=await response.json() as Tutorial;assert.equal(tutorial.exercises.length,8);
    for(const exercise of tutorial.exercises){
      const response=await fetch(base+`/api/exercises/${exercise.id}/dataset`);assert.equal(response.status,200);
      const dataset=await response.json() as Dataset;assert.equal(datasetHash(dataset),exercise.datasetHash);
    }
    const manifest=JSON.parse(await readFile('content/documents/tax-demo-v1/manifest.json','utf8')) as DocumentManifest;
    for(const mimeType of ['image/png','application/pdf']){
      const document=manifest.documents.find(d=>d.mimeType===mimeType)!;
      const response=await fetch(base+`/api/documents/${document.id}`);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),mimeType);
      assert.equal(sha256(new Uint8Array(await response.arrayBuffer())),document.sha256);
    }
    assert.equal((await fetch(base+'/api/tutorial',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404);
    assert.equal((await fetch(base+'/api/documents/not-installed')).status,404);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
