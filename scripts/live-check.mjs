import assert from 'node:assert/strict';
import { api,requestFor,waitRun } from './http-check.mjs';
import { fail } from './lib.mjs';
// Only an explicit demo:check -- --live command invokes this paid intro probe.
try{
  const status=await api('/api/status');
  for(const name of ['agents','runner','telemetry'])assert.equal(status.capabilities[name].available,true,`${name} is unavailable`);
  const tutorial=await api('/api/tutorial');const exercise=tutorial.exercises[0];const dataset=await api('/api/exercises/intro/dataset');
  console.log(`Explicit live intro check: at most ${dataset.examples.length} prepared agent calls, 2048 output tokens each, no retry. No judge/review calls.`);
  const accepted=await api('/api/runs',requestFor(tutorial,exercise,'agent'));const run=await waitRun(accepted.runId);
  assert.equal(run.status,'completed');assert.equal(run.telemetryStatus,'recorded');assert.ok(run.rows.length===dataset.examples.length&&run.rows.every(row=>row.evaluation&&row.phoenix?.traceUrl));
  console.log(JSON.stringify({kind:'live-intro-only',runId:run.runId,provider:status.provider,rows:run.rows.length,phoenix:run.phoenix,remaining:'Multimodal perception, semantic judge, DOUBLE CHECK and full Mac rehearsal remain separate gates.'},null,2));
}catch(error){fail(error);}
