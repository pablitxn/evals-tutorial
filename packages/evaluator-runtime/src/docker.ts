import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIMITS, validateContract, type EvalResult, type JudgeRpcRequest, type JudgeRpcResponse } from '@evals-tutorial/contracts';
import { sha256 } from '@evals-tutorial/contracts/node';
import { ServiceError } from '@evals-tutorial/contracts/services';
import type { Compilation, EvaluationJob, IsolatedExecutor } from './types.js';

const exec = promisify(execFile);
const environment = (dockerHost?: string) => ({ PATH: process.env.PATH ?? '/usr/bin:/bin', ...(dockerHost ? { DOCKER_HOST: dockerHost } : {}) });
const fault = (code: ServiceError['detail']['code'], message: string) => new ServiceError({ code, message, retryable: ['isolation_unavailable', 'timeout'].includes(code) }, 503);
export const dockerSecurityArgs = Object.freeze([
  '--network=none', '--user=65532:65532', '--read-only', '--cap-drop=ALL',
  '--security-opt=no-new-privileges:true', '--memory=256m', '--memory-swap=256m',
  '--pids-limit=32', '--cpus=1', '--ulimit=nofile=64:64', '--ulimit=core=0',
  '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777', '--pull=never',
  '--log-driver=none',
]);
export interface DockerExecutorOptions {
  /** Immutable local Docker image ID from docker image inspect, never a tag. */
  imageDigest: string;
  dockerBinary?: string;
  compileTimeoutMs?: number;
  /** Stable hash of the host-owned receipt directory; one server per session. */
  sessionKey?: string;
  /** Trusted local daemon socket resolved by bootstrap, never a worker input. */
  dockerHost?: string;
}

export class DockerExecutor implements IsolatedExecutor {
  readonly imageDigest: string;
  private readonly docker: string;
  private readonly compileTimeout: number;
  private readonly active = new Set<AbortController>();
  private readonly finished = new Set<Promise<void>>();
  private closed = false;
  private readonly config = mkdtemp(join(tmpdir(), 'et-wp06-docker-config-'));
  private readonly sessionKey: string;
  private readonly dockerHost?: string;
  private initialization?: Promise<void>;
  private readonly cleanupDirectory: string;
  private readonly pendingCleanup = new Map<string, boolean>();
  private cleanupFailed = false;
  constructor(options: DockerExecutorOptions) {
    if (!/^sha256:[a-f0-9]{64}$/.test(options.imageDigest)) throw fault('configuration', 'Runner requires an immutable local image digest');
    this.imageDigest = options.imageDigest;
    this.docker = options.dockerBinary ?? 'docker';
    if (options.dockerHost && !/^unix:\/\/\/[^\0\r\n]+$/.test(options.dockerHost)) throw fault('configuration', 'Runner Docker endpoint must be a local Unix socket');
    this.dockerHost = options.dockerHost;
    this.sessionKey = options.sessionKey ?? randomUUID();
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(this.sessionKey)) throw fault('configuration', 'Invalid runner session key');
    this.cleanupDirectory = join(tmpdir(), 'et-wp06-docker-quarantine-' + sha256(this.sessionKey));
    this.compileTimeout = Math.min(options.compileTimeoutMs ?? LIMITS.codeTimeoutMs, LIMITS.codeTimeoutMs);
    if (this.compileTimeout < 1) throw fault('configuration', 'Invalid compiler deadline');
  }
  async available(signal?: AbortSignal): Promise<void> {
    if (this.closed && (this.cleanupFailed || this.pendingCleanup.size)) throw fault('isolation_unavailable', 'Docker worker cleanup remains quarantined');
    if (signal?.aborted || this.closed) throw fault('cancelled', 'Execution was cancelled');
    try {
      const options = { timeout: 5000, maxBuffer: 65536, env: environment(this.dockerHost), signal };
      const cli = ['--config', await this.config];
      const info = await exec(this.docker, [...cli, 'info', '--format', '{{json .}}'], options);
      const capability = JSON.parse(info.stdout);
      if (!capability.SecurityOptions?.some((item: string) => item.includes('seccomp')) || !capability.MemoryLimit || !capability.SwapLimit || !capability.PidsLimit || !capability.CpuCfsQuota) throw new Error('Required Docker isolation limits unavailable');
      const image = await exec(this.docker, [...cli, 'image', 'inspect', this.imageDigest, '--format', '{{.Id}}'], options);
      if (image.stdout.trim() !== this.imageDigest) throw new Error('Image mismatch');
      this.initialization ??= this.reapAbandoned(cli);
      await this.initialization;
    } catch (reason) {
      if (signal?.aborted) throw fault('cancelled', 'Execution was cancelled');
      if (reason instanceof ServiceError) throw reason;
      throw fault('isolation_unavailable', 'Restricted Docker execution or the pinned worker image is unavailable');
    }
  }
  private async reapAbandoned(cli: string[]): Promise<void> {
    await this.reconcileCleanup(cli);
    const options = { timeout: 5000, maxBuffer: 65536, env: environment(this.dockerHost) };
    const ids = (await exec(this.docker, [...cli, 'ps', '-aq', '--filter', 'label=evals-tutorial.owner=et-wp06', '--filter', 'label=evals-tutorial.session=' + this.sessionKey], options)).stdout.trim().split(/\s+/).filter(Boolean);
    if (ids.some(id => !/^[a-f0-9]{12,64}$/.test(id))) throw new Error('Invalid Docker inventory');
    if (ids.length) await exec(this.docker, [...cli, 'rm', '-f', ...ids], options);
  }
  private async retainCleanup(name: string): Promise<void> {
    // Write before submitting create: a killed CLI cannot acknowledge the daemon's outcome.
    await mkdir(this.cleanupDirectory, { recursive: true, mode: 0o700 });
    await writeFile(join(this.cleanupDirectory, name + '.json'), JSON.stringify({ version: 1, name }), { flag: 'wx', mode: 0o600, flush: true });
    this.pendingCleanup.set(name, false);
  }
  private async reconcileCleanup(cli: string[]): Promise<void> {
    try {
      let files: string[];
      try { files = await readdir(this.cleanupDirectory); }
      catch (reason) { if ((reason as NodeJS.ErrnoException).code === 'ENOENT') files = []; else throw reason; }
      if (files.length > LIMITS.rowConcurrency) throw new Error('Invalid cleanup inventory');
      for (const file of files) {
        if (!/^et-wp06-[a-f0-9-]{36}\.json$/.test(file)) throw new Error('Invalid cleanup obligation');
        const record = JSON.parse(await readFile(join(this.cleanupDirectory, file), 'utf8'));
        if (record.version !== 1 || record.name + '.json' !== file) throw new Error('Invalid cleanup obligation');
        if (!this.pendingCleanup.has(record.name)) this.pendingCleanup.set(record.name, false);
      }
      let failed = false;
      for (const name of this.pendingCleanup.keys()) {
        try { await this.removeWorker(cli, name); } catch { failed = true; }
      }
      if (failed) throw new Error('Unresolved cleanup obligation');
    } catch {
      this.closed = true; this.cleanupFailed = true;
      throw fault('isolation_unavailable', 'Docker worker cleanup remains quarantined; daemon creation or removal is unconfirmed');
    }
  }
  private async removeWorker(cli: string[], name: string): Promise<void> {
    // Removal and readback share the existing five-second cleanup budget.
    const deadline = Date.now() + 5000;
    const command = async (args: string[]) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Cleanup deadline expired');
      return exec(this.docker, [...cli, ...args], { timeout: remaining, maxBuffer: 65536, env: environment(this.dockerHost) });
    };
    const visible = async () => {
      const ids = (await command(['ps', '-aq', '--filter', 'label=evals-tutorial.owner=et-wp06', '--filter', 'label=evals-tutorial.session=' + this.sessionKey, '--filter', 'name=^/' + name + '$'])).stdout.trim().split(/\s+/).filter(Boolean);
      if (ids.length > 1 || ids.some(id => !/^[a-f0-9]{12,64}$/.test(id))) throw new Error('Invalid worker inventory');
      return ids.length === 1;
    };
    if (!this.pendingCleanup.get(name) && await visible()) this.pendingCleanup.set(name, true);
    await command(['rm', '-f', name]);
    if (await visible() || !this.pendingCleanup.get(name)) throw new Error('Worker creation or removal remains unconfirmed');
    await unlink(join(this.cleanupDirectory, name + '.json'));
    this.pendingCleanup.delete(name);
  }
  async compile(source: string, signal?: AbortSignal): Promise<Compilation> {
    if (Buffer.byteLength(source) > LIMITS.sourceBytes) throw fault('resource_limit', 'Evaluator source exceeds 64 KiB');
    const frame = await this.exchange({ operation: 'compile', source }, 'compile.result', this.compileTimeout, undefined, signal);
    const validation = { codeHash: sha256(source), valid: frame.valid, diagnostics: frame.diagnostics };
    if (!validateContract('ValidationResult', validation).valid || (validation.valid && typeof frame.javascript !== 'string')) throw fault('protocol_error', 'Compiler returned an invalid response');
    return { ...validation, ...(validation.valid ? { javascript: frame.javascript as string } : {}) } as Compilation;
  }
  async evaluate(job: EvaluationJob, judge: (request: JudgeRpcRequest) => Promise<JudgeRpcResponse>, signal?: AbortSignal): Promise<EvalResult> {
    const frame = await this.exchange({ operation: 'evaluate', javascript: job.javascript, runId: job.runId, row: job.row }, 'evaluation.result', Math.min(job.timeoutMs, LIMITS.judgeTimeoutMs), judge, signal);
    if (!validateContract('EvalResult', frame.result).valid) throw fault('protocol_error', 'Evaluator returned a non-normalized EvalResult');
    return frame.result as EvalResult;
  }
  private async exchange(input: object, completionType: string, timeoutMs: number, judge: ((request: JudgeRpcRequest) => Promise<JudgeRpcResponse>) | undefined, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (this.active.size >= LIMITS.rowConcurrency) throw fault('resource_limit', 'Isolated worker concurrency limit reached');
    await this.available(signal);
    if (this.active.size >= LIMITS.rowConcurrency) throw fault('resource_limit', 'Isolated worker concurrency limit reached');
    const payload = JSON.stringify(input) + '\n';
    if (Buffer.byteLength(payload) > LIMITS.protocolBytes) throw fault('resource_limit', 'Worker input exceeds the protocol limit');
    const controller = new AbortController();
    this.active.add(controller);
    let completed!: () => void;
    const completion = new Promise<void>(resolve => { completed = resolve; });
    this.finished.add(completion);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const name = 'et-wp06-' + randomUUID();
    let child: ReturnType<typeof spawn> | undefined;
    let phase = 'preparation';
    let result: Record<string, unknown> | undefined;
    let error: unknown;
    let removeError: unknown;
    let stderrBytes = 0;
    let heapLimit = false;
    let stdoutBytes = 0;
    let pending = 0;
    let judgeFrames = 0;
    let buffer = Buffer.alloc(0);
    const ids = new Set<string>();
    const stop = (reason: unknown) => { error ??= reason; controller.abort(); child?.kill('SIGKILL'); };
    const timeout = setTimeout(() => stop(fault('timeout', 'Isolated worker exceeded its deadline')), timeoutMs);
    const cancelled = () => stop(fault('cancelled', 'Execution was cancelled'));
    controller.signal.addEventListener('abort', cancelled, { once: true });
    try {
      if (controller.signal.aborted) throw fault('cancelled', 'Execution was cancelled');
      const cli = ['--config', await this.config];
      await this.retainCleanup(name);
      if (controller.signal.aborted) throw error ?? fault('cancelled', 'Execution was cancelled');
      phase = 'create';
      // Caller cancellation does not cancel daemon creation; retain an obligation before it.
      await exec(this.docker, [...cli, 'create', '--name', name, '--label', 'evals-tutorial.owner=et-wp06', '--label', 'evals-tutorial.session=' + this.sessionKey, '-i', ...dockerSecurityArgs, this.imageDigest], { timeout: 5000, maxBuffer: 65536, env: environment(this.dockerHost) });
      this.pendingCleanup.set(name, true);
      if (controller.signal.aborted) throw error ?? fault('cancelled', 'Execution was cancelled');
      phase = 'start';
      child = spawn(this.docker, [...cli, 'start', '-ai', name], { stdio: ['pipe', 'pipe', 'pipe'], env: environment(this.dockerHost) });
      await new Promise<void>(resolve => {
        child!.on('error', () => { error ??= fault('isolation_unavailable', 'Docker could not start the restricted worker'); resolve(); });
        child!.stdin!.on('error', () => { /* Process exit decides the result. */ });
        child!.stdout!.on('data', (chunk: Buffer) => {
          stdoutBytes += chunk.length;
          if (stdoutBytes > LIMITS.protocolBytes) { stop(fault('resource_limit', 'Worker stdout exceeded 1 MiB')); return; }
          buffer = Buffer.concat([buffer, chunk]);
          let newline;
          while ((newline = buffer.indexOf(10)) !== -1 && !controller.signal.aborted) {
            const line = buffer.subarray(0, newline).toString('utf8'); buffer = buffer.subarray(newline + 1);
            try {
              const frame = JSON.parse(line) as Record<string, unknown>;
              if (!frame || typeof frame !== 'object' || result) throw fault('protocol_error', 'Unexpected worker frame');
              if (frame.type === completionType) {
                if (pending) throw fault('protocol_error', 'Completion arrived with pending judge calls');
                result = frame;
              } else if (frame.type === 'execution.error') {
                if (!validateContract('OperationError', frame.error).valid) throw fault('protocol_error', 'Invalid worker error');
                stop(new ServiceError(frame.error as ServiceError['detail']));
              } else if (frame.type === 'judge.request' && judge) {
                const binding = input as { runId?: string; row?: { metadata: { exampleId: string } } };
                if (frame.runId !== binding.runId || frame.exampleId !== binding.row?.metadata.exampleId) throw fault('protocol_error', 'Judge frame does not match its immutable row');
                if (!validateContract('JudgeRpcRequest', frame).valid || ids.has(frame.id as string) || pending) throw fault('protocol_error', 'Invalid, repeated or concurrent judge frame');
                if (++judgeFrames > LIMITS.maxJudgeCallsPerRow) throw fault('budget_exceeded', 'Judge call budget exhausted');
                ids.add(frame.id as string); pending++;
                void judge(frame as JudgeRpcRequest).then(response => {
                  pending--;
                  if (controller.signal.aborted) return;
                  if (!validateContract('JudgeRpcResponse', response).valid || response.id !== frame.id || (response.result === undefined) === (response.error === undefined)) throw fault('protocol_error', 'Invalid broker response');
                  const wire = JSON.stringify(response) + '\n';
                  if (Buffer.byteLength(wire) > LIMITS.protocolBytes) throw fault('resource_limit', 'Broker response exceeded protocol limit');
                  child!.stdin!.write(wire);
                }).catch(stop);
              } else throw fault('protocol_error', 'Unknown worker method');
            } catch (reason) { stop(reason instanceof ServiceError ? reason : fault('protocol_error', 'Worker emitted malformed JSONL')); }
          }
        });
        child!.stderr!.on('data', (chunk: Buffer) => { stderrBytes += chunk.length; heapLimit ||= /heap out of memory/i.test(chunk.toString('utf8')); if (stderrBytes > 65536) stop(fault('resource_limit', 'Worker diagnostics exceeded 64 KiB')); });
        child!.on('close', (code) => {
          if (!error && (buffer.length || pending)) error = fault('protocol_error', 'Worker left an incomplete protocol');
          if (!error && code !== 0) error = fault(heapLimit || code === 137 || code === 134 ? 'resource_limit' : code === 125 ? 'isolation_unavailable' : 'runtime_error', 'Isolated worker exited without successful completion');
          if (!error && !result) error = fault('protocol_error', 'Worker returned no completion');
          resolve();
        });
        child!.stdin!.write(payload);
      });
    } catch (reason) {
      if (phase === 'preparation' && !(reason instanceof ServiceError)) this.closed = true;
      error ??= reason instanceof ServiceError ? reason : fault('isolation_unavailable', 'Docker worker ' + phase + ' failed');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', cancelled);
      try {
        if (this.pendingCleanup.has(name)) {
          if (phase === 'preparation') { await unlink(join(this.cleanupDirectory, name + '.json')); this.pendingCleanup.delete(name); }
          else await this.removeWorker(['--config', await this.config], name);
        }
      }
      catch { removeError = fault('isolation_unavailable', 'Docker worker cleanup remains quarantined after ' + phase + '; daemon creation or removal is unconfirmed'); this.closed = true; this.cleanupFailed = true; }
      this.active.delete(controller);
      this.finished.delete(completion); completed();
    }
    if (removeError) throw removeError;
    if (error) throw error;
    return result!;
  }
  async shutdown(): Promise<void> {
    this.closed = true;
    for (const controller of this.active) controller.abort();
    await Promise.all([...this.finished]);
    await this.reconcileCleanup(['--config', await this.config]);
    await rm(await this.config, { recursive: true, force: true });
    // Active exchanges own and await their cleanup; RunService awaits those tasks.
  }
}
