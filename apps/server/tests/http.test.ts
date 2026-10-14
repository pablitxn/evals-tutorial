import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { createApp } from '../src/http/app.js';
import type { ServiceStatus } from '@evals-tutorial/contracts';
const cap={available:false,reason:'Not integrated'};
const status:ServiceStatus={schemaVersion:'1.0.0',phase:'foundation',provider:null,automaticInference:false,capabilities:{content:cap,validation:cap,runner:cap,agents:cap,judge:cap,telemetry:cap,review:cap}};
test('loopback API does not infer; errors and origin checks fail closed',async()=>{
  let reads=0;
  const server=createApp({status:async()=>{reads++;return status;}});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const port=(server.address() as {port:number}).port;
  const url=`http://127.0.0.1:${port}`;
  try {
    const response=await fetch(url+'/api/status');assert.equal(response.status,200);assert.deepEqual(await response.json(),status);assert.equal(reads,1);
    assert.equal((await fetch(url+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,503);
    assert.equal((await fetch(url+'/api/status',{headers:{origin:'https://attacker.invalid'}})).status,403);
    assert.equal((await fetch(url+'/api/status',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
    const badHost=await new Promise<number|undefined>(resolve=>{const req=request({host:'127.0.0.1',port,path:'/api/status',headers:{host:'attacker.invalid'}},r=>{r.resume();resolve(r.statusCode);});req.end();});
    assert.equal(badHost,403);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('invalid snapshots never reach a producer',async()=>{
  let calls=0;
  const server=createApp({status:async()=>status,validation:{validate:async()=>{calls++;return {codeHash:'a'.repeat(64),valid:true,diagnostics:[]};}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=(server.address() as {port:number}).port;
  try{
    const response=await fetch(`http://127.0.0.1:${port}/api/validate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:'ignored',expected:{secret:'no'}})});
    assert.equal(response.status,400);assert.equal(calls,0);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
