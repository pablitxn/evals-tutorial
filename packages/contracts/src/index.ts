import AjvModule from 'ajv';
import type schema from '../schema/v1.json';
import * as validators from './validators.generated.mjs';
export type * from './generated.js';
export const SCHEMA_VERSION = '1.0.0' as const;
export const LIMITS = Object.freeze({ sourceBytes: 65536, protocolBytes: 1048576, activeRuns: 1, rowConcurrency: 2, codeTimeoutMs: 10000, judgeTimeoutMs: 90000, providerTimeoutMs: 60000, runTimeoutMs: 300000, maxJudgeCallsPerRow: 2, maxProviderOutputTokens: 2048, maxRetries: 0 });
// Ajv's default export is a CJS constructor under NodeNext.
const createDomainAjv = () => new AjvModule.default({ allErrors: true, strict: false, strictNumbers: true });
let domainAjv: ReturnType<typeof createDomainAjv> | undefined;
export type SchemaName = keyof typeof schema.$defs;
export function validateContract(name: SchemaName, value: unknown): { valid: boolean; errors: string[] } {
  const validator = validators[name];
  if (!validator) throw new Error(`Unknown schema: ${name}`);
  const valid = validator(value) as boolean;
  return { valid, errors: (validator.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}`) };
}
export function assertContract(name: SchemaName, value: unknown): void {
  const result = validateContract(name, value);
  if (!result.valid) throw new Error(`Invalid ${name}: ${result.errors.join('; ')}`);
}

/** Domain schemas are trusted source-owned content, never submitted compiler input. */
export function validateDomain(schema: object, value: unknown): { valid: boolean; errors: string[] } {
  domainAjv ??= createDomainAjv();
  const check = domainAjv.compile(schema);
  return { valid: check(value) as boolean, errors: (check.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}`) };
}
