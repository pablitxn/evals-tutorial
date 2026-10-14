import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const root=fileURLToPath(new URL('../',import.meta.url));
export const python=resolve(root,'.venv/bin/python');
export function run(command,args=[],options={}) {
  const result=spawnSync(command,args,{cwd:root,stdio:'inherit',...options});
  if(result.error || result.status!==0) throw new Error(`${command} failed (${result.status ?? result.error?.code})`);
  return result;
}
export function loadLocalEnv() {
  // Node's parser handles quoted values; don't print or copy credentials into artifacts.
  if(existsSync(resolve(root,'.env'))) process.loadEnvFile(resolve(root,'.env'));
}
export function fail(error) { console.error(error.message);process.exitCode=1; }
export function requireFile(path,label) { if(!existsSync(resolve(root,path))) throw new Error(`${label} is not integrated: missing ${path}`); }
export function readJSON(path) {return JSON.parse(readFileSync(resolve(root,path),'utf8'));}
