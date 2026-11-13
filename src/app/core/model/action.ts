/** Opaque action code: new actions (for example "assign") can arrive without changing this type. */
export type ActionCode = string & { readonly __brand: 'ActionCode' };

export function actionCode(value: string): ActionCode {
  return value as ActionCode;
}

export const Actions = {
  VIEW: actionCode('view'),
  CAPTURE: actionCode('capture'),
  APPROVE: actionCode('approve'),
} as const;
