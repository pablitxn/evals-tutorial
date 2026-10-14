import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fail,loadLocalEnv,root,run } from './lib.mjs';
try {
  loadLocalEnv();
  const record=resolve(root,'.local/server.pid');
  if(existsSync(record)) {
    const pid=Number(readFileSync(record,'utf8'));
    if(!Number.isSafeInteger(pid)||pid<2) throw new Error('Invalid tutorial PID record');
    let command='';
    try {command=execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'});} catch{}
    if(command && !command.includes('apps/server/src/main.ts')) throw new Error('PID no longer belongs to the tutorial; refusing to signal another process');
    if(command) process.kill(pid,'SIGTERM');
    unlinkSync(record);
  }
  run('docker',['compose','stop','phoenix']);
  console.log('Tutorial stop requested. Phoenix volume retained.');
} catch(error){fail(error);}
