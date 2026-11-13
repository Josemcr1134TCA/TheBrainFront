import { Observable } from 'rxjs';
import { SignInRequest } from '../model/session';

/**
 * Message shown when identity cannot be resolved (UNAVAILABLE, and VALIDATION on sign-in).
 * The level word ("Error") is added by the banner component, not here; this is the single place of the text (the page imports it).
 */
export const IDENTITY_UNAVAILABLE_MESSAGE = 'La identidad no está disponible por ahora. Elige un perfil otra vez.';

export interface IdentityGrantDto {
  readonly user: { readonly id: string; readonly displayName: string };
  readonly profile: { readonly id: string; readonly name: string; readonly synthetic: boolean };
  /** Effective grants resolved by the back (X4); they are normalized by the store, whatever the adapter. */
  readonly grants: readonly { readonly screen: string; readonly actions: readonly string[] }[];
}

/** Contract of the identity source. Views never inject it: they use AccessStore. */
export abstract class IdentityPort {
  /** Current session, if any. */
  abstract restore(): Observable<IdentityGrantDto | null>;
  abstract signIn(request: SignInRequest): Observable<IdentityGrantDto>;
  abstract signOut(): Observable<void>;
}
