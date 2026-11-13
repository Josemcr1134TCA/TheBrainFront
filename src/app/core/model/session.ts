import { EffectivePermissions } from './permission';
import { Profile } from './profile';

export interface Session {
  readonly userId: string;
  readonly displayName: string;
  readonly profile: Profile;
  readonly permissions: EffectivePermissions;
  /** Grows with the remote adapter. */
  readonly mode: 'demo';
}

/** Extensible union (OIDC arrives in another story). */
export type SignInRequest = { readonly kind: 'demo'; readonly profileId: string };
