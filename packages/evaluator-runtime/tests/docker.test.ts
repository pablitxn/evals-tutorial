import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { DockerExecutor, dockerSecurityArgs } from '../src/index.js';
import { ServiceError } from '@evals-tutorial/contracts/services';
import { validateContract, type EvalInput, type Exercise, type JudgeRpcResponse } from '@evals-tutorial/contracts';
import { evaluateRow } from '../../../apps/server/src/runner/index.js';

const exec = promisify(execFile);
const image = process.env.ET_RUNNER_IMAGE;
const row: EvalInput = { input: {}, output: {}, expected: {}, metadata: { exampleId: 'synthetic-row', exerciseId: '01-starred-classifier', datasetVersion: '1.0.0' } };
const header = `import type {EvalInput, EvalResult} from '@evals-tutorial/contracts';\nimport type {EvalContext} from '@evals-tutorial/contracts/services';\n`;
const source = (body: string) => header + `export async function evaluate(row: EvalInput, ctx: EvalContext): Promise<EvalResult> { ${body} }`;
const code = (expected: string) => (error: unknown) => error instanceof ServiceError && error.detail.code === expected;
const forbiddenJudge = async (): Promise<JudgeRpcResponse> => { throw new Error('No paid calls in Docker tests'); };

test('actual restricted Docker boundary and compiler adversarial suite', { skip: !image, timeout: 180000 }, async t => {
  const executor = new DockerExecutor({ imageDigest: image! });
  const evaluate = async (body: string, timeoutMs = 3000, signal?: AbortSignal) => {
    const compiled = await executor.compile(source(body));
    assert.equal(compiled.valid, true, JSON.stringify(compiled.diagnostics));
    return executor.evaluate({ runId: 'synthetic-run', row, javascript: compiled.javascript!, timeoutMs }, forbiddenJudge, signal);
  };
  await t.test('syntax, exact types, exports, references and forbidden imports have source positions', async () => {
    const valid = await executor.compile(source("return {score:1,label:'pass',explanation:'fixture'};"));
    assert.equal(valid.valid, true);
    assert.equal(validateContract('ValidationResult', { codeHash: valid.codeHash, valid: valid.valid, diagnostics: valid.diagnostics }).valid, true);
    for (const broken of [header + 'export async function evaluate( {', source("return {score:'bad',label:'pass',explanation:'fixture'};"), 'export async function evaluate(row: string) { return 42; }', 'export const wrong = 1;', '/// <reference types="node" />\n' + source("return {score:1,label:'pass',explanation:'fixture'};"), "import type {Stats} from 'node:fs';\n" + source("return {score:1,label:'pass',explanation:'fixture'};"), source("await import('node:fs'); return {score:1,label:'pass',explanation:'fixture'};"), source("fetch('https://example.invalid'); return {score:1,label:'pass',explanation:'fixture'};")]) {
      const compiled = await executor.compile(broken);
      assert.equal(compiled.valid, false, broken);
      assert(compiled.diagnostics.every(item => item.line >= 1 && item.column >= 1));
    }
    const badType = await executor.compile(source("return {score:'bad',label:'pass',explanation:'fixture'};"));
    assert(badType.diagnostics.some(item => item.line === 3 && item.column > 1));
  });
  await t.test('criterion failure is completed execution; thrown exception and malformed result are errors', async () => {
    assert.deepEqual(await evaluate("return {score:0,label:'fail',explanation:'known incorrect'};"), { score: 0, label: 'fail', explanation: 'known incorrect' });
    await assert.rejects(evaluate("throw new Error('synthetic exception');"), code('runtime_error'));
    await assert.rejects(evaluate("return {score:0.5,label:'pass',explanation:'inconsistent'};"), code('protocol_error'));
  });
  await t.test('escaped Node APIs still see no host paths, socket, secrets or writable root', async () => {
    const sentinel = '/tmp/et-wp06-host-only.txt'; await writeFile(sentinel, 'host-only-synthetic');
    process.env.TUTORIAL_API_KEY = 'synthetic-host-sentinel';
    try {
      const result = await evaluate(`const p = ({} as any).constructor.constructor('return process')(); const fs = p.getBuiltinModule('fs'); let blocked = false; try { fs.writeFileSync('/opt/worker/forbidden', 'x'); } catch { blocked = true; } const pass = p.getuid() === 65532 && !fs.existsSync('${sentinel}') && !fs.existsSync('/workspace') && !fs.existsSync('/var/run/docker.sock') && !p.env.TUTORIAL_API_KEY && blocked; return {score:pass?1:0,label:pass?'pass':'fail',explanation:'host paths/socket/secret/root checks'};`);
      assert.equal(result.score, 1);
    } finally { delete process.env.TUTORIAL_API_KEY; }
  });
  await t.test('network none rejects socket connection even through escaped Node APIs', async () => {
    const result = await evaluate(`const p = ({} as any).constructor.constructor('return process')(); const net = p.getBuiltinModule('net'); const blocked = await new Promise<boolean>(resolve => { const socket = net.connect({host:'192.0.2.1',port:443}); socket.on('error', () => { socket.destroy(); resolve(true); }); socket.on('connect', () => { socket.destroy(); resolve(false); }); }); return {score:blocked?1:0,label:blocked?'pass':'fail',explanation:'synthetic TEST-NET connection rejected'};`);
    assert.equal(result.score, 1);
  });
  await t.test('tmpfs size prevents unbounded filesystem growth', async () => {
    const result = await evaluate(`const p = ({} as any).constructor.constructor('return process')(); const fs = p.getBuiltinModule('fs'); const B = p.getBuiltinModule('buffer').Buffer; let blocked = false; try { fs.writeFileSync('/tmp/flood', B.alloc(20*1024*1024)); } catch (e) { blocked = (e as any).code === 'ENOSPC'; } return {score:blocked?1:0,label:blocked?'pass':'fail',explanation:'tmpfs disk quota'};`);
    assert.equal(result.score, 1);
  });
  await t.test('infinite loop, heap pressure, stderr and protocol floods are bounded', async () => {
    await assert.rejects(evaluate('while (true) {}', 500), code('timeout'));
    await assert.rejects(evaluate("const arrays: unknown[] = []; while (true) arrays.push(new Array(100000).fill('synthetic'));", 8000), code('resource_limit'));
    await assert.rejects(evaluate("const p = ({} as any).constructor.constructor('return process')(); while(true) { p.stderr.write('x'.repeat(65536)); await new Promise(resolve => p.getBuiltinModule('timers').setImmediate(resolve)); }"), code('resource_limit'));
    await assert.rejects(evaluate("const p = ({} as any).constructor.constructor('return process')(); while(true) { p.stdout.write('x'.repeat(65536)); await new Promise(resolve => p.getBuiltinModule('timers').setImmediate(resolve)); }"), code('resource_limit'));
    await assert.rejects(evaluate("const p = ({} as any).constructor.constructor('return process')(); p.stdout.write('not-json\\n'); return {score:1,label:'pass',explanation:'fixture'};"), code('protocol_error'));
  });
  await t.test('actual running container has recorded restrictions; abort removes it', async () => {
    const compiled = await executor.compile(source('while (true) {}'));
    const controller = new AbortController();
    const running = executor.evaluate({ runId: 'synthetic-run', row, javascript: compiled.javascript!, timeoutMs: 15000 }, forbiddenJudge, controller.signal);
    // Attach rejection handler before cancellation.
    const rejected = assert.rejects(running, code('cancelled'));
    let ids = '';
    for (let attempt = 0; attempt < 50 && !ids.trim(); attempt++) {
      ids = (await exec('docker', ['ps', '-q', '--filter', 'label=evals-tutorial.owner=et-wp06'])).stdout;
      if (!ids.trim()) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ids.trim(), 'A real running container must be observed');
    const inspected = JSON.parse((await exec('docker', ['inspect', ids.trim()])).stdout)[0];
    assert.equal(inspected.Config.User, '65532:65532');
    assert.equal(inspected.HostConfig.NetworkMode, 'none');
    assert.equal(inspected.HostConfig.ReadonlyRootfs, true);
    assert.equal(inspected.HostConfig.Memory, 256 * 1024 * 1024);
    assert.equal(inspected.HostConfig.MemorySwap, inspected.HostConfig.Memory);
    assert.equal(inspected.HostConfig.PidsLimit, 32);
    assert.equal(inspected.HostConfig.NanoCpus, 1000000000);
    assert.deepEqual(inspected.HostConfig.CapDrop, ['ALL']);
    assert(inspected.HostConfig.SecurityOpt.includes('no-new-privileges:true'));
    assert.deepEqual(inspected.Mounts, []);
    assert(!inspected.Config.Env.some((item: string) => item.startsWith('TUTORIAL_API_KEY=')));
    assert(inspected.Config.Env.every((item: string) => ['PATH', 'NODE_VERSION', 'YARN_VERSION'].includes(item.split('=')[0]!)), 'Only the pinned image environment is inherited');
    if (process.env.ET_DOCKER_EVIDENCE) await writeFile(process.env.ET_DOCKER_EVIDENCE, JSON.stringify({ platform: process.platform + '/' + process.arch, imageDigest: image, flags: dockerSecurityArgs, inspected: { user: inspected.Config.User, environmentNames: inspected.Config.Env.map((item: string) => item.split('=')[0]), mounts: inspected.Mounts, hostConfig: inspected.HostConfig } }, null, 2) + '\n');
    controller.abort(); await rejected;
    assert.equal((await exec('docker', ['ps', '-aq', '--filter', 'label=evals-tutorial.owner=et-wp06'])).stdout.trim(), '');
  });
  await t.test('actual JSONL broker calls are bound and bounded; unknown methods terminate execution', async () => {
    const exercise = { mode: 'Mixed', maxJudgeCallsPerRow: 2, criteria: [{ id: 'recommendation', mode: 'LLM Judge' }] } as Exercise;
    let calls = 0;
    const broker = { bind: () => ({ judge: async () => { calls++; return { score: 1, label: 'pass' as const, explanation: 'explicit mock judge' }; } }) };
    const execute = async (body: string, mode: Exercise['mode'] = 'Mixed') => {
      const compiled = await executor.compile(source(body)); assert.equal(compiled.valid, true);
      return evaluateRow(executor, compiled.javascript!, 'synthetic-run', row, { ...exercise, mode }, broker, new AbortController().signal, Date.now() + 5000);
    };
    assert.equal((await execute("return ctx.judge({rubric:'Synthetic',criterionIds:['recommendation']});")).score, 1); assert.equal(calls, 1);
    await assert.rejects(execute("return ctx.judge({rubric:'Synthetic',criterionIds:['recommendation']});", 'Code'), code('budget_exceeded')); assert.equal(calls, 1);
    await assert.rejects(execute("return ctx.judge({rubric:'Synthetic',criterionIds:['unknown']});"), code('invalid_request')); assert.equal(calls, 1);
    await assert.rejects(execute("for(let n=0;n<3;n++) await ctx.judge({rubric:'Synthetic',criterionIds:['recommendation']}); return {score:1,label:'pass',explanation:'Synthetic'};"), code('budget_exceeded')); assert.equal(calls, 3);
    await assert.rejects(execute(`const p=({} as any).constructor.constructor('return process')(); p.stdout.write(JSON.stringify({schemaVersion:'1.0.0',type:'judge.request',id:'spoof',runId:'different-run',exampleId:row.metadata.exampleId,request:{rubric:'Synthetic',criterionIds:['recommendation']}})+'\\n'); await new Promise(()=>{}); return {score:1,label:'pass',explanation:'Synthetic'};`), code('protocol_error')); assert.equal(calls, 3);
    await assert.rejects(evaluate("const p=({} as any).constructor.constructor('return process')(); p.stdout.write(JSON.stringify({type:'read.file',path:'/etc/passwd'})+'\\n'); return {score:1,label:'pass',explanation:'Synthetic'};"), code('protocol_error'));
  });
  await t.test('startup removes only abandoned containers for the exact owned session', async () => {
    const sessionKey = 'synthetic-recovery-session';
    const orphan = (await exec('docker', ['--config', '/tmp/et-wp06-docker', 'create', '--label', 'evals-tutorial.owner=et-wp06', '--label', 'evals-tutorial.session=' + sessionKey, ...dockerSecurityArgs, image!])).stdout.trim();
    const recovered = new DockerExecutor({ imageDigest: image!, sessionKey });
    await recovered.available();
    await assert.rejects(exec('docker', ['inspect', orphan]));
    await recovered.shutdown();
  });
  await t.test('missing Docker fails closed without submitted-code execution', async () => {
    const missing = new DockerExecutor({ imageDigest: image!, dockerBinary: '/nonexistent-et-wp06-docker' });
    await assert.rejects(missing.compile(source("return {score:1,label:'pass',explanation:'fixture'};")), code('isolation_unavailable'));
  });
  await executor.shutdown();
});

test('virtual SDK wire declarations match the frozen public types exactly', async () => {
  const sdk = await readFile(new URL('../worker/sdk.d.ts', import.meta.url), 'utf8');
  const generated = await readFile(new URL('../../contracts/src/generated.ts', import.meta.url), 'utf8');
  assert(sdk.includes("declare module '@evals-tutorial/contracts' {\n" + generated + '\n}'));
  assert(!sdk.includes('declare const process'));
});
