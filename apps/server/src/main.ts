import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createApp } from './http/app.js';
import { createContentService } from './http/content.js';
import type { ServiceStatus } from '@evals-tutorial/contracts';
const missing = { available: false, reason: 'Producer service is not integrated' };
const status: ServiceStatus = { schemaVersion:'1.0.0', phase:'foundation', provider:null, automaticInference:false, capabilities:{ content:missing,validation:missing,runner:missing,agents:missing,judge:missing,telemetry:missing,review:missing } };
const webRoot=resolve('apps/web/dist');
let content;
try { content=await createContentService(resolve('content'));status.capabilities.content={available:true}; } catch { /* Missing or invalid source-owned content remains unavailable. */ }
const server=createApp({status:async()=>status,...(content?{content}:{})},{port:3000,...(existsSync(webRoot)?{webRoot}:{})});
server.listen(3000,'127.0.0.1',()=>console.log('Tutorial API: http://127.0.0.1:3000/api/status (foundation; inference disabled)'));
for (const sig of ['SIGTERM','SIGINT'] as const) process.on(sig,()=>server.close(()=>process.exit(0)));
