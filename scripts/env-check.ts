import { existsSync } from 'node:fs';
import { profileFromEnv } from '../apps/server/src/providers/profile.js';
if(existsSync('.env'))process.loadEnvFile('.env');
try{
  profileFromEnv(process.env);
  console.log('Provider structure configured. No authentication or inference performed; credential values redacted.');
}catch{
  if(process.argv.includes('--require-provider')){console.error('Set an explicit TUTORIAL_PROVIDER, TUTORIAL_MODEL and existing TUTORIAL_API_KEY. Azure also requires a resource-root endpoint and API version.');process.exitCode=1;}
  else console.log('Provider unavailable: read-only lessons, validation and Code fixtures remain available with Docker. No inference requested.');
}
