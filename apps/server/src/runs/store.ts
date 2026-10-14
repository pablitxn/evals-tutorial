import { mkdir, readdir, readFile, open } from 'node:fs/promises';
import { join } from 'node:path';
import { validateContract, type RunRecord } from '@evals-tutorial/contracts';

/** Append-only state receipts. Historical revisions and terminal runs are never rewritten. */
export class ReceiptStore {
  private readonly revisions = new Map<string, number>();
  constructor(private readonly directory: string) {}
  async load(): Promise<RunRecord[]> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const latest = new Map<string, RunRecord>();
    for (const name of (await readdir(this.directory)).sort()) {
      const match = /^([a-f0-9-]{36})\.(\d{6})\.json$/.exec(name);
      if (!match) continue;
      const value = JSON.parse(await readFile(join(this.directory, name), 'utf8')) as RunRecord;
      if (!validateContract('RunRecord', value).valid || value.runId !== match[1]) throw new Error('Stored run receipt is invalid');
      this.revisions.set(value.runId, Number(match[2])); latest.set(value.runId, value);
    }
    return [...latest.values()];
  }
  async append(record: RunRecord): Promise<void> {
    if (!validateContract('RunRecord', record).valid) throw new Error('Refusing to persist invalid run receipt');
    const revision = (this.revisions.get(record.runId) ?? 0) + 1;
    const handle = await open(join(this.directory, `${record.runId}.${String(revision).padStart(6, '0')}.json`), 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(record) + '\n', 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    this.revisions.set(record.runId, revision);
  }
}
