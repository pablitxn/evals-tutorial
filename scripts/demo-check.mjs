import { fail,run,requireFile } from './lib.mjs';
try {
  if(process.argv.includes('--live')) {
    requireFile('scripts/live-check.mjs','Bounded provider/Phoenix live check');
    run(process.execPath,['scripts/live-check.mjs']);
  } else {
    run('npm',['run','contracts:check']);run('npm',['run','typecheck']);run('npm',['test']);
    run('npm',['run','test:docker']);
    run(process.execPath,['scripts/offline-http-check.mjs']);
    console.log('Offline contracts, Python serializers, restricted Docker, HTTP fixture flow and Phoenix recording verified. No provider calls made; live acceptance remains separate.');
  }
} catch(error){fail(error);}
