import { LIMITS, validateContract, type SourceSnapshot, type ValidationResult } from '@evals-tutorial/contracts';
import { sha256 } from '@evals-tutorial/contracts/node';
import { ServiceError, type ValidationService } from '@evals-tutorial/contracts/services';
import type { Compilation, IsolatedExecutor } from '@evals-tutorial/evaluator-runtime';

export class DockerValidationService implements ValidationService {
  constructor(private readonly executor: IsolatedExecutor) {}
  async compile(snapshot: SourceSnapshot, signal?: AbortSignal): Promise<Compilation> {
    if (!validateContract('SourceSnapshot', snapshot).valid) throw new ServiceError({ code: 'invalid_request', message: 'Invalid source snapshot', retryable: false });
    if (Buffer.byteLength(snapshot.source) > LIMITS.sourceBytes) return {
      codeHash: sha256(snapshot.source), valid: false,
      diagnostics: [{ file: 'evaluator.ts', line: 1, column: 1, code: 'source_limit', severity: 'error', message: 'Evaluator source exceeds 64 KiB' }],
    };
    return this.executor.compile(snapshot.source, signal);
  }
  async validate(snapshot: SourceSnapshot, signal?: AbortSignal): Promise<ValidationResult> {
    const { codeHash, valid, diagnostics } = await this.compile(snapshot, signal);
    return { codeHash, valid, diagnostics };
  }
}
