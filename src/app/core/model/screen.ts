/** Opaque screen code: the front never interprets its structure. */
export type ScreenCode = string & { readonly __brand: 'ScreenCode' };

export function screenCode(value: string): ScreenCode {
  return value as ScreenCode;
}

/** Read-only reflection of the screen catalog owned by `administration` (R-0007). */
export interface Screen {
  readonly code: ScreenCode;
  /** Opaque text: it is not assumed to match the eight modules of the front. */
  readonly module: string;
  readonly name: string;
  readonly active: boolean;
}
