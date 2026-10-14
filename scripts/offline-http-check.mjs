import assert from 'node:assert/strict';
import { api,requestFor,waitRun,base } from './http-check.mjs';
import { fail } from './lib.mjs';
try{
  const status=await api('/api/status');assert.equal(status.phase,'integrated');assert.equal(status.automaticInference,false);
  for(const name of ['content','validation','runner','telemetry'])assert.equal(status.capabilities[name].available,true,`${name} is unavailable`);
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.ok(page.headers.get('content-security-policy').includes("script-src 'self'"));
  const tutorial=await api('/api/tutorial');assert.equal(tutorial.exercises.length,7);
  for(const exercise of tutorial.exercises){const valid=await api('/api/validate',requestFor(tutorial,exercise,'fixtures').snapshot);assert.equal(valid.valid,true,exercise.id+' starter must compile');}
  const request=requestFor(tutorial,tutorial.exercises[0],'fixtures');
  const accepted=await api('/api/runs',request);const run=await waitRun(accepted.runId);
  assert.equal(run.status,'completed');assert.equal(run.telemetryStatus,'recorded');assert.ok(run.rows.length>0&&run.rows.every(row=>row.fixtureMatched===true));
  assert.ok(run.rows.some(row=>row.evaluation.label==='fail'),'Known bad responses must be correctly rejected');
  assert.deepEqual(await api('/api/runs',request),accepted);
  await api('/api/runs/'+run.runId+'/telemetry',{});const repeated=await waitRun(run.runId);assert.deepEqual(repeated.phoenix,run.phoenix);
  const exercise=tutorial.exercises[1];const broken=await api('/api/runs',requestFor(tutorial,exercise,'fixtures'));const failed=await waitRun(broken.runId);
  assert.ok(failed.rows.length>0&&failed.rows.every(row=>row.error&&!row.evaluation),'Unfinished evaluator must report operational errors without scores');
  assert.equal(failed.telemetryStatus,'recorded');
  console.log(JSON.stringify({kind:'offline-integrated-http',sourceRevision:run.provenance.repositoryRevision,compiledStarters:7,introFixtureRows:run.rows.length,unfinishedEvaluatorRows:failed.rows.length,runId:run.runId,errorRunId:failed.runId,phoenix:run.phoenix,inferenceCalls:0},null,2));
}catch(error){fail(error);}
