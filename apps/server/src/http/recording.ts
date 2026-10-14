import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { assertContract, type RunRecord } from '@evals-tutorial/contracts';
import { canonicalJson, sha256 } from '@evals-tutorial/contracts/node';
import { ServiceError, type ContentService, type RunService, type TelemetryService } from '@evals-tutorial/contracts/services';

const terminal=new Set(['invalid','cancelled','completed','partial','failed','timed_out']);
type Overlay={fingerprint:string;record:RunRecord};
/** Recording augments immutable execution receipts; it cannot invoke an agent. */
export async function createRecordingRuns(options:{runs:RunService;content:Pick<ContentService,'dataset'>;telemetry:TelemetryService;directory:string}) {
  const {runs,content,telemetry,directory}=options;
  await mkdir(directory,{recursive:true,mode:0o700});
  const overlays=new Map<string,Overlay>();
  const monitoring=new Map<string,Promise<void>>();
  const recording=new Set<string>();
  const stopped=new AbortController();
  let queue:Promise<void>=Promise.resolve();
  const filename=(id:string)=>join(directory,sha256(id)+'.json');
  async function save(value:Overlay){
    assertContract('RunRecord',value.record);
    const temp=filename(value.record.runId)+'.'+randomUUID()+'.tmp';
    await writeFile(temp,JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'});
    await rename(temp,filename(value.record.runId));
    overlays.set(value.record.runId,structuredClone(value));
  }
  for(const name of await readdir(directory)){
    if(!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const value=JSON.parse(await readFile(join(directory,name),'utf8')) as Overlay;
    assertContract('RunRecord',value.record);
    if(!/^[a-f0-9]{64}$/.test(value.fingerprint)||name!==sha256(value.record.runId)+'.json') throw new Error('Invalid recording receipt');
    if(value.record.telemetryStatus==='pending'){
      value.record.telemetryStatus='failed';value.record.updatedAt=new Date().toISOString();await save(value);
    }else overlays.set(value.record.runId,value);
  }
  async function get(runId:string){
    const original=await runs.get(runId);const value=overlays.get(runId);
    if(!value) return terminal.has(original.status)&&original.rows.length&&monitoring.has(runId)?{...original,telemetryStatus:'pending' as const}:original;
    if(value.fingerprint!==sha256(canonicalJson(original))) throw new ServiceError({code:'conflict',message:'Execution receipt changed after recording was requested',retryable:false},409);
    return structuredClone(value.record);
  }
  async function recordRun(runId:string):Promise<RunRecord>{
    if(stopped.signal.aborted) throw new ServiceError({code:'cancelled',message:'Recording is stopping',retryable:true},503);
    const original=await runs.get(runId);
    if(!terminal.has(original.status)||!original.rows.length) throw new ServiceError({code:'invalid_request',message:'Recording requires a terminal run with stored rows',retryable:false},409);
    const current=await get(runId);
    if(current.telemetryStatus==='recorded'||recording.has(runId)) return current;
    recording.add(runId);
    const value:Overlay={fingerprint:sha256(canonicalJson(original)),record:{...structuredClone(original),telemetryStatus:'pending',updatedAt:new Date().toISOString()}};
    try{await save(value);}catch(error){recording.delete(runId);throw error;}
    queue=queue.then(async()=>{
      try{
        stopped.signal.throwIfAborted();
        const dataset=await content.dataset(original.request.snapshot.exerciseId);
        const result=await telemetry.record(dataset,structuredClone(original),stopped.signal);
        // Result IDs must map exactly onto existing rows, never create rows/scores.
        if(result.rowLinks.length!==original.rows.length) throw new Error('Recording row count mismatch');
        const keys=result.rowLinks.map(row=>canonicalJson([row.exampleId,row.fixtureId??null]));
        if(new Set(keys).size!==keys.length) throw new Error('Duplicate recording row');
        value.record={...structuredClone(original),telemetryStatus:'recorded',updatedAt:new Date().toISOString(),phoenix:result.phoenix,rows:original.rows.map(row=>{
          const link=result.rowLinks.find(link=>link.exampleId===row.exampleId&&link.fixtureId===row.fixtureId);
          if(!link) throw new Error('Missing recording row');
          return {...row,phoenix:link.phoenix};
        })};
        assertContract('RunRecord',value.record);
      }catch{
        // Preserve execution errors and scores. Recording failure is independent.
        value.record={...structuredClone(original),telemetryStatus:'failed',updatedAt:new Date().toISOString()};
      }
      await save(value);
    }).finally(()=>recording.delete(runId));
    // Keep the queue usable after a local disk failure; pending state remains explicit.
    queue=queue.catch(()=>{});
    return get(runId);
  }
  function watch(runId:string){
    if(monitoring.has(runId)||stopped.signal.aborted) return;
    const operation=(async()=>{
      while(!stopped.signal.aborted){
        const run=await runs.get(runId);
        if(terminal.has(run.status)){if(run.rows.length) await recordRun(runId);return;}
        await delay(100,undefined,{signal:stopped.signal});
      }
    })().catch(()=>{}).finally(()=>monitoring.delete(runId));
    monitoring.set(runId,operation);
  }
  const wrapped:RunService={
    async create(request){const accepted=await runs.create(request);watch(accepted.runId);return accepted;},
    get,
    async cancel(id){await runs.cancel(id);return get(id);},
    async shutdown(){stopped.abort();await runs.shutdown();await Promise.allSettled(monitoring.values());await queue;},
  };
  return {runs:wrapped,recordRun};
}
