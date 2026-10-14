import type { ProviderSummary } from '@evals-tutorial/contracts';
import { sha256, canonicalJson } from '@evals-tutorial/contracts/node';
import { ServiceError } from '@evals-tutorial/contracts/services';

export interface ProviderProfile {
  readonly summary: Readonly<ProviderSummary>;
  /** Backend-only. Never spread this object into receipts or status responses. */
  readonly processEnv: Readonly<Record<string, string>>;
}
export function profileFromEnv(env: NodeJS.ProcessEnv): ProviderProfile {
  const provider = env.TUTORIAL_PROVIDER;
  const model = env.TUTORIAL_MODEL;
  const apiKey = env.TUTORIAL_API_KEY;
  const fail = () => { throw new ServiceError({ code: 'configuration', message: 'Select an explicit tutorial provider, model and backend key; Azure requires a resource endpoint and API version.', retryable: false }, 503); };
  if ((provider !== 'openai' && provider !== 'azure_foundry') || !model || model.length > 256 || !apiKey) return fail();
  const processEnv: Record<string, string> = { TUTORIAL_PROVIDER: provider, TUTORIAL_MODEL: model, TUTORIAL_API_KEY: apiKey };
  let endpoint: string | null = null;
  let apiVersion: string | null = null;
  if (provider === 'azure_foundry') {
    try {
      const url = new URL(env.TUTORIAL_AZURE_ENDPOINT ?? '');
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.openai.azure.com') || url.port || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) return fail();
      endpoint = url.origin;
    } catch { return fail(); }
    apiVersion = env.TUTORIAL_API_VERSION ?? null;
    if (!apiVersion || !/^[A-Za-z0-9.-]{1,80}$/.test(apiVersion)) return fail();
    processEnv.TUTORIAL_AZURE_ENDPOINT = endpoint!;
    processEnv.TUTORIAL_API_VERSION = apiVersion;
  } else if (env.TUTORIAL_AZURE_ENDPOINT || env.TUTORIAL_API_VERSION) return fail();
  return Object.freeze({
    summary: Object.freeze({ provider, model, configured: true, configRevision: sha256(canonicalJson({ provider, model, endpoint, apiVersion })) }),
    processEnv: Object.freeze(processEnv),
  });
}
