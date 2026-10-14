import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { assertContract, validateDomain, type Dataset, type Document, type DocumentManifest, type Exercise, type Tutorial } from '@evals-tutorial/contracts';
import { datasetHash, sha256 } from '@evals-tutorial/contracts/node';
import { ServiceError, type ContentService } from '@evals-tutorial/contracts/services';
const IDS=['intro','01-starred-classifier','02-document-classification','03-independent-tie-out','04-policy-recommendation','05-package-readiness','06-simulated-travel'];
const notFound=()=>new ServiceError({code:'not_found',message:'Installed content not found',retryable:false},404);
/** Read-only verified snapshots; edit source and create a new version to reload. */
export async function createContentService(contentRoot: string): Promise<ContentService> {
  const root=await realpath(contentRoot);
  async function read(relative: string, maxBytes=1048576): Promise<Buffer> {
    const path=await realpath(resolve(root,relative));
    if(!path.startsWith(root+sep)) throw new Error('Content path leaves its owned root');
    const info=await stat(path);
    if(!info.isFile() || info.size>maxBytes) throw new Error('Invalid or oversized content file');
    return readFile(path);
  }
  const tutorial=JSON.parse((await read('tutorial.json')).toString('utf8')) as Tutorial;
  assertContract('Tutorial',tutorial);
  if(tutorial.exercises.some((exercise,i)=>exercise.id!==IDS[i])) throw new Error('Content must have exactly the intro and six ordered cases');
  const datasets=new Map<string,Dataset>();
  const documents=new Map<string,Document>();
  for(const exercise of tutorial.exercises) {
    if(exercise.readOnly!==(exercise.id==='intro')) throw new Error('Only the introduction is read-only');
    if(!exercise.agentVariants.includes(exercise.defaultAgentVariant)) throw new Error('Default agent variant is not installed');
    if(exercise.mode==='Code' && exercise.maxJudgeCallsPerRow!==0) throw new Error('Code criteria cannot use the judge broker');
    if(!/^[a-zA-Z0-9_-]+$/.test(exercise.datasetId) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(exercise.datasetVersion)) throw new Error('Dataset path identifiers are invalid');
    const dataset=JSON.parse((await read(`datasets/${exercise.datasetId}/${exercise.datasetVersion}.json`)).toString('utf8')) as Dataset;
    assertContract('Dataset',dataset);
    if(dataset.datasetId!==exercise.datasetId || dataset.datasetVersion!==exercise.datasetVersion || datasetHash(dataset)!==dataset.contentHash || dataset.contentHash!==exercise.datasetHash) throw new Error('Dataset version/hash mismatch');
    const exampleIds=new Set<string>();
    for(const example of dataset.examples) {
      if(exampleIds.has(example.id)) throw new Error('Duplicate example ID');exampleIds.add(example.id);
      if(!validateDomain(exercise.inputSchema,example.input).valid || !validateDomain(exercise.expectedSchema,example.expected).valid) throw new Error('Example violates its domain schema');
      const fixtureIds=new Set<string>();
      for(const fixture of example.fixtures) {
        if(fixtureIds.has(fixture.id)) throw new Error('Duplicate fixture ID');fixtureIds.add(fixture.id);
        if(!validateDomain(exercise.outputSchema,fixture.output).valid) throw new Error('Fixture violates output schema');
        if(fixture.expectedEvaluation.minScore>fixture.expectedEvaluation.maxScore) throw new Error('Invalid fixture expectation interval');
      }
    }
    if(dataset.documentManifestRef) {
      const bytes=await read(dataset.documentManifestRef.path);
      if(sha256(bytes)!==dataset.documentManifestRef.sha256) throw new Error('Document manifest hash mismatch');
      const manifest=JSON.parse(bytes.toString('utf8')) as DocumentManifest;assertContract('DocumentManifest',manifest);
      for(const doc of manifest.documents) {
        const existing=documents.get(doc.id);
        if(existing && JSON.stringify(existing)!==JSON.stringify(doc)) throw new Error('Conflicting document ID');
        const data=await read(doc.path,5000000);
        if(data.length!==doc.bytes || sha256(data)!==doc.sha256) throw new Error('Document byte/hash mismatch');
        documents.set(doc.id,doc);
      }
    }
    datasets.set(exercise.id,dataset);
  }
  const c2=datasets.get('02-document-classification')!.documentManifestRef;
  const c3=datasets.get('03-independent-tie-out')!.documentManifestRef;
  if(!c2 || JSON.stringify(c2)!==JSON.stringify(c3)) throw new Error('Document cases must share the same synthetic document manifest');
  const copy=<T>(value:T):T=>structuredClone(value);
  return {
    tutorial:async()=>copy(tutorial),
    exercise:async(id)=>{const value=tutorial.exercises.find(x=>x.id===id);if(!value) throw notFound();return copy(value);},
    dataset:async(id)=>{const value=datasets.get(id);if(!value) throw notFound();return copy(value);},
    document:async(id)=>{
      const doc=documents.get(id);if(!doc) throw notFound();
      const bytes=await read(doc.path,5000000);
      if(sha256(bytes)!==doc.sha256) throw new ServiceError({code:'source_stale',message:'Document changed after snapshot verification',retryable:false},409);
      return {mimeType:doc.mimeType,bytes};
    },
  };
}
