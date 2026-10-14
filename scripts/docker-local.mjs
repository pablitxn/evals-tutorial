import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** Resolve an existing local context; remote daemons and credential configs are excluded. */
export function localDocker(root){
  const host=(!process.env.DOCKER_CONTEXT&&process.env.DOCKER_HOST)||execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim();
  if(!/^unix:\/\/\/[^\0\r\n]+$/.test(host))throw new Error('The tutorial requires an existing local Docker Unix socket');
  const config=resolve(root,'.local/docker-cli');mkdirSync(config,{recursive:true,mode:0o700});
  const env={...process.env,DOCKER_HOST:host,DOCKER_CONFIG:config};delete env.DOCKER_CONTEXT;
  return {host,env};
}
