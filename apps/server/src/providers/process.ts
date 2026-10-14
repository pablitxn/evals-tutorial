import { spawn } from 'node:child_process';
import { delimiter } from 'node:path';
import { LIMITS } from '@evals-tutorial/contracts';
import { ServiceError } from '@evals-tutorial/contracts/services';
import type { ProviderProfile } from './profile.js';

export interface PythonOptions {
  pythonExecutable: string;
  agentsSourceRoot: string;
  contractsPythonRoot: string;
  /** Optional trusted loopback collector; credentials never enter telemetry. */
  telemetry?: { endpoint: string; projectName: string };
}
export interface ProviderCall {
  role: 'judge' | 'review'; material: unknown; maxOutputTokens: number;
  deadlineEpochMs: number; signal: AbortSignal;
}
export type BrokerTransport = (call: ProviderCall) => Promise<unknown>;
export const operation = (code: ServiceError['detail']['code'], message: string, retryable = false) => new ServiceError({ code, message, retryable });

/** Trusted prepared Python only. This is never used to run submitted evaluators. */
export function createPythonTransport(options: PythonOptions, profile: ProviderProfile) {
  const env: Record<string, string> = {
    ...profile.processEnv, PYTHONPATH: [options.agentsSourceRoot, options.contractsPythonRoot].join(delimiter),
    PYTHONUTF8: '1', PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1',
  };
  if (options.telemetry) {
    const url = new URL(options.telemetry.endpoint);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash || url.pathname !== '/v1/traces') throw operation('configuration', 'Agent telemetry must use a trusted loopback /v1/traces collector.');
    env.TUTORIAL_TRACE_ENDPOINT = url.href;
    env.TUTORIAL_TRACE_PROJECT = options.telemetry.projectName;
  }
  return async (module: 'tutorial_agents' | 'tutorial_agents.broker', request: unknown, deadlineEpochMs: number, signal: AbortSignal): Promise<unknown> => {
    const line = JSON.stringify(request) + '\n';
    if (Buffer.byteLength(line) > LIMITS.protocolBytes) throw operation('resource_limit', 'Provider request exceeds the protocol limit.');
    if (signal.aborted) throw operation('cancelled', 'Provider operation cancelled.');
    const duration = Math.min(deadlineEpochMs - Date.now(), LIMITS.providerTimeoutMs);
    if (duration <= 0) throw operation('timeout', 'Provider deadline expired.');
    return new Promise((resolve, reject) => {
      const child = spawn(options.pythonExecutable, ['-m', module], { env, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
      const chunks: Buffer[] = [];
      let bytes = 0, diagnosticBytes = 0, settled = false;
      const finish = (error?: Error, value?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        if (error) { child.kill('SIGKILL'); reject(error); } else resolve(value);
      };
      const abort = () => finish(operation('cancelled', 'Provider operation cancelled.'));
      const timer = setTimeout(() => finish(operation('timeout', 'Provider deadline expired.')), duration);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      child.on('error', () => finish(operation('configuration', 'Prepared Python provider process could not start.')));
      child.stdin.on('error', () => finish(operation('protocol_error', 'Prepared Python process closed its input.')));
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > LIMITS.protocolBytes) finish(operation('resource_limit', 'Provider response exceeds the protocol limit.'));
        else chunks.push(chunk);
      });
      // Never retain or publish raw SDK diagnostics, which can contain secrets.
      child.stderr.on('data', (chunk: Buffer) => {
        diagnosticBytes += chunk.length;
        if (diagnosticBytes > 65536) finish(operation('resource_limit', 'Provider diagnostics exceed the limit.'));
      });
      child.on('close', code => {
        if (settled) return;
        if (code !== 0) return finish(operation('provider_unavailable', 'Prepared provider process failed.', true));
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (!raw.endsWith('\n') || raw.slice(0, -1).includes('\n')) throw new Error();
          finish(undefined, JSON.parse(raw));
        } catch { finish(operation('protocol_error', 'Expected one JSONL provider response.')); }
      });
      child.stdin.end(line);
    });
  };
}

/** Enforce host deadlines even when an injected transport ignores cancellation. */
export async function withDeadline<T>(task: (signal: AbortSignal) => Promise<T>, deadlineEpochMs: number, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw operation('cancelled', 'Provider operation cancelled.');
  const duration = Math.min(deadlineEpochMs - Date.now(), LIMITS.providerTimeoutMs);
  if (duration <= 0) throw operation('timeout', 'Provider deadline expired.');
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  let abort: () => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(operation('cancelled', 'Provider operation cancelled.')); };
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(operation('timeout', 'Provider deadline expired.')); }, duration);
  });
  try {
    if (signal.aborted) abort();
    const result = await Promise.race([Promise.resolve().then(() => task(controller.signal)), stopped]);
    if (signal.aborted) throw operation('cancelled', 'Provider operation cancelled.');
    if (Date.now() >= deadlineEpochMs) throw operation('timeout', 'Provider deadline expired.');
    return result;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw operation('provider_unavailable', 'Provider request failed.', true);
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
export async function boundedCall(transport: BrokerTransport, call: ProviderCall): Promise<unknown> {
  return withDeadline(signal => transport({ ...call, signal }), call.deadlineEpochMs, call.signal);
}
