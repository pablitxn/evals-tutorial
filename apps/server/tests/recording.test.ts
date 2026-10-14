import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import type { ContentService, RunService, TelemetryService } from '@evals-tutorial/contracts/services';
import { createRecordingRuns } from '../src/http/recording.js';
import { fixtureDataset, fixtureRun } from '../../../packages/phoenix/tests/fixtures.js';

test('recording retries preserve immutable results, serialize writes and never repeat execution',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'et-recording-test-'));
  const dataset=fixtureDataset();const original=fixtureRun(dataset);original.telemetryStatus='not_requested';
  let executions=0,calls=0,fail=true;
  const runs:RunService={create:async()=>{executions++;return {runId:original.runId};},get:async()=>structuredClone(original),cancel:async()=>structuredClone(original),shutdown:async()=>{}};
  const content:Pick<ContentService,'dataset'>={dataset:async()=>dataset};
  const links={datasetId:'RGF0YXNldDox',datasetVersionId:'RGF0YXNldFZlcnNpb246MjU=',experimentId:'RXhwZXJpbWVudDo1OA==',experimentUrl:'http://127.0.0.1:6006/experiments/verified'};
  const telemetry:TelemetryService={record:async(_dataset,run)=>{calls++;assert.deepEqual(run,original);await delay(10);if(fail)throw new Error('Synthetic outage');return {phoenix:links,rowLinks:run.rows.map(row=>({exampleId:row.exampleId,fixtureId:row.fixtureId,phoenix:links}))};}};
  let runtime=await createRecordingRuns({runs,content,telemetry,directory});
  async function settled(){for(let i=0;i<100;i++){const record=await runtime.runs.get(original.runId);if(['recorded','failed'].includes(record.telemetryStatus))return record;await delay(5);}throw new Error('Recording did not settle');}
  try{
    await runtime.runs.create(original.request);
    const failed=await settled();assert.equal(failed.telemetryStatus,'failed');assert.deepEqual(failed.rows,original.rows);assert.equal(failed.error,original.error);
    fail=false;
    await Promise.all([runtime.recordRun(original.runId),runtime.recordRun(original.runId)]);
    const success=await settled();assert.equal(success.telemetryStatus,'recorded');assert.equal(success.phoenix!.experimentId,links.experimentId);assert.equal(executions,1);assert.equal(calls,2);
    await runtime.recordRun(original.runId);assert.equal(calls,2);
    await runtime.runs.shutdown();
    runtime=await createRecordingRuns({runs,content,telemetry,directory});
    assert.deepEqual(await runtime.runs.get(original.runId),success);assert.equal(calls,2);
    original.rows[0]!.evaluation!.score=0;
    await assert.rejects(runtime.runs.get(original.runId),/Execution receipt changed/);
  }finally{await runtime.runs.shutdown();await rm(directory,{recursive:true,force:true});}
});

test('malformed recording links never become successful telemetry or rewrite execution',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'et-recording-invalid-'));
  const dataset=fixtureDataset();const original=fixtureRun(dataset);original.telemetryStatus='not_requested';
  const runs:RunService={create:async()=>({runId:original.runId}),get:async()=>structuredClone(original),cancel:async()=>structuredClone(original),shutdown:async()=>{}};
  const telemetry:TelemetryService={record:async()=>({phoenix:{},rowLinks:[]})};
  const runtime=await createRecordingRuns({runs,content:{dataset:async()=>dataset},telemetry,directory});
  try{
    await runtime.recordRun(original.runId);
    for(let i=0;i<100;i++){const record=await runtime.runs.get(original.runId);if(record.telemetryStatus==='failed'){assert.deepEqual(record.rows,original.rows);return;}await delay(5);}
    assert.fail('Malformed recording was not rejected');
  }finally{await runtime.runs.shutdown();await rm(directory,{recursive:true,force:true});}
});
