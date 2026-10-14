import { existsSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { sha256 } from '@evals-tutorial/contracts/node';

/** Run provenance comes from a clean checkout or verified extracted source manifest. */
export async function sourceRevision(root:string):Promise<string>{
  if(existsSync(resolve(root,'.git'))){
    const git=(args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:5000});
    if(git(['status','--porcelain','--untracked-files=all']).trim())throw new Error('Commit source changes before starting so run provenance identifies the exact source');
    return git(['rev-parse','HEAD']).trim();
  }
  const manifest=JSON.parse(await readFile(resolve(root,'SOURCE-MANIFEST.json'),'utf8')) as {sourceRevision:string;files:Array<{path:string;sha256:string}>};
  if(!/^[a-f0-9]{40}$/.test(manifest.sourceRevision)||!Array.isArray(manifest.files))throw new Error('Source manifest is missing or invalid');
  const actualRoot=await realpath(root);
  for(const file of manifest.files){
    const path=await realpath(resolve(root,file.path));
    if(!path.startsWith(actualRoot+sep)||sha256(await readFile(path))!==file.sha256)throw new Error('Extracted source differs from its candidate manifest');
  }
  return manifest.sourceRevision;
}
