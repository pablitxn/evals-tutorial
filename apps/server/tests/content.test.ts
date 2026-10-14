import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { datasetHash, sha256 } from '@evals-tutorial/contracts/node';
import type { Dataset, Tutorial, ExerciseId, DocumentManifest } from '@evals-tutorial/contracts';
import { createContentService } from '../src/http/content.js';
async function fixture(root:string) {
  const ids:ExerciseId[]=['intro','01-starred-classifier','02-document-classification','03-independent-tie-out','04-policy-recommendation','05-package-readiness','06-simulated-travel'];
  const document=Buffer.from('synthetic test bytes only');
  const manifest:DocumentManifest={schemaVersion:'1.0.0',manifestId:'test-docs',version:'1',provenance:'Synthetic foundation loader test',documents:[{id:'doc-1',path:'documents/test.png',sha256:sha256(document),mimeType:'image/png',bytes:document.length,pageIds:['page-1'],synthetic:true}]};
  await mkdir(join(root,'documents'),{recursive:true});
  await writeFile(join(root,'documents/test.png'),document);
  const manifestText=JSON.stringify(manifest);
  await writeFile(join(root,'documents/manifest.json'),manifestText);
  const tutorial:Tutorial={schemaVersion:'1.0.0',tutorialVersion:'1',title:'Foundation contract fixtures',exercises:[]};
  for(const id of ids) {
    const value:Omit<Dataset,'contentHash'>={schemaVersion:'1.0.0',datasetId:id,datasetVersion:'1',documentManifestRef:{path:'documents/manifest.json',sha256:sha256(manifestText)},examples:[{id:'example-1',input:{starred:true},expected:{label:'starred'},metadata:{synthetic:true},fixtures:[{id:'good',output:{label:'starred'},expectedEvaluation:{allowedLabels:['pass'],minScore:1,maxScore:1,requiredEvidence:[]},rationale:'Matches independent label'}]}]};
    const dataset={...value,contentHash:datasetHash(value)};
    await mkdir(join(root,'datasets',id),{recursive:true});await writeFile(join(root,'datasets',id,'1.json'),JSON.stringify(dataset));
    tutorial.exercises.push({id,title:id,exerciseVersion:'1',rubricVersion:'1',mode:'Code',readOnly:id==='intro',lessonMarkdown:'Synthetic fixture',starterSource:'export async function evaluate() {}',pythonSource:'# Prepared synthetic fixture',datasetId:id,datasetVersion:'1',datasetHash:dataset.contentHash,criteria:[{id:'criterion',description:'Check independent label',mode:'Code'}],agentVariants:['baseline'],defaultAgentVariant:'baseline',maxJudgeCallsPerRow:0,inputSchema:{type:'object'},outputSchema:{type:'object'},expectedSchema:{type:'object'},officialDocs:[]});
  }
  await writeFile(join(root,'tutorial.json'),JSON.stringify(tutorial));
}
test('content loader verifies immutable hashes and rejects modified data/documents',async()=>{
  const root=await mkdtemp(join(tmpdir(),'et-content-'));
  try {
    await fixture(root);
    const service=await createContentService(root);
    assert.equal((await service.tutorial()).exercises.length,7);
    const first=await service.dataset('intro');first.examples[0]!.expected={changed:true};
    assert.deepEqual((await service.dataset('intro')).examples[0]!.expected,{label:'starred'});
    await assert.rejects(service.dataset('../.env'));
    const file=join(root,'datasets/intro/1.json');const json=JSON.parse(await readFile(file,'utf8'));json.examples[0].expected.label='changed';await writeFile(file,JSON.stringify(json));
    await assert.rejects(createContentService(root),/Dataset version\/hash mismatch/);
    await writeFile(join(root,'documents/test.png'),'edited');await assert.rejects(service.document('doc-1'),/changed after snapshot/);
  } finally {await rm(root,{recursive:true,force:true});}
});
