import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chmod, copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256 } from '@evals-tutorial/contracts/node';
import { ServiceError } from '@evals-tutorial/contracts/services';
import { DockerExecutor, dockerSecurityArgs } from '../src/index.js';

const imageDigest = 'sha256:' + 'a'.repeat(64);
const source = 'Synthetic source: the fake daemon never executes it';
type State = { mode: 'timeout' | 'reject' | 'normal'; pending?: string; visible?: string | null; failRemove?: boolean; failWorker?: boolean };
const quarantined = (reason: unknown) => reason instanceof ServiceError
  && reason.detail.code === 'isolation_unavailable' && /cleanup.*quarantined/.test(reason.detail.message)
  && !/synthetic-private|--config|Command failed/.test(reason.detail.message);

async function setup(mode: State['mode']) {
  const root = await mkdtemp(join(tmpdir(), 'et-lifecycle-test-'));
  const dockerBinary = join(root, 'docker.cjs');
  await copyFile(new URL('./fixtures/fake-docker.cjs', import.meta.url), dockerBinary);
  await chmod(dockerBinary, 0o700);
  const sessionKey = 'lifecycle-' + randomUUID();
  const quarantine = join(tmpdir(), 'et-wp06-docker-quarantine-' + sha256(sessionKey));
  const state = async () => JSON.parse(await readFile(join(root, 'daemon.json'), 'utf8')) as State;
  const update = async (patch: Partial<State>) => writeFile(join(root, 'daemon.json'), JSON.stringify({ ...await state(), ...patch }));
  await writeFile(join(root, 'daemon.json'), JSON.stringify({ mode }));
  const executor = () => new DockerExecutor({ imageDigest, dockerBinary, sessionKey });
  const commands = async (): Promise<string[][]> => (await readFile(join(root, 'commands.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const obligations = async () => { try { return await readdir(quarantine); } catch (reason) { if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return []; throw reason; } };
  const dispose = async () => { await rm(root, { recursive: true, force: true }); await rm(quarantine, { recursive: true, force: true }); };
  return { root, sessionKey, quarantine, state, update, executor, commands, obligations, dispose };
}

test('timed-out create and successful early remove retain quarantine until the late daemon resource is observed and removed', { timeout: 15000 }, async () => {
  const f = await setup('timeout'); const executor = f.executor();
  try {
    await assert.rejects(executor.compile(source), quarantined);
    assert.equal((await f.obligations()).length, 1, 'An empty readback cannot settle an uncertain daemon create');
    await assert.rejects(executor.available(), quarantined);
    assert.equal((await f.commands()).some(args => args[0] === 'start'), false);
    const create = (await f.commands()).find(args => args[0] === 'create')!;
    assert.deepEqual(create.slice(create.indexOf('-i') + 1, -1), [...dockerSecurityArgs], 'Isolation flags are unchanged');
    // Explicit deterministic late backend completion, after CLI timeout and successful rm.
    await f.update({ visible: (await f.state()).pending });
    await executor.shutdown();
    assert.equal((await f.state()).visible, null);
    assert.deepEqual(await f.obligations(), []);
    const inventory = (await f.commands()).filter(args => args[0] === 'ps' && args.some(arg => arg.startsWith('name=')));
    assert(inventory.every(args => args.includes('label=evals-tutorial.owner=et-wp06') && args.includes('label=evals-tutorial.session=' + f.sessionKey)));
  } finally { await f.dispose(); }
});

test('invisible uncertain create remains durably quarantined through shutdown and a new executor', async () => {
  const f = await setup('reject'); const first = f.executor(); const replacement = f.executor();
  try {
    await assert.rejects(first.compile(source), quarantined);
    await assert.rejects(first.shutdown(), quarantined);
    assert.equal((await f.obligations()).length, 1);
    await assert.rejects(replacement.available(), quarantined);
    await assert.rejects(replacement.shutdown(), quarantined);
    assert.equal((await f.obligations()).length, 1, 'Shutdown does not erase an uncertain cleanup obligation');
    await f.update({ visible: (await f.state()).pending });
    const recovered = f.executor();
    await recovered.available();
    assert.deepEqual(await f.obligations(), []);
    assert.equal((await f.state()).visible, null);
    await recovered.shutdown();
  } finally { await f.dispose(); }
});

test('confirmed create, removal and empty readback release the obligation without quarantining normal execution', async () => {
  const f = await setup('normal'); const executor = f.executor();
  try {
    assert.equal((await executor.compile(source)).valid, true);
    assert.deepEqual(await f.obligations(), []);
    assert.equal((await f.state()).visible, null);
    await executor.available();
    await executor.shutdown();
  } finally { await f.dispose(); }
});

test('cleanup failure takes typed precedence over worker error and remains fail-closed until reconciled', async () => {
  const f = await setup('normal'); const executor = f.executor();
  try {
    await f.update({ failWorker: true, failRemove: true });
    await assert.rejects(executor.compile(source), quarantined);
    assert.equal((await f.obligations()).length, 1);
    await assert.rejects(executor.available(), quarantined);
    await f.update({ failRemove: false });
    await executor.shutdown();
    assert.deepEqual(await f.obligations(), []);
    assert.equal((await f.state()).visible, null);
  } finally { await f.dispose(); }
});
