import { existsSync } from 'node:fs';
if(existsSync('.env')) process.loadEnvFile('.env');
const provider=process.env.TUTORIAL_PROVIDER;
const errors:string[]=[];
if(!['openai','azure_foundry'].includes(provider??'')) errors.push('TUTORIAL_PROVIDER must be openai or azure_foundry');
if(!process.env.TUTORIAL_MODEL?.trim()) errors.push('TUTORIAL_MODEL is missing');
if(!process.env.TUTORIAL_API_KEY?.trim()) errors.push('TUTORIAL_API_KEY is missing');
if(provider==='azure_foundry') {
  try {
    const endpoint=new URL(process.env.TUTORIAL_AZURE_ENDPOINT??'');
    if(endpoint.protocol!=='https:' || !endpoint.hostname.endsWith('.openai.azure.com') || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !['/','/openai/v1','/openai/v1/'].includes(endpoint.pathname)) throw new Error();
  } catch {errors.push('TUTORIAL_AZURE_ENDPOINT must be an HTTPS Azure OpenAI resource root or /openai/v1 URL');}
}
if(!process.env.PHOENIX_IMAGE || !/(:[0-9][^\s]*|@sha256:[a-f0-9]{64})$/.test(process.env.PHOENIX_IMAGE)) errors.push('PHOENIX_IMAGE must be a readiness-verified version or digest pin');
if(errors.length) {for(const message of errors) console.error(message);process.exitCode=1;}
else console.log('Structural configuration valid. Credential values redacted. No authentication, inference, Docker or provider capability check performed.');
