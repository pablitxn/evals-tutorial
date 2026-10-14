import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ServiceError } from '@evals-tutorial/contracts/services';

export function unavailable(message = 'Phoenix recording could not be verified'): ServiceError {
  return new ServiceError({ code: 'telemetry_unavailable', message, retryable: true }, 503);
}

/** Atomic journals and a shared filesystem lock serialize retries across processes.
 * A crashed owner's lock is deliberately not stolen: inspect it while the server
 * is stopped, then remove it explicitly. Network writes cannot safely be fenced.
 */
export class RecordingState {
  constructor(private readonly directory: string) {}

  async read<T>(key: string): Promise<T | undefined> {
    try { return JSON.parse(await readFile(join(this.directory, `${key}.json`), 'utf8')) as T; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw unavailable('Phoenix recording journal is unreadable');
    }
  }

  async write(key: string, value: unknown): Promise<void> {
    const target = join(this.directory, `${key}.json`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  }

  async exclusive<T>(signal: AbortSignal, callback: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = join(this.directory, 'recording.lock');
    const deadline = Date.now() + 10000;
    while (true) {
      signal.throwIfAborted();
      try { await mkdir(lock); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) throw unavailable('Phoenix journal is locked; retry or inspect a stopped process');
        await delay(25, undefined, { signal });
      }
    }
    try { return await callback(); }
    finally { await rm(lock, { recursive: true }); }
  }
}
