import { DockerExecutor, type IsolatedExecutor } from '@evals-tutorial/evaluator-runtime';
import type { AgentService, ContentService, JudgeBroker } from '@evals-tutorial/contracts/services';
import type { AgentRequest, ProviderSummary } from '@evals-tutorial/contracts';
import { DockerValidationService } from '../validation/index.js';
import { sha256 } from '@evals-tutorial/contracts/node';
import { RunServiceImpl } from './service.js';

export interface RunnerServiceOptions {
  content: ContentService;
  agent?: AgentService;
  judge?: JudgeBroker;
  /** Host-only resolver verifies allowlisted document IDs; never accepts browser paths. */
  resolveDocuments?: (request: { exerciseId: string; input: AgentRequest['input'] }) => Promise<AgentRequest['documents']>;
  /** Adapter for ET-WP-07 createTelemetryContext; fields are trusted host context. */
  createTelemetryContext?: (runId: string, exampleId: string, fixtureId?: string) => { traceparent?: string; tracestate?: string } | Promise<{ traceparent?: string; tracestate?: string }>;
  provider?: ProviderSummary;
  imageDigest: string;
  repositoryRevision: string;
  dependencyLockHash: string;
  receiptDirectory: string;
  maxRetainedRuns?: number;
  maxRows?: number;
  /** Explicit test injection only; production defaults exclusively to DockerExecutor. */
  executor?: IsolatedExecutor;
  runTimeoutMs?: number;
}
export function createRunnerServices(options: RunnerServiceOptions) {
  const executor = options.executor ?? new DockerExecutor({ imageDigest: options.imageDigest, sessionKey: sha256(options.receiptDirectory) });
  const validation = new DockerValidationService(executor);
  const runs = new RunServiceImpl(options, executor, validation);
  return { validation, runs };
}
