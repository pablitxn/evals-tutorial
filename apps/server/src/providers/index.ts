import type { ContentService } from '@evals-tutorial/contracts/services';
import { profileFromEnv } from './profile.js';
import { createPythonTransport } from './process.js';
import type { PythonOptions } from './process.js';
import { createAgentService } from './agents.js';
import { createProviderBroker, parseBrokerResponse } from '../judge-broker/index.js';

export interface ProviderServicesOptions extends PythonOptions {
  content: ContentService;
  contentRoot: string;
  env: NodeJS.ProcessEnv;
}
/** Construction and safe status inspection never invoke inference. */
export function createProviderServices(options: ProviderServicesOptions) {
  const profile = profileFromEnv(options.env);
  const python = createPythonTransport(options, profile);
  const agents = createAgentService(options.content, options.contentRoot, (request, deadline, signal) => python('tutorial_agents', request, deadline, signal));
  const broker = createProviderBroker(async call => parseBrokerResponse(await python('tutorial_agents.broker', {
    role: call.role, material: call.material, maxOutputTokens: call.maxOutputTokens,
    deadlineMs: Math.max(1, Math.min(60000, call.deadlineEpochMs - Date.now())),
  }, call.deadlineEpochMs, call.signal)), options.content);
  return { agents, broker, provider: profile.summary };
}
export { profileFromEnv } from './profile.js';
export { createAgentService, PREPARED_VARIANTS } from './agents.js';
export { resolveAgentDocuments } from './documents.js';
export { createPythonTransport } from './process.js';
export type { PythonOptions, BrokerTransport } from './process.js';
export type { AgentTransport } from './agents.js';
export { createProviderBroker } from '../judge-broker/index.js';
