import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createApp } from './http/app.js';
import { createTutorialServices } from './http/bootstrap.js';
import { sourceRevision } from './http/source-identity.js';
const root=resolve(import.meta.dirname,'../../..');
if(existsSync(resolve(root,'.env')))process.loadEnvFile(resolve(root,'.env'));
const revision=await sourceRevision(root);
let imageDigest:string|undefined;
try{imageDigest=execFileSync('docker',['image','inspect','evals-tutorial-runner:0.1.0','--format','{{.Id}}'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim();}catch{}
const runtime=await createTutorialServices({root,repositoryRevision:revision,imageDigest,env:process.env});
const webRoot=resolve(root,'apps/web/dist');
const server=createApp(runtime.services,{port:3000,...(existsSync(webRoot)?{webRoot}:{})});
server.listen(3000,'127.0.0.1',()=>console.log('Tutorial: http://127.0.0.1:3000 — explicit actions only; no inference requested.'));
let stopping=false;
async function shutdown(){
  if(stopping)return;stopping=true;
  server.close();
  try{await runtime.shutdown();server.closeAllConnections();}catch{process.exitCode=1;}
}
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{void shutdown();});
