// Typed error of the TheBrainApi contract (design EP00-TBR-003 §3.1).

export type ApiErrorCode = 'UNAVAILABLE' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'INVALID_CURSOR';

export interface ApiErrorInit {
  readonly code: ApiErrorCode;
  /** Text for people, in Spanish. */
  readonly message: string;
  /** Request parameter that failed, or null for a general error. */
  readonly field: string | null;
  readonly correlationId?: string;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly field: string | null;
  readonly correlationId?: string;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.field = init.field;
    if (init.correlationId !== undefined) this.correlationId = init.correlationId;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
