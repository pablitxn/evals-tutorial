import { fail, root, run } from './lib.mjs';
import { localDocker } from './docker-local.mjs';
try {
  const docker=localDocker(root);
  const image=run('docker',['image','inspect','evals-tutorial-runner:0.1.0','--format','{{.Id}}'],{env:docker.env,stdio:'pipe',encoding:'utf8'}).stdout.trim();
  if(!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('An immutable installed runner image is required');
  run(process.execPath,['--import','tsx','--test','--test-concurrency=1','packages/evaluator-runtime/tests/docker.test.ts','apps/server/src/runs/service.test.ts'],{env:{...docker.env,ET_RUNNER_IMAGE:image,ET_RUNNER_DOCKER_HOST:docker.host}});
} catch(error){fail(error);}
