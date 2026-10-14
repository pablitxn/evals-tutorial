import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fail, loadLocalEnv, python, root, run, requireFile, readJSON } from './lib.mjs';
try {
  if(Number(process.versions.node.split('.')[0])!==24) throw new Error('Node 24.x is required');
  run('python3',['-c','import sys; assert sys.version_info[:2] == (3,12), "Python 3.12 is required"']);
  run('npm',['ci','--ignore-scripts']);
  if(!existsSync(python)) run('python3',['-m','venv','.venv']);
  run(python,['-m','pip','install','--cache-dir','.local/pip-cache','--require-hashes','-r','apps/agents/requirements.lock']);
  const result=run(python,['-c','import sysconfig; print(sysconfig.get_path("purelib"))'],{stdio:'pipe',encoding:'utf8'});
  writeFileSync(resolve(result.stdout.trim(),'evals_tutorial.pth'),resolve(root,'packages/contracts/python')+'\n'+resolve(root,'apps/agents/src')+'\n');
  run('npm',['run','contracts:check']);
  run('npm',['run','build']);
  loadLocalEnv();
  const pins=readJSON('scripts/runtime-pins.json');
  process.env.PHOENIX_IMAGE ||= pins.phoenixImage;
  run('docker',['info'],{stdio:'ignore'});
  if(!process.env.PHOENIX_IMAGE) throw new Error('Both language dependencies installed; pinned PHOENIX_IMAGE is missing. Image preparation is incomplete.');
  requireFile('packages/evaluator-runtime/Dockerfile','Isolated runner image');
  run('docker',['compose','pull','phoenix']);
  run('docker',['build','--tag','evals-tutorial-runner:0.1.0','--build-arg',`RUNNER_BASE_IMAGE=${pins.runnerBaseImage}`,'--file','packages/evaluator-runtime/Dockerfile','.']);
  console.log('Both dependency stacks and local images prepared; no inference requested.');
} catch(error){fail(error);}
