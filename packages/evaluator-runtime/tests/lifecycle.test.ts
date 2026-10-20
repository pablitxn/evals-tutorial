import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256 } from '@evals-tutorial/contracts/node';
import { ServiceError } from '@evals-tutorial/contracts/services';
import { DockerExecutor, dockerSecurityArgs } from '../src/index.js';

const imageDigest = 'sha256:' + 'a'.repeat(64);
const source = 'Synthetic source: the fake daemon never executes it';
type Config = { mode: 'timeout' | 'reject' | 'normal'; failRemove?: boolean; failWorker?: boolean; collision?: 'owner' | 'session'; holdImage?: boolean; holdCreate?: boolean; holdStart?: boolean; holdRemove?: boolean };
type Container = { id: string; name: string; labels: Record<string, string> };
const quarantined = (reason: unknown) => reason instanceof ServiceError
  && reason.detail.code === 'isolation_unavailable' && /cleanup.*quarantined/.test(reason.detail.message)
  && !/synthetic-private|--config|Command failed/.test(reason.detail.message);

async function setup(mode: Config['mode']) {
  const root = await mkdtemp(join(tmpdir(), 'et-lifecycle-test-'));
  const dockerBinary = join(root, 'docker.cjs');
  await copyFile(new URL('./fixtures/fake-docker.cjs', import.meta.url), dockerBinary);
  await chmod(dockerBinary, 0o700);
  const sessionKey = 'lifecycle-' + randomUUID();
  const quarantine = join(tmpdir(), 'et-wp06-docker-quarantine-' + sha256(sessionKey));
  const update = async (patch: Partial<Config>) => {
    const current = JSON.parse(await readFile(join(root, 'daemon.json'), 'utf8'));
    await writeFile(join(root, 'daemon.next'), JSON.stringify({ ...current, ...patch }));
    await rename(join(root, 'daemon.next'), join(root, 'daemon.json'));
  };
  await writeFile(join(root, 'daemon.json'), JSON.stringify({ mode }));
  const records = async (kind: string): Promise<Container[]> => {
    try { return await Promise.all((await readdir(join(root, kind))).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(join(root, kind, name), 'utf8')))); }
    catch (reason) { if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return []; throw reason; }
  };
  const publish = async (record: Container) => { await mkdir(join(root, 'containers'), { recursive: true }); await writeFile(join(root, 'containers', record.id + '.json'), JSON.stringify(record)); };
  const executor = () => new DockerExecutor({ imageDigest, dockerBinary, sessionKey });
  const commands = async (): Promise<string[][]> => (await readFile(join(root, 'commands.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const obligations = async () => { try { return await readdir(quarantine); } catch (reason) { if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return []; throw reason; } };
  const release = (phase: string) => writeFile(join(root, 'release-' + phase), '');
  const waiting = async (phase: string) => {
    for (let i = 0; i < 200; i++) {
      try { return JSON.parse(await readFile(join(root, phase + '-waiting'), 'utf8')) as Container; }
      catch (reason) { if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Fake daemon did not reach controlled ' + phase + ' barrier');
  };
  const dispose = async () => { await rm(root, { recursive: true, force: true }); await rm(quarantine, { recursive: true, force: true }); };
  return { root, sessionKey, quarantine, update, records, publish, executor, commands, obligations, release, waiting, dispose };
}

// Every removal must use an owned full ID; the fixture also accepts unsafe names to expose regressions.
async function assertImmutableRemovals(f: Awaited<ReturnType<typeof setup>>) {
  for (const args of (await f.commands()).filter(args => args[0] === 'rm')) assert(args.slice(2).every(id => /^[a-f0-9]{64}$/.test(id)));
}

test('timed-out create retains quarantine without unsafe removal until the late owned resource is observed', { timeout: 15000 }, async () => {
  const f = await setup('timeout'); const executor = f.executor();
  try {
    await assert.rejects(executor.compile(source), quarantined);
    assert.equal((await f.obligations()).length, 1);
    await assert.rejects(executor.available(), quarantined);
    assert.equal((await f.commands()).some(args => args[0] === 'start' || args[0] === 'rm'), false);
    const create = (await f.commands()).find(args => args[0] === 'create')!;
    assert.deepEqual(create.slice(create.indexOf('-i') + 1, -1), [...dockerSecurityArgs]);
    await f.publish((await f.records('pending'))[0]!);
    await executor.shutdown();
    assert.deepEqual(await f.records('containers'), []);
    assert.deepEqual(await f.obligations(), []);
    await assertImmutableRemovals(f);
  } finally { await f.dispose(); }
});

test('invisible uncertain create remains quarantined through shutdown and replacement until later owned recovery', async () => {
  const f = await setup('reject'); const first = f.executor(); const replacement = f.executor();
  try {
    await assert.rejects(first.compile(source), quarantined);
    await assert.rejects(first.shutdown(), quarantined);
    await assert.rejects(replacement.available(), quarantined);
    await assert.rejects(replacement.shutdown(), quarantined);
    assert.equal((await f.obligations()).length, 1);
    assert.equal((await f.commands()).some(args => args[0] === 'rm'), false);
    await f.publish((await f.records('pending'))[0]!);
    const recovered = f.executor();
    await recovered.available();
    assert.deepEqual(await f.obligations(), []);
    assert.deepEqual(await f.records('containers'), []);
    await recovered.shutdown();
    await assertImmutableRemovals(f);
  } finally { await f.dispose(); }
});

test('normal confirmed cleanup uses owned immutable IDs and leaves execution available', async () => {
  const f = await setup('normal'); const executor = f.executor();
  try {
    assert.equal((await executor.compile(source)).valid, true);
    assert.deepEqual(await f.obligations(), []);
    assert.deepEqual(await f.records('containers'), []);
    await executor.available(); await executor.shutdown();
    await assertImmutableRemovals(f);
  } finally { await f.dispose(); }
});

test('cleanup failure takes sanitized typed precedence over worker error and reconciles later', async () => {
  const f = await setup('normal'); const executor = f.executor();
  try {
    await f.update({ failWorker: true, failRemove: true });
    await assert.rejects(executor.compile(source), quarantined);
    assert.equal((await f.obligations()).length, 1);
    await assert.rejects(executor.available(), quarantined);
    await f.update({ failRemove: false }); await executor.shutdown();
    assert.deepEqual(await f.obligations(), []);
    assert.deepEqual(await f.records('containers'), []);
    await assertImmutableRemovals(f);
  } finally { await f.dispose(); }
});

for (const collision of ['owner', 'session'] as const) test('same-name foreign ' + collision + ' is never removed and its obligation stays quarantined', async () => {
  const f = await setup('reject'); const executor = f.executor();
  try {
    await f.update({ collision });
    await assert.rejects(executor.compile(source), quarantined);
    const foreign = (await f.records('containers'))[0]!;
    assert(foreign, 'Foreign resource must survive cleanup');
    assert.equal(foreign.labels['evals-tutorial.' + collision], 'foreign');
    await assert.rejects(executor.shutdown(), quarantined);
    assert.deepEqual(await f.records('containers'), [foreign]);
    assert.equal((await f.obligations()).length, 1);
    assert.equal((await f.commands()).some(args => args[0] === 'rm'), false, 'Filtered absence does not authorize name deletion');
    // Fixture-only disposition, followed by genuine owned late-resource recovery.
    await rm(join(f.root, 'containers'), { recursive: true });
    await f.publish((await f.records('pending'))[0]!);
    await executor.shutdown();
    await assertImmutableRemovals(f);
  } finally { await f.dispose(); }
});

test('image-inspect waiter cannot create or start after sibling quarantine closes admission', async () => {
  const f = await setup('reject'); const executor = f.executor();
  let waiting: Promise<unknown> | undefined;
  try {
    await executor.available();
    await f.update({ holdImage: true });
    waiting = executor.compile(source).then(() => null, reason => reason);
    await f.waiting('image');
    await assert.rejects(executor.compile(source), quarantined);
    await f.update({ mode: 'normal' }); await f.release('image');
    assert(quarantined(await waiting), 'Held preflight cannot return a valid compilation');
    assert.equal((await f.commands()).filter(args => args[0] === 'create').length, 1);
    assert.equal((await f.commands()).some(args => args[0] === 'start'), false);
    await assert.rejects(executor.shutdown(), quarantined);
  } finally { await f.release('image'); await waiting; await f.dispose(); }
});

test('in-flight create is cancelled by quarantine and cannot start after its daemon response', async () => {
  const f = await setup('normal'); const executor = f.executor();
  let waiting: Promise<unknown> | undefined;
  try {
    await executor.available(); await f.update({ holdCreate: true });
    waiting = executor.compile(source).then(() => null, reason => reason);
    await f.waiting('create'); await f.update({ mode: 'reject' });
    await assert.rejects(executor.compile(source), quarantined);
    await f.release('create');
    assert(quarantined(await waiting));
    assert.equal((await f.commands()).some(args => args[0] === 'start'), false);
    assert.deepEqual(await f.records('containers'), []);
    await assert.rejects(executor.shutdown(), quarantined);
    await assertImmutableRemovals(f);
  } finally { await f.release('create'); await waiting; await f.dispose(); }
});

test('quarantine cancels an already attached sibling worker instead of allowing a valid result', async () => {
  const f = await setup('normal'); const executor = f.executor();
  let waiting: Promise<unknown> | undefined;
  try {
    await executor.available(); await f.update({ holdStart: true });
    waiting = executor.compile(source).then(() => null, reason => reason);
    await f.waiting('start'); await f.update({ mode: 'reject' });
    await assert.rejects(executor.compile(source), quarantined);
    assert(quarantined(await waiting), 'Already attached worker must be aborted when quarantine begins');
    assert.deepEqual(await f.records('containers'), []);
    await assert.rejects(executor.shutdown(), quarantined);
    await assertImmutableRemovals(f);
  } finally { await f.release('start'); await waiting; await f.dispose(); }
});

test('completed worker cannot return a valid result after sibling quarantine during cleanup', async () => {
  const f = await setup('normal'); const executor = f.executor();
  let waiting: Promise<unknown> | undefined;
  try {
    await executor.available(); await f.update({ holdRemove: true });
    waiting = executor.compile(source).then(() => null, reason => reason);
    await f.waiting('remove'); await f.update({ mode: 'reject' });
    await assert.rejects(executor.compile(source), quarantined);
    await f.release('remove');
    assert(quarantined(await waiting), 'Final admission is checked after asynchronous cleanup');
    assert.deepEqual(await f.records('containers'), []);
    await assert.rejects(executor.shutdown(), quarantined);
    await assertImmutableRemovals(f);
  } finally { await f.release('remove'); await waiting; await f.dispose(); }
});
