import { randomUUID } from 'node:crypto';
export const base='http://127.0.0.1:3000';
export async function api(path,body){
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw new Error(`HTTP ${response.status}: ${data.error?.code??'invalid_response'}`);return data;
}
export function requestFor(tutorial,exercise,mode){return {requestId:'check-'+randomUUID(),mode,agentVariant:exercise.defaultAgentVariant,snapshot:{tutorialVersion:tutorial.tutorialVersion,exerciseId:exercise.id,exerciseVersion:exercise.exerciseVersion,rubricVersion:exercise.rubricVersion,datasetId:exercise.datasetId,datasetVersion:exercise.datasetVersion,datasetHash:exercise.datasetHash,source:exercise.starterSource}};}
export async function waitRun(runId,{recording=true}={}){
  for(let attempt=0;attempt<370;attempt++){
    const run=await api('/api/runs/'+encodeURIComponent(runId));
    const terminal=['invalid','cancelled','completed','partial','failed','timed_out'].includes(run.status);
    if(terminal&&(!recording||['recorded','failed','not_requested'].includes(run.telemetryStatus)))return run;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('Run did not settle within its bounded execution/recording window');
}
