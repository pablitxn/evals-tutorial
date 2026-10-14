import { fail,run,requireFile } from './lib.mjs';
try {
  if(process.argv.includes('--live')) {
    requireFile('scripts/live-check.mjs','Bounded provider/Phoenix live check');
    run(process.execPath,['scripts/live-check.mjs']);
  } else {
    run('npm',['run','contracts:check']);run('npm',['run','typecheck']);run('npm',['test']);
    console.log('Offline foundation checks passed. No provider calls made.');
    requireFile('content/tutorial.json','Seven-destination content');
    requireFile('packages/evaluator-runtime/Dockerfile','Isolated evaluator');
    const response=await fetch('http://127.0.0.1:3000/api/status',{signal:AbortSignal.timeout(3000)});
    if(!response.ok) throw new Error('Tutorial health endpoint unavailable');
    const status=await response.json();
    if(status.phase!=='integrated') throw new Error('Foundation is healthy; integrated tutorial acceptance is still blocked');
    const phoenix=await fetch('http://127.0.0.1:6006/healthz',{signal:AbortSignal.timeout(3000)});
    if(!phoenix.ok) throw new Error('Phoenix health check failed');
    console.log('Offline services healthy; real provider, multimodal, judge and telemetry artifact checks were not exercised.');
  }
} catch(error){fail(error);}
