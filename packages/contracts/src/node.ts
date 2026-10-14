import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const canonicalize = createRequire(import.meta.url)('canonicalize') as (value: unknown) => string | undefined;
import type { Dataset, ReviewBinding } from './generated.js';
/** RFC 8785; reject non-JSON values before canonicalization. */
export function canonicalJson(value: unknown): string {
  function check(v: unknown): void {
    if(v === null || typeof v === 'boolean') return;
    if(typeof v === 'number') { if(!Number.isFinite(v) || Math.abs(v)>Number.MAX_SAFE_INTEGER) throw new Error('JSON number outside portable finite range'); return; }
    if(typeof v === 'string') { if (/[\ud800-\udfff]/u.test(v.replace(/[\ud800-\udbff][\udc00-\udfff]/gu, ''))) throw new Error('Unpaired Unicode surrogate'); return; }
    if(Array.isArray(v)) { for(const item of v) check(item); return; }
    if(typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) { for(const [key,item] of Object.entries(v)) { check(key);check(item); } return; }
    throw new Error('Not a JSON value');
  }
  check(value);
  return canonicalize(value)!;
}
export function sha256(value: string | Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
export function datasetHash(dataset: Omit<Dataset, 'contentHash'> | Dataset): string {
  const { contentHash: _ignored, ...preimage } = dataset as Dataset;
  return sha256(canonicalJson(preimage));
}
export function reviewBindingHash(binding: ReviewBinding): string { return sha256(canonicalJson(binding)); }
