import { InjectionToken } from '@angular/core';
import { ApiError } from './api-error';

/**
 * Makes the in-memory adapters fail with this error. It has no default value and nobody provides it in app code:
 * only tests do (design EP00-TBR-003 §3.4).
 */
export const IN_MEMORY_FAILURE = new InjectionToken<ApiError>('IN_MEMORY_FAILURE');
