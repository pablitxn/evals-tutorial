/** Real local Phoenix persistence using deterministic owned synthetic values. No inference. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { context, propagation } from '@opentelemetry/api';
import type { EvaluatorParams } from '@arizeai/phoenix-client/types/experiments';
import { createClient } from '@arizeai/phoenix-client';
import { createDataset, getDataset } from '@arizeai/phoenix-client/datasets';
import { runExperiment, getExperiment } from '@arizeai/phoenix-client/experiments';
import { getSpans } from '@arizeai/phoenix-client/spans';
import { getDatasetUrl, getExperimentUrl } from '@arizeai/phoenix-client/utils/urlUtils';

const baseUrl = 'http://127.0.0.1:16006';
const client = createClient({options:{baseUrl}});
let traceProject = '';
client.use({onResponse:async ({response}) => {
  if(response.ok && response.url.endsWith('/experiments')) {
    const data = await response.clone().json();
    traceProject = data.data?.project_name ?? '';
  }
}});
const examples = [{id:'synthetic-example-1',input:{starred:true},output:{label:'starred'},metadata:{mode:'fixture'}}];
const datasetParams = {client,name:'ET-WP-00-owned-synthetic',description:'Disposable deterministic readiness probe; no real agent.',examples};
const first = await createDataset(datasetParams);
const firstRead = await getDataset({client,dataset:{datasetId:first.datasetId}});
const second = await createDataset(datasetParams);
const secondRead = await getDataset({client,dataset:{datasetId:second.datasetId}});
assert.equal(first.datasetId,second.datasetId);
assert.equal(firstRead.versionId,secondRead.versionId);
assert.equal(secondRead.examples.length,1);
const changed = await createDataset({...datasetParams,examples:[{...examples[0],input:{starred:false},output:{label:'not_starred'}}]});
const changedRead = await getDataset({client,dataset:{datasetId:changed.datasetId}});
assert.notEqual(changedRead.versionId,firstRead.versionId);
const pinned = await getDataset({client,dataset:{datasetId:first.datasetId,versionId:firstRead.versionId}});
assert.equal(pinned.examples[0].input.starred,true);
const run = await runExperiment({
  client, dataset:{datasetId:first.datasetId,versionId:firstRead.versionId},
  experimentName:'ET-WP-00-fixture-pinned-version', experimentMetadata:{mode:'fixture',provider:'none'},
  concurrency:1,repetitions:1,record:true,dryRun:false,useBatchSpanProcessor:false,
  task: async (example) => {
    const carrier: Record<string,string> = {};
    propagation.inject(context.active(),carrier);
    assert(carrier.traceparent);
    execFileSync(process.env.ET_PYTHON!,[process.env.ET_MAF_PROBE!],{timeout:15000,
      env:{PATH:process.env.PATH!,ET_TRACEPARENT:carrier.traceparent,
        ET_TRACE_PROJECT:traceProject}});
    return {label:example.input.starred ? 'starred':'not_starred'};
  },
  evaluators:[{name:'label-match',kind:'CODE',evaluate:({output,expected}: EvaluatorParams) => {
    const score = Number((output as {label:string}).label === expected?.label);
    return {score,label:score ? 'pass':'fail',explanation:'Deterministic fixture label comparison.'};
  }}]
});
assert.equal(run.datasetVersionId,firstRead.versionId);
assert.equal(Object.keys(run.runs).length,1);
assert.equal(run.evaluationRuns?.[0].result?.score,1);
const persisted = await getExperiment({client,experimentId:run.id});
assert.equal(persisted.datasetVersionId,firstRead.versionId);
assert.equal(Object.values(persisted.runs)[0].error,null);
const taskTraceId = Object.values(run.runs)[0].traceId;
assert(taskTraceId);
let spans: Awaited<ReturnType<typeof getSpans>> | undefined;
for(let attempt=0;attempt<20;attempt++) {
  spans = await getSpans({client,project:{projectName:run.projectName!},traceIds:[taskTraceId],limit:30});
  if(spans.spans.some(span => span.name === 'Task: task') && spans.spans.length >= 13) break;
  await new Promise(resolve => setTimeout(resolve,250));
}
assert(spans?.spans.length);
const pythonSpans = spans.spans.filter(span => span.attributes?.['gen_ai.operation.name']);
assert(pythonSpans.length >= 2,'Expected MAF agent/model spans on Node task trace');
assert(pythonSpans.every(span => span.parent_id),'Expected parent span IDs');
const root = spans.spans.find(span => span.name === 'Task: task');
assert(root);
assert(pythonSpans.filter(span => span.span_kind === 'AGENT').every(span => span.parent_id === root.context.span_id));
const csvResponse = await client.GET('/v1/experiments/{experiment_id}/csv',{
  params:{path:{experiment_id:run.id}},parseAs:'text'});
assert(csvResponse.response.ok);
assert(csvResponse.data?.includes('annotation_label-match_score'));
assert(csvResponse.data?.includes('pass,1.0,Deterministic fixture label comparison.'));
const links = {dataset:getDatasetUrl({baseUrl,datasetId:first.datasetId}),
  experiment:getExperimentUrl({baseUrl,datasetId:first.datasetId,experimentId:run.id})};
for(const url of Object.values(links)) {
  const response = await fetch(url);
  assert.equal(response.status,200);
  assert((await response.text()).includes('<title>Phoenix</title>'));
}
const receipt = {status:'pass',mode:'fixture; real local persistence; no provider',serverVersion:await client.getServerVersion(),
  datasetId:first.datasetId,originalVersion:firstRead.versionId,changedVersion:changedRead.versionId,
  duplicateImport:'same ID/version, one example',pinnedOldVersion:'pass after latest changed',
  experiment:run,persistedExperiment:persisted,taskTraceId,spans,nodePythonContinuity:'pass: injected/extracted W3C parent',
  pythonMAFSpans:pythonSpans.length,evaluationCsv:csvResponse.data,links,
  linksVerification:'SDK helpers, persisted IDs, HTTP 200 SPA shell; browser rendering blocked'};
writeFileSync(process.env.ET_RECEIPT_PATH!,JSON.stringify(receipt,null,2));
console.log(JSON.stringify({status:'pass',datasetId:first.datasetId,experimentId:run.id,taskTraceId,projectName:run.projectName}));
