import { readFile, realpath, stat } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';
import { LIMITS, validateContract, validateDomain } from '@evals-tutorial/contracts';
import type { AgentRequest, AgentResponse } from '@evals-tutorial/contracts';
import { sha256 } from '@evals-tutorial/contracts/node';
import type { AgentService, ContentService } from '@evals-tutorial/contracts/services';
import { ServiceError } from '@evals-tutorial/contracts/services';
import { operation, withDeadline } from './process.js';

export type AgentTransport = (request: AgentRequest, deadlineEpochMs: number, signal: AbortSignal) => Promise<unknown>;
export const PREPARED_VARIANTS = ['baseline', 'careful'] as const;
export function containsReference(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsReference);
  if (value && typeof value === 'object') return Object.entries(value).some(([key, child]) => ['expected', 'fixtures', 'source', 'starterSource', 'pythonSource', 'expectedEvaluation'].includes(key) || containsReference(child));
  return false;
}
export function createAgentService(content: ContentService, contentRoot: string, transport: AgentTransport): AgentService {
  return { async invoke(original, signal): Promise<AgentResponse> {
    const request = structuredClone(original);
    const failure = (error: unknown): AgentResponse => {
      const response: AgentResponse = { schemaVersion: '1.0.0', runId: request?.runId ?? 'invalid', exampleId: request?.exampleId ?? 'invalid', status: 'failed', error: error instanceof ServiceError ? error.detail : { code: 'runtime_error', message: 'Prepared agent operation failed.', retryable: false } };
      if (!validateContract('AgentResponse', response).valid) { response.runId = 'invalid'; response.exampleId = 'invalid'; }
      return response;
    };
    try {
      if (!validateContract('AgentRequest', request).valid || Buffer.byteLength(JSON.stringify(request)) > LIMITS.protocolBytes || containsReference(request.input)) throw operation('invalid_request', 'Invalid agent request or reference material in agent input.');
      if (signal.aborted) throw operation('cancelled', 'Agent operation cancelled.');
      const deadline = Date.now() + request.deadlineMs;
      const exercise = await content.exercise(request.exerciseId);
      if (!exercise.agentVariants.includes(request.agentVariant) || !PREPARED_VARIANTS.includes(request.agentVariant as typeof PREPARED_VARIANTS[number])) throw operation('invalid_request', 'Unknown prepared agent variant.');
      if (!validateDomain(exercise.inputSchema, request.input).valid) throw operation('invalid_request', 'Agent input does not match the exercise schema.');
      const documentCase = ['02-document-classification', '03-independent-tie-out'].includes(request.exerciseId);
      if (!documentCase && request.documents.length) throw operation('invalid_request', 'This prepared agent does not consume documents.');
      if (request.exerciseId === '02-document-classification' && (request.documents.length !== 1 || request.documents[0]!.id !== request.input.documentId)) throw operation('invalid_request', 'Classification requires its declared document.');
      if (request.exerciseId === '03-independent-tie-out' && (!Array.isArray(request.input.documentIds) || JSON.stringify([...request.documents.map(d => d.id)].sort()) !== JSON.stringify([...request.input.documentIds].sort()))) throw operation('invalid_request', 'Tie-out requires its declared document IDs.');
      if (request.documents.length > 8) throw operation('resource_limit', 'At most eight document pages per agent request.');
      const root = await realpath(contentRoot);
      let totalBytes = 0;
      const ids = new Set<string>();
      for (const document of request.documents) {
        if (ids.has(document.id)) throw operation('invalid_request', 'Duplicate document ID.');
        ids.add(document.id);
        // PDF serialization is proven separately; live PDF perception remains gated.
        if (!['image/png', 'image/jpeg'].includes(document.mimeType)) throw operation('unsupported_media', 'This tutorial profile accepts synthetic PNG/JPEG pages; PDF perception is not enabled.');
        const path = await realpath(document.absolutePath);
        const rel = relative(root, path);
        if (rel.startsWith('..') || isAbsolute(rel)) throw operation('invalid_request', 'Resolved document is outside the content root.');
        const size = (await stat(path)).size;
        if (size > 4 * 1024 * 1024 || (totalBytes += size) > 8 * 1024 * 1024) throw operation('resource_limit', 'Synthetic documents exceed the byte limit.');
        const bytes = await readFile(path);
        const verified = await content.document(document.id);
        if (document.mimeType !== verified.mimeType || sha256(bytes) !== document.sha256 || sha256(verified.bytes) !== document.sha256) throw operation('invalid_request', 'Document bytes do not match the verified manifest.');
        document.absolutePath = path;
      }
      if (signal.aborted) throw operation('cancelled', 'Agent operation cancelled.');
      if (Date.now() >= deadline) throw operation('timeout', 'Agent deadline expired before inference.');
      const response = await withDeadline(boundedSignal => transport(request, deadline, boundedSignal), deadline, signal);
      if (signal.aborted) throw operation('cancelled', 'Agent operation cancelled.');
      if (Date.now() >= deadline) throw operation('timeout', 'Agent deadline expired.');
      if (!validateContract('AgentResponse', response).valid) throw operation('protocol_error', 'Invalid prepared-agent response envelope.');
      const result = response as AgentResponse;
      if (result.runId !== request.runId || result.exampleId !== request.exampleId) throw operation('protocol_error', 'Agent correlation IDs do not match the request.');
      if (result.status === 'completed' && !validateDomain(exercise.outputSchema, result.output).valid) throw operation('agent_output_schema', 'Agent output does not match the exercise schema.');
      return result;
    } catch (error) { return failure(error); }
  } };
}
