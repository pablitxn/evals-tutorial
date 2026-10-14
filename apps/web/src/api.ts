import { validateContract, type SchemaName, type OperationError } from '@evals-tutorial/contracts';

export class ApiError extends Error {
  constructor(public detail: OperationError, public httpStatus: number) {
    super(detail.message);
  }
}

/** Every API response is checked against the frozen shared schema. */
export async function request<T>(path: string, schema: SchemaName, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const checked = validateContract('ErrorResponse', data);
    if (checked.valid) throw new ApiError((data as { error: OperationError }).error, response.status);
    throw new Error(`Service returned an unreadable error (${response.status}). Check local service status.`);
  }
  const checked = validateContract(schema, data);
  if (!checked.valid) throw new Error(`Service response does not match ${schema}. Check the tutorial version.`);
  return data as T;
}

export function errorText(error: unknown): string {
  return error instanceof ApiError ? `${error.detail.code}: ${error.message}` : error instanceof Error ? error.message : 'Service unavailable. Check local startup.';
}
