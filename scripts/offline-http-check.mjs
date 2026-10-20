import assert from 'node:assert/strict';
import { api,requestFor,waitRun,base } from './http-check.mjs';
import { fail } from './lib.mjs';
try{
  let status;
  for(let attempt=0;attempt<30;attempt++){
    try{status=await api('/api/status');if(status.capabilities.telemetry.available)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.ok(status,'Tutorial status is unavailable');assert.equal(status.phase,'integrated');assert.equal(status.automaticInference,false);
  for(const name of ['content','validation','runner','telemetry'])assert.equal(status.capabilities[name].available,true,`${name} is unavailable`);
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.ok(page.headers.get('content-security-policy').includes("script-src 'self'"));
  const tutorial=await api('/api/tutorial');assert.equal(tutorial.exercises.length,8);
  for(const exercise of tutorial.exercises){const valid=await api('/api/validate',requestFor(tutorial,exercise,'fixtures').snapshot);assert.equal(valid.valid,true,exercise.id+' starter must compile');}
  const request=requestFor(tutorial,tutorial.exercises[0],'fixtures');
  const accepted=await api('/api/runs',request);const run=await waitRun(accepted.runId);
  assert.equal(run.status,'completed');assert.equal(run.telemetryStatus,'recorded');assert.ok(run.rows.length>0&&run.rows.every(row=>row.fixtureMatched===true));
  assert.deepEqual(await api('/api/runs',request),accepted);
  await api('/api/runs/'+run.runId+'/telemetry',{});const repeated=await waitRun(run.runId);assert.deepEqual(repeated.phoenix,run.phoenix);
  const exercise=tutorial.exercises[1];
  const discriminating=requestFor(tutorial,exercise,'fixtures');discriminating.snapshot.source=tutorial.exercises[0].starterSource;
  const checked=await waitRun((await api('/api/runs',discriminating)).runId);
  assert.equal(checked.status,'completed');assert.equal(checked.telemetryStatus,'recorded');
  assert.ok(checked.rows.every(row=>row.fixtureMatched===true)&&checked.rows.some(row=>row.evaluation.label==='fail'),'Case one must correctly reject known bad responses');
  const broken=await api('/api/runs',requestFor(tutorial,exercise,'fixtures'));const failed=await waitRun(broken.runId);
  assert.ok(failed.rows.length>0&&failed.rows.every(row=>row.error&&!row.evaluation),'Unfinished evaluator must report operational errors without scores');
  assert.equal(failed.telemetryStatus,'recorded');
  const finalExample=tutorial.exercises.find(item=>item.id==='07-spec-regression');
  assert.ok(finalExample?.readOnly);
  const preparedRequest=requestFor(tutorial,finalExample,'fixtures');
  const preparedAccepted=await api('/api/runs',preparedRequest);
  const prepared=await waitRun(preparedAccepted.runId);
  assert.equal(prepared.status,'completed');assert.equal(prepared.telemetryStatus,'recorded');
  assert.equal(prepared.rows.length,5);
  assert.ok(prepared.rows.every(row=>row.fixtureMatched===true&&row.evaluation.criteria.length===6));
  assert.ok(prepared.rows.some(row=>row.evaluation.label==='fail'));
  assert.deepEqual(await api('/api/runs',preparedRequest),preparedAccepted);
  await api('/api/runs/'+prepared.runId+'/telemetry',{});
  assert.deepEqual((await waitRun(prepared.runId)).phoenix,prepared.phoenix);
  console.log(JSON.stringify({kind:'offline-integrated-http',sourceRevision:run.provenance.repositoryRevision,compiledStarters:8,introFixtureRows:run.rows.length,discriminatingFixtureRows:checked.rows.length,unfinishedEvaluatorRows:failed.rows.length,preparedFixtureRows:prepared.rows.length,runId:run.runId,discriminatingRunId:checked.runId,errorRunId:failed.runId,preparedRunId:prepared.runId,phoenix:run.phoenix,preparedPhoenix:prepared.phoenix,inferenceCalls:0},null,2));
}catch(error){fail(error);}
