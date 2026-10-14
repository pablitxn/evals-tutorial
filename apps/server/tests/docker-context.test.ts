import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DockerExecutor } from '@evals-tutorial/evaluator-runtime';

test('only a trusted local socket reaches the private Docker CLI; backend credentials do not',async()=>{
  const root=await mkdtemp(join(tmpdir(),'et-local-docker-'));
  const binary=join(root,'docker-probe');const observations=join(root,'observations.jsonl');
  const imageDigest='sha256:'+'a'.repeat(64);
  const script=`#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(observations)},JSON.stringify({args,keys:Object.keys(process.env),host:process.env.DOCKER_HOST})+'\\n');if(args.includes('info'))console.log(JSON.stringify({SecurityOptions:['seccomp'],MemoryLimit:true,SwapLimit:true,PidsLimit:true,CpuCfsQuota:true}));else if(args.includes('inspect'))console.log(${JSON.stringify(imageDigest)});\n`;
  await writeFile(binary,script,{mode:0o700});
  const executor=new DockerExecutor({imageDigest,dockerBinary:binary,dockerHost:'unix:///tmp/trusted-test-only.sock'});
  try{
    await executor.available();
    const rows=(await readFile(observations,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(rows.length,3);
    for(const row of rows){assert.equal(row.host,'unix:///tmp/trusted-test-only.sock');assert.deepEqual(row.keys.sort(),['DOCKER_HOST','PATH']);assert.equal(row.args[0],'--config');}
    for(const host of ['tcp://127.0.0.1:2375','ssh://remote','unix:///tmp/socket\n'])assert.throws(()=>new DockerExecutor({imageDigest,dockerHost:host}),/local Unix socket/);
  }finally{await executor.shutdown();await rm(root,{recursive:true,force:true});}
});
