import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { assertContract, LIMITS, type SchemaName } from '@evals-tutorial/contracts';
import type { ReviewRequest, RunRequest, SourceSnapshot } from '@evals-tutorial/contracts';
import { ServiceError, type TutorialServices } from '@evals-tutorial/contracts/services';
import { stat, readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

function failure(code: 'invalid_request'|'not_found'|'not_implemented', message: string, status: number): never {
  throw new ServiceError({ code, message, retryable: code === 'not_implemented' }, status);
}
function json(res: ServerResponse, value: unknown, status = 200, schema?: SchemaName) {
  if (schema) assertContract(schema, value);
  const encoded=JSON.stringify(value);
  if(Buffer.byteLength(encoded)>LIMITS.protocolBytes) throw new Error('Response exceeds protocol limit');
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(encoded);
}
async function body(req: IncomingMessage, schema?: SchemaName): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') failure('invalid_request','Expected application/json',415);
  let bytes = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > LIMITS.protocolBytes) failure('invalid_request','Request exceeds 1 MiB',413);
    chunks.push(chunk);
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { failure('invalid_request','Invalid JSON',400); }
  if (schema) { try { assertContract(schema,value); } catch { failure('invalid_request',`Request does not match ${schema}`,400); } }
  else if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) failure('invalid_request','Expected empty JSON object',400);
  const source = (value as { source?: string; snapshot?: { source?: string } }).source ?? (value as { snapshot?: { source?: string } }).snapshot?.source;
  if (source && Buffer.byteLength(source,'utf8') > LIMITS.sourceBytes) failure('invalid_request','Source exceeds 64 KiB',413);
  return value;
}
export function createApp(services: TutorialServices, options: { port?: number; webRoot?: string } = {}) {
  const server = createServer(async (req,res) => {
    try {
      const port = (server.address() as { port?: number } | null)?.port ?? options.port ?? 3000;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host ?? '')) failure('invalid_request','Loopback Host required',403);
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) failure('invalid_request','Same-origin request required',403);
      if (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site'] as string)) failure('invalid_request','Cross-site request rejected',403);
      if (req.method !== 'GET' && req.method !== 'POST') failure('invalid_request','Method not allowed',405);
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const path = url.pathname;
      const need = <T>(value: T | undefined, name: string): T => value ?? failure('not_implemented',`${name} is not integrated in this foundation`,503);
      if (req.method === 'GET' && path === '/api/status') return json(res, await services.status(),200,'ServiceStatus');
      if (req.method === 'GET' && path === '/api/tutorial') return json(res,await need(services.content,'Content').tutorial(),200,'Tutorial');
      const dataset = path.match(/^\/api\/exercises\/([a-zA-Z0-9-]+)\/dataset$/);
      if (req.method === 'GET' && dataset) return json(res,await need(services.content,'Content').dataset(dataset[1]!),200,'Dataset');
      if (req.method === 'POST' && path === '/api/validate') return json(res,await need(services.validation,'Validation').validate(await body(req,'ValidateRequest') as SourceSnapshot),200,'ValidationResult');
      if (req.method === 'POST' && path === '/api/runs') return json(res,await need(services.runs,'Runs').create(await body(req,'RunRequest') as RunRequest),202,'AcceptedRun');
      if (req.method === 'POST' && path === '/api/reviews') return json(res,await need(services.reviews,'Review').create(await body(req,'ReviewRequest') as ReviewRequest),202,'AcceptedReview');
      const recording=path.match(/^\/api\/runs\/([a-zA-Z0-9._:-]+)\/telemetry$/);
      if(req.method==='POST' && recording){await body(req);return json(res,await need(services.recordRun,'Telemetry recording')(recording[1]!),202,'RunRecord');}
      const record = path.match(/^\/api\/(runs|reviews)\/([a-zA-Z0-9._:-]+)(\/cancel)?$/);
      if (record) {
        const svc = record[1] === 'runs' ? need(services.runs,'Runs') : need(services.reviews,'Review');
        const schema = record[1] === 'runs' ? 'RunRecord' : 'ReviewRecord';
        if (req.method === 'GET' && !record[3]) return json(res,await svc.get(record[2]!),200,schema);
        if (req.method === 'POST' && record[3]) { await body(req); return json(res,await svc.cancel(record[2]!),200,schema); }
      }
      const document=path.match(/^\/api\/documents\/([a-zA-Z0-9._:-]+)$/);
      if(req.method==='GET' && document) {
        const data=await need(services.content,'Content').document(document[1]!);
        res.writeHead(200,{'content-type':data.mimeType,'x-content-type-options':'nosniff','cache-control':'no-store'});
        return res.end(data.bytes);
      }
      if (!path.startsWith('/api/') && req.method === 'GET' && options.webRoot) {
        const root = await realpath(options.webRoot);
        const candidate = resolve(root, '.'+decodeURIComponent(path === '/' ? '/index.html' : path));
        if (candidate !== root && !candidate.startsWith(root+sep)) failure('not_found','Not found',404);
        let target: string;
        try { target=await realpath(candidate); } catch { failure('not_found','Not found',404); }
        if (!target.startsWith(root+sep) || !(await stat(target)).isFile()) failure('not_found','Not found',404);
        const mime: Record<string,string> = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
        res.writeHead(200,{'content-type':mime[extname(target)] ?? 'application/octet-stream','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'"});
        return res.end(await readFile(target));
      }
      failure('not_found','Not found',404);
    } catch(error) {
      const known = error instanceof ServiceError;
      json(res,{error:known ? error.detail : {code:'internal_error',message:'Internal service failure; inspect local sanitized diagnostics',retryable:false}},known ? error.httpStatus : 500,'ErrorResponse');
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
