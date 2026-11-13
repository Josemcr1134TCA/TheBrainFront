import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, defer, EMPTY, map, Observable, of, switchMap, tap, throwError, finalize } from 'rxjs';
import { actionCode, Actions } from '../model/action';
import { AccessDecision, EffectivePermissions } from '../model/permission';
import { ScreenCode, screenCode } from '../model/screen';
import { Session, SignInRequest } from '../model/session';
import { ApiError, isApiError } from './api-error';
import { IDENTITY_UNAVAILABLE_MESSAGE, IdentityGrantDto, IdentityPort } from './identity.port';
import { normalizePermissions } from './normalize-permissions';
import { ScreenCatalogPort } from './screen-catalog.port';

export type AccessStatus = 'restoring' | 'signed-out' | 'signing-in' | 'signed-in';

const NO_PERMISSIONS: EffectivePermissions = new Map();

/** Anything that is not an ApiError becomes UNAVAILABLE, without exposing its internal text. */
function toApiError(error: unknown): ApiError {
  return isApiError(error)
    ? error
    : new ApiError({ code: 'UNAVAILABLE', message: IDENTITY_UNAVAILABLE_MESSAGE, field: null });
}

/**
 * Reactive access facade: the only identity piece views inject. It always normalizes the permissions (X3), whatever the
 * adapter, and confirms a session atomically: any error leaves the previous session untouched (CA6, P-3).
 */
@Injectable({ providedIn: 'root' })
export class AccessStore {
  private readonly identity = inject(IdentityPort);
  private readonly catalog = inject(ScreenCatalogPort);

  private readonly sessionState = signal<Session | null>(null);
  private readonly knownScreens = signal<ReadonlySet<ScreenCode>>(new Set());
  private readonly statusState = signal<AccessStatus>('restoring');
  private readonly epochState = signal(0);

  readonly session = this.sessionState.asReadonly();
  readonly status = this.statusState.asReadonly();
  /** Rises on every session change; the route reuse strategy uses it (CA3). */
  readonly epoch = this.epochState.asReadonly();
  readonly permissions = computed<EffectivePermissions>(() => this.sessionState()?.permissions ?? NO_PERMISSIONS);

  /** Can the profile do `action` on `screen`? The reason is a code; each screen words its own text (S7). */
  check(screen: string, action: string): AccessDecision {
    if (this.sessionState() === null) return { allowed: false, reason: 'NO_SESSION' };
    const code = screenCode(screen);
    if (!this.knownScreens().has(code)) return { allowed: false, reason: 'UNKNOWN_SCREEN' };
    const actions = this.permissions().get(code);
    if (!actions?.has(Actions.VIEW)) return { allowed: false, reason: 'NO_VIEW' };
    if (!actions.has(actionCode(action))) return { allowed: false, reason: 'ACTION_NOT_GRANTED' };
    return { allowed: true };
  }

  can(screen: string, action: string): boolean {
    return this.check(screen, action).allowed;
  }

  forbidden(decision?: AccessDecision): ApiError {
    void decision;
    return new ApiError({ code: 'FORBIDDEN', message: 'Tu perfil no tiene permiso para esta acción.', field: null });
  }

  /** Restores the current session at startup. A failure leaves the store signed out. */
  restore(): Observable<Session | null> {
    return defer(() => {
      this.statusState.set('restoring');
      return this.identity.restore().pipe(
        switchMap((grant) => (grant === null ? of(null) : this.build(grant))),
        tap((built) => {
          if (built) this.commit(built.session, built.known);
          else this.statusState.set('signed-out');
        }),
        map((built) => built?.session ?? null),
        catchError((error: unknown) => {
          this.statusState.set(this.sessionState() ? 'signed-in' : 'signed-out');
          return throwError(() => toApiError(error));
        }),
      );
    });
  }

  signIn(request: SignInRequest): Observable<Session> {
    return defer(() => {
      if (this.statusState() === 'signing-in') return EMPTY;
      return this.run(request);
    });
  }

  /** Switching to the active profile does nothing (PA-5); a failure keeps the previous session (P-3). */
  switchProfile(profileId: string): Observable<Session> {
    return defer(() => {
      if (this.statusState() === 'signing-in') return EMPTY;
      const current = this.sessionState();
      if (current && current.profile.id === profileId) return of(current);
      return this.run({ kind: 'demo', profileId });
    });
  }

  signOut(): Observable<void> {
    return defer(() =>
      this.identity.signOut().pipe(
        tap(() => this.clear()),
        catchError((error: unknown) => {
          this.clear();
          return throwError(() => toApiError(error));
        }),
      ),
    );
  }

  // Catalog first, identity last: the adapter writes its storage only when everything before it has worked.
  private run(request: SignInRequest): Observable<Session> {
    this.statusState.set('signing-in');
    return this.catalog.screens().pipe(
      switchMap((screens) =>
        this.identity.signIn(request).pipe(map((grant) => this.toSession(grant, activeCodes(screens)))),
      ),
      tap((built) => this.commit(built.session, built.known)),
      map((built) => built.session),
      catchError((error: unknown) => throwError(() => toApiError(error))),
      finalize(() => {
        if (this.statusState() === 'signing-in') this.statusState.set(this.sessionState() ? 'signed-in' : 'signed-out');
      }),
    );
  }

  private build(grant: IdentityGrantDto) {
    return this.catalog.screens().pipe(map((screens) => this.toSession(grant, activeCodes(screens))));
  }

  private toSession(grant: IdentityGrantDto, known: ReadonlySet<ScreenCode>) {
    const session: Session = {
      userId: grant.user.id,
      displayName: grant.user.displayName,
      profile: { id: grant.profile.id, name: grant.profile.name, synthetic: grant.profile.synthetic },
      permissions: normalizePermissions(grant.grants, known),
      mode: 'demo',
    };
    return { session, known };
  }

  private commit(session: Session, known: ReadonlySet<ScreenCode>): void {
    this.knownScreens.set(known);
    this.sessionState.set(session);
    this.statusState.set('signed-in');
    this.epochState.update((n) => n + 1);
  }

  private clear(): void {
    this.sessionState.set(null);
    this.knownScreens.set(new Set());
    this.statusState.set('signed-out');
    this.epochState.update((n) => n + 1);
  }
}

function activeCodes(screens: readonly { readonly code: ScreenCode; readonly active: boolean }[]): ReadonlySet<ScreenCode> {
  return new Set(screens.filter((s) => s.active).map((s) => s.code));
}

