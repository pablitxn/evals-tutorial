import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { sha256 } from '@evals-tutorial/contracts/node';
import { assertContract } from '@evals-tutorial/contracts';
import type { ContentService } from '@evals-tutorial/contracts/services';

/** Replace the foundation consultation excerpt with verified prepared MAF source. */
export async function withPreparedConsultation(content:ContentService,root:string):Promise<ContentService>{
  const snapshot=JSON.parse(await readFile(resolve(root,'content/consultation-sources.json'),'utf8')) as {sourceFile:string;sourceFileHash:string;sources:Record<string,{pythonSource:string;sourceHash:string}>};
  const agentRoot=resolve(root,'apps/agents/src/tutorial_agents');
  const files=(await readdir(agentRoot)).filter(name=>name.endsWith('.py')||name==='domains.json').sort();
  const chunks:Buffer[]=[];
  for(const name of files)chunks.push(Buffer.from(name+'\0'),await readFile(join(agentRoot,name)));
  const sourceHash=sha256(Buffer.concat(chunks));
  if(snapshot.sourceFile!=='apps/agents/src/tutorial_agents/maf.py'||sha256(await readFile(resolve(root,snapshot.sourceFile)))!==snapshot.sourceFileHash)throw new Error('Prepared consultation primitive is stale');
  const tutorial=await content.tutorial();
  // A changed consultation surface invalidates previous browser work versions.
  tutorial.tutorialVersion+='-runtime1';
  for(const exercise of tutorial.exercises){
    const source=snapshot.sources[exercise.id];
    if(!source||source.sourceHash!==sourceHash)throw new Error('Prepared consultation snapshot is stale');
    exercise.pythonSource=source.pythonSource;exercise.exerciseVersion+='-runtime1';
  }
  assertContract('Tutorial',tutorial);
  return {...content,tutorial:async()=>structuredClone(tutorial),exercise:async id=>{
    const source=tutorial.exercises.find(item=>item.id===id);
    return source?structuredClone(source):content.exercise(id);
  }};
}
