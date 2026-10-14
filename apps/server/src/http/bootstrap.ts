import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { sha256 } from '@evals-tutorial/contracts/node';
import type { ServiceStatus } from '@evals-tutorial/contracts';
import type { TutorialServices } from '@evals-tutorial/contracts/services';
import { ServiceError } from '@evals-tutorial/contracts/services';
import { DockerExecutor } from '@evals-tutorial/evaluator-runtime';
import { createContentService } from './content.js';
import { withPreparedConsultation } from './consultation.js';
import { createRecordingRuns } from './recording.js';
import { createProviderServices, resolveAgentDocuments } from '../providers/index.js';
import { createRunnerServices } from '../runs/index.js';
import { createReviewServices } from '../review/index.js';
import { createTelemetryService, createTelemetryContext } from '../telemetry/index.js';

export async function createTutorialServices(options:{root:string;repositoryRevision:string;imageDigest?:string;dockerHost?:string;env:NodeJS.ProcessEnv}){
  const {root,env}=options;const contentRoot=resolve(root,'content');
  const content=await withPreparedConsultation(await createContentService(contentRoot),root);
  const missing={available:false,reason:'Configure an existing provider credential and explicit model to enable this action'};
  const isolation={available:false,reason:'Restricted Docker image or daemon is unavailable; run npm run install:all'};
  const status:ServiceStatus={schemaVersion:'1.0.0',phase:'integrated',provider:null,automaticInference:false,capabilities:{content:{available:true},agents:missing,judge:missing,review:missing,validation:isolation,runner:isolation,telemetry:{available:false,reason:'Local Phoenix is unavailable'}}};
  const sourceProjectName='evals-tutorial-agents';
  const phoenixUrl='http://127.0.0.1:6006';
  let provider:ReturnType<typeof createProviderServices>|undefined;
  try{
    provider=createProviderServices({content,contentRoot,pythonExecutable:resolve(root,'.venv/bin/python'),agentsSourceRoot:resolve(root,'apps/agents/src'),contractsPythonRoot:resolve(root,'packages/contracts/python'),env,telemetry:{endpoint:phoenixUrl+'/v1/traces',projectName:sourceProjectName}});
    status.provider=provider.provider;status.capabilities.agents={available:true};status.capabilities.judge={available:true};
  }catch(error){if(!(error instanceof ServiceError)||error.detail.code!=='configuration')throw error;}
  const telemetry=createTelemetryService({baseUrl:phoenixUrl,stateDirectory:resolve(root,'.local/phoenix-recording'),sourceProjectName});
  const services:TutorialServices={content,status:async()=>{
    try{const health=await fetch(phoenixUrl+'/healthz',{signal:AbortSignal.timeout(1500)});status.capabilities.telemetry=health.ok?{available:true}:{available:false,reason:'Local Phoenix health check failed'};}
    catch{status.capabilities.telemetry={available:false,reason:'Local Phoenix is unavailable; execution receipts are preserved'};}
    return structuredClone(status);
  }};
  let stopReview=()=>{};
  if(options.imageDigest){
    const executor=new DockerExecutor({imageDigest:options.imageDigest,dockerHost:options.dockerHost,sessionKey:sha256(resolve(root,'.local/runs'))});
    try{
      await executor.available();
      const runner=createRunnerServices({content,executor,imageDigest:options.imageDigest,repositoryRevision:options.repositoryRevision,dependencyLockHash:sha256(await readFile(resolve(root,'package-lock.json'))),receiptDirectory:resolve(root,'.local/runs'),...(provider?{agent:provider.agents,judge:provider.broker,provider:provider.provider}:{}),createTelemetryContext,resolveDocuments:async({exerciseId,input})=>{
        const ids=exerciseId==='02-document-classification'?[input.documentId as string]:exerciseId==='03-independent-tie-out'?input.documentIds as string[]:[];
        if(!ids.length)return [];
        const dataset=await content.dataset(exerciseId);
        if(!dataset.documentManifestRef)throw new Error('Installed document manifest is missing');
        return resolveAgentDocuments(contentRoot,dataset.documentManifestRef,ids);
      }});
      const recording=await createRecordingRuns({runs:runner.runs,content,telemetry,directory:resolve(root,'.local/recording-receipts')});
      services.validation=runner.validation;services.runs=recording.runs;services.recordRun=recording.recordRun;
      status.capabilities.validation={available:true};status.capabilities.runner={available:true};
      if(provider){const review=createReviewServices({content,runs:recording.runs,broker:provider.broker,provider:()=>provider!.provider});services.reviews=review.reviews;stopReview=review.shutdown;status.capabilities.review={available:true};}
    }catch(error){await executor.shutdown();if(!(error instanceof ServiceError)||error.detail.code!=='isolation_unavailable')throw error;}
  }
  return {services,async shutdown(){stopReview();await services.runs?.shutdown();}};
}
