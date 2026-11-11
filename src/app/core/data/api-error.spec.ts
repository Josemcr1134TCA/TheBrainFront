// [EP00-TBR-003-CA2] Typed error of the TheBrainApi contract (design EP00-TBR-003 §3.1, C4 and C5 confirmed by the PO):
// code (UNAVAILABLE | FORBIDDEN | NOT_FOUND | VALIDATION | INVALID_CURSOR), message for people (Spanish),
// field (the request parameter that failed, or null for a general error) and an optional correlationId.
// Black box: written before the code (T1). Synthetic data only.
import { ApiError, ApiErrorCode, isApiError } from './api-error';

const CODES: ApiErrorCode[] = ['UNAVAILABLE', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'INVALID_CURSOR'];

describe('[EP00-TBR-003-CA2] ApiError (TheBrainApi error contract)', () => {
  it('[EP00-TBR-003-CA2] carries code, message and field, and is an Error', () => {
    const error = new ApiError({ code: 'VALIDATION', message: 'El tamaño de página no es válido.', field: 'pageSize' });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toBe('El tamaño de página no es válido.');
    expect(error.field).toBe('pageSize');
  });

  it('[EP00-TBR-003-CA2] accepts field null for a general error', () => {
    const error = new ApiError({ code: 'UNAVAILABLE', message: 'El servicio no está disponible.', field: null });

    expect(error.field).toBeNull();
  });

  it.each(CODES)('[EP00-TBR-003-CA2] accepts the contract code %s', (code) => {
    const error = new ApiError({ code, message: 'Mensaje de prueba.', field: null });

    expect(error.code).toBe(code);
  });

  it('[EP00-TBR-003-CA2] correlationId is optional: absent when not given', () => {
    const error = new ApiError({ code: 'NOT_FOUND', message: 'No se encontró.', field: null });

    expect(error.correlationId).toBeUndefined();
  });

  it('[EP00-TBR-003-CA2] keeps the correlationId when given', () => {
    const error = new ApiError({ code: 'FORBIDDEN', message: 'Sin permiso.', field: null, correlationId: 'corr-test-0001' });

    expect(error.correlationId).toBe('corr-test-0001');
  });

  it('[EP00-TBR-003-CA2] isApiError recognizes an ApiError', () => {
    expect(isApiError(new ApiError({ code: 'INVALID_CURSOR', message: 'Cursor no válido.', field: 'cursor' }))).toBe(true);
  });

  it('[EP00-TBR-003-CA2] isApiError rejects anything that is not an ApiError (the screen treats it as UNAVAILABLE)', () => {
    for (const value of [new Error('plain'), new TypeError('type'), 'UNAVAILABLE', null, undefined, 0, {}]) {
      expect(isApiError(value)).toBe(false);
    }
  });
});
