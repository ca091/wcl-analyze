export type ErrorCode =
  | 'INVALID_ARGUMENT' | 'MISSING_CREDENTIALS' | 'AUTH_FAILED'
  | 'REALM_NOT_FOUND' | 'AMBIGUOUS_REALM' | 'ZONE_NOT_FOUND'
  | 'CHARACTER_NOT_FOUND' | 'RANKINGS_HIDDEN' | 'RATE_LIMITED'
  | 'ACCESS_BLOCKED' | 'TIMEOUT' | 'NETWORK_ERROR' | 'UPSTREAM_ERROR'
  | 'GRAPHQL_ERROR' | 'INVALID_RESPONSE' | 'CACHE_ERROR';

export class WclError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;
  constructor(code: ErrorCode, message: string, exitCode = 1) {
    super(message);
    this.name = 'WclError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function invalid(message: string): never {
  throw new WclError('INVALID_ARGUMENT', message, 2);
}

export function record(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WclError('INVALID_RESPONSE', `${context} 结构异常；可用 --raw 检查排名原始响应。`);
  }
  return value as Record<string, unknown>;
}

export function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
