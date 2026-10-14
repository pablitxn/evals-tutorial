import { createPhoenixTelemetry, type PhoenixTelemetryOptions } from '@evals-tutorial/phoenix';
import type { TelemetryService } from '@evals-tutorial/contracts/services';

/** Bootstrap supplies explicit non-secret Phoenix settings and persistent state. */
export function createTelemetryService(options: PhoenixTelemetryOptions): TelemetryService {
  return createPhoenixTelemetry(options);
}
export { createTelemetryContext } from '@evals-tutorial/phoenix';
