import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fail,loadLocalEnv,root,run,requireFile } from './lib.mjs';
try {
  loadLocalEnv();
  run('npm',['run','env:check']);
  requireFile('apps/web/index.html','Learning UI');
  requireFile('apps/agents/src/tutorial_agents/__main__.py','Prepared Python agents');
  requireFile('packages/evaluator-runtime/Dockerfile','Isolated runner');
  run('npm',['run','build']);
  if(existsSync(resolve(root,'.local/server.pid'))) throw new Error('A tutorial process record exists; run npm run stop before starting again');
  run('docker',['compose','up','-d','phoenix']);
  mkdirSync(resolve(root,'.local'),{recursive:true});
  // The trusted Node process owns Python launches; startup itself does not infer.
  const child=spawn(process.execPath,['--import','tsx',resolve(root,'apps/server/src/main.ts')],{cwd:root,stdio:'inherit',env:process.env});
  const record=resolve(root,'.local/server.pid');
  writeFileSync(record,String(child.pid),{flag:'wx',mode:0o600});
  const cleanup=()=>{if(existsSync(record)&&readFileSync(record,'utf8')===String(child.pid))unlinkSync(record);};
  child.on('exit',(code,signal)=>{cleanup();process.exitCode=code??(signal==='SIGTERM'||signal==='SIGINT'?0:1);});
  child.on('error',error=>{cleanup();fail(error);});
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
  console.log('Starting http://127.0.0.1:3000 and Phoenix http://127.0.0.1:6006; readiness is reported by /api/status. No inference requested.');
} catch(error){fail(error);}
