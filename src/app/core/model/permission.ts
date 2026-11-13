import { ActionCode } from './action';
import { ScreenCode } from './screen';

/** Effective permissions after normalization: screen to the set of actions the profile can do there. */
export type EffectivePermissions = ReadonlyMap<ScreenCode, ReadonlySet<ActionCode>>;

export type AccessDenialReason = 'NO_SESSION' | 'UNKNOWN_SCREEN' | 'NO_VIEW' | 'ACTION_NOT_GRANTED';

export type AccessDecision = { readonly allowed: true } | { readonly allowed: false; readonly reason: AccessDenialReason };
