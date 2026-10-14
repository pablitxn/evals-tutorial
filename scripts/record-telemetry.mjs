import { fail } from './lib.mjs';
try{
  const id=process.argv[2];
  if(!id||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id))throw new Error('Usage: npm run telemetry:retry -- RUN_ID');
  const base='http://127.0.0.1:3000/api/runs/'+encodeURIComponent(id);
  const response=await fetch(base+'/telemetry',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Stored telemetry retry was rejected; check the run ID and terminal execution receipt');
  for(let attempt=0;attempt<75;attempt++){
    const receipt=await(await fetch(base,{signal:AbortSignal.timeout(3000)})).json();
    if(receipt.telemetryStatus==='recorded'){console.log('Stored run recorded and verified. No agent, judge or review inference repeated.');console.log(receipt.phoenix.experimentUrl);process.exit(0);}
    if(receipt.telemetryStatus==='failed')throw new Error('Phoenix recording failed; execution results remain preserved. Check local Phoenix and retry this same run ID.');
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('Recording is still pending; inspect the same stored run. No inference was repeated.');
}catch(error){fail(error);}
