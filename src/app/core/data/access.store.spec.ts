// Black-box tests of AccessStore (design EP00-TBR-005 §3.2, §3.1 and §4; decisions X1, X3, X4, P-3, PA-1, PA-4, PA-5).
// The store is driven through fake ports (IdentityPort and ScreenCatalogPort) with synthetic grants, so these tests
// pin the store contract independently of the demo adapter.
// [EP00-TBR-005-CA1] can/check per screen and action, with a reason code (S7): NO_SESSION, UNKNOWN_SCREEN, NO_VIEW,
//                    ACTION_NOT_GRANTED; FORBIDDEN through forbidden(decision).
// [EP00-TBR-005-CA2] The store always normalizes what the port brings (X3), on signIn, switchProfile and restore.
// [EP00-TBR-005-CA3] switchProfile recomputes permissions without reloading (signals), raises epoch; same profile is a
//                    no-op (PA-5); a failed change keeps the previous session intact (P-3); a second request while one
//                    is in flight is ignored (PA-4); status is 'signing-in' while the previous session stays set.
// [EP00-TBR-005-CA4] restore() and signOut(): no session means status 'signed-out'.
// [EP00-TBR-005-CA6] A failed sign-in is UNAVAILABLE (any non-ApiError too, without leaking its text), VALIDATION keeps
//                    its code, and no partial session is left (session null, epoch unchanged, nothing granted).
// Written before the code (T1). Synthetic data only.
import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { Actions } from '../model/action';
import { Screen, ScreenCode } from '../model/screen';
import { Session, SignInRequest } from '../model/session';
import { AccessStore } from './access.store';
import { ApiError, isApiError } from './api-error';
import { IdentityGrantDto, IdentityPort } from './identity.port';
import { ScreenCatalogPort } from './screen-catalog.port';

// ---------- synthetic data ----------

const code = (value: string) => value as ScreenCode;
const A = code('sample.test.a');
const B = code('sample.test.b');
const X = code('sample.test.inactive');
const UNKNOWN = code('sample.test.unknown');

const SCREENS: Screen[] = [
  { code: A, module: 'Módulo de prueba', name: 'Pantalla de prueba A', active: true },
  { code: B, module: 'Módulo de prueba', name: 'Pantalla de prueba B', active: true },
  { code: X, module: 'Módulo de prueba', name: 'Pantalla de prueba inactiva', active: false },
];

function grant(id: string, name: string, grants: IdentityGrantDto['grants']): IdentityGrantDto {
  return {
    user: { id: `user-${id}`, displayName: `Usuario de prueba ${id}` },
    profile: { id, name, synthetic: true },
    grants,
  };
}

// P1: only view on A (CA1); everything on B.
const P1 = grant('profile-test-1', 'Perfil de prueba 1', [
  { screen: A, actions: ['view'] },
  { screen: B, actions: ['view', 'capture', 'approve'] },
]);
// P2: capture and approve WITHOUT view on A in the raw data (CA2); view on B; a grant on an inactive screen.
const P2 = grant('profile-test-2', 'Perfil de prueba 2', [
  { screen: A, actions: ['capture', 'approve'] },
  { screen: B, actions: ['view'] },
  { screen: X, actions: ['view', 'capture'] },
]);
// P3: no screens at all.
const P3 = grant('profile-test-3', 'Perfil de prueba 3', []);
// P4: view and capture on A.
const P4 = grant('profile-test-4', 'Perfil de prueba 4', [{ screen: A, actions: ['view', 'capture'] }]);
const BY_ID: Record<string, IdentityGrantDto> = Object.fromEntries([P1, P2, P3, P4].map((g) => [g.profile.id, g]));

const unavailable = () =>
  new ApiError({ code: 'UNAVAILABLE', message: 'La identidad no responde (prueba).', field: null });
const validation = () =>
  new ApiError({ code: 'VALIDATION', message: 'El perfil no existe (prueba).', field: 'profileId' });
const CODE_WORDS = /\b(UNAVAILABLE|FORBIDDEN|NOT_FOUND|VALIDATION|INVALID_CURSOR)\b/;

// ---------- fake ports ----------

type Next = 'ok' | 'pending' | unknown;

class FakeIdentityPort extends IdentityPort {
  readonly signInCalls: SignInRequest[] = [];
  signOutCalls = 0;
  restoreCalls = 0;
  /** What the next signIn does: 'ok' answers from BY_ID, 'pending' waits on `pending`, anything else is thrown. */
  next: Next = 'ok';
  restoreWith: IdentityGrantDto | null | Error = null;
  pending = new Subject<IdentityGrantDto>();

  restore(): Observable<IdentityGrantDto | null> {
    this.restoreCalls++;
    const r = this.restoreWith;
    return r instanceof Error ? throwError(() => r) : of(r);
  }

  signIn(request: SignInRequest): Observable<IdentityGrantDto> {
    this.signInCalls.push(request);
    const next = this.next;
    if (next === 'ok') {
      const found = BY_ID[request.profileId];
      return found ? of(found) : throwError(() => validation());
    }
    if (next === 'pending') return this.pending.asObservable();
    return throwError(() => next);
  }

  signOut(): Observable<void> {
    this.signOutCalls++;
    return of(undefined);
  }

  /** Answers the pending sign-in with the grant of `id`. */
  resolve(id: string) {
    this.pending.next(BY_ID[id]);
    this.pending.complete();
  }

  fail(error: unknown) {
    this.pending.error(error);
  }
}

class FakeScreenCatalogPort extends ScreenCatalogPort {
  calls = 0;
  failWith: unknown = null;

  screens(): Observable<readonly Screen[]> {
    this.calls++;
    const failure = this.failWith;
    return failure ? throwError(() => failure) : of(SCREENS);
  }
}

interface Outcome<T> {
  values: T[];
  error: unknown;
  completed: boolean;
}

function outcome<T>(source: Observable<T>): Promise<Outcome<T>> {
  return new Promise((resolve) => {
    const values: T[] = [];
    source.subscribe({
      next: (v) => values.push(v),
      error: (error: unknown) => resolve({ values, error, completed: false }),
      complete: () => resolve({ values, error: undefined, completed: true }),
    });
  });
}

function setup() {
  const identity = new FakeIdentityPort();
  const catalog = new FakeScreenCatalogPort();
  TestBed.configureTestingModule({
    providers: [
      { provide: IdentityPort, useValue: identity },
      { provide: ScreenCatalogPort, useValue: catalog },
    ],
  });
  return { store: TestBed.inject(AccessStore), identity, catalog };
}

async function signedIn(id: string) {
  const ctx = setup();
  const result = await outcome(ctx.store.signIn({ kind: 'demo', profileId: id }));
  expect(result.error).toBeUndefined();
  return ctx;
}

// ---------- CA1 ----------

describe('[EP00-TBR-005-CA1] AccessStore: permissions by screen and action', () => {
  it('[EP00-TBR-005-CA1] a profile with only view on a screen can view it and can neither capture nor approve there', async () => {
    const { store } = await signedIn(P1.profile.id);

    expect(store.can(A, Actions.VIEW)).toBe(true);
    expect(store.can(A, Actions.CAPTURE)).toBe(false);
    expect(store.can(A, Actions.APPROVE)).toBe(false);
    expect(store.check(A, Actions.VIEW)).toEqual({ allowed: true });
    expect(store.check(A, Actions.CAPTURE)).toEqual({ allowed: false, reason: 'ACTION_NOT_GRANTED' });
    expect(store.check(A, Actions.APPROVE)).toEqual({ allowed: false, reason: 'ACTION_NOT_GRANTED' });
  });

  it('[EP00-TBR-005-CA1] the session carries user, synthetic profile, mode demo and the normalized permissions', async () => {
    const { store } = await signedIn(P1.profile.id);
    const session = store.session() as Session;

    expect(session).not.toBeNull();
    expect(session.userId).toBe(P1.user.id);
    expect(session.displayName).toBe(P1.user.displayName);
    expect(session.profile).toEqual({ id: P1.profile.id, name: P1.profile.name, synthetic: true });
    expect(session.mode).toBe('demo');
    expect(session.permissions.get(A)?.has(Actions.VIEW)).toBe(true);
    expect(store.permissions()).toBe(session.permissions);
    expect(store.status()).toBe('signed-in');
  });

  it('[EP00-TBR-005-CA1] can is the shortcut of check(...).allowed', async () => {
    const { store } = await signedIn(P1.profile.id);

    for (const screen of [A, B, X, UNKNOWN])
      for (const act of [Actions.VIEW, Actions.CAPTURE, Actions.APPROVE])
        expect(store.can(screen, act)).toBe(store.check(screen, act).allowed);
  });

  it('[EP00-TBR-005-CA1] without a session every check is denied with NO_SESSION', () => {
    const { store } = setup();

    expect(store.session()).toBeNull();
    expect(store.check(A, Actions.VIEW)).toEqual({ allowed: false, reason: 'NO_SESSION' });
    expect(store.can(A, Actions.VIEW)).toBe(false);
  });

  it('[EP00-TBR-005-CA1] a screen outside the catalog is denied with UNKNOWN_SCREEN (fails closed)', async () => {
    const { store } = await signedIn(P1.profile.id);

    expect(store.check(UNKNOWN, Actions.VIEW)).toEqual({ allowed: false, reason: 'UNKNOWN_SCREEN' });
  });

  it('[EP00-TBR-005-CA1] an inactive screen is treated as unknown even if the grants mention it', async () => {
    const { store } = await signedIn(P2.profile.id);

    expect(store.check(X, Actions.VIEW)).toEqual({ allowed: false, reason: 'UNKNOWN_SCREEN' });
    expect(store.can(X, Actions.CAPTURE)).toBe(false);
  });

  it('[EP00-TBR-005-CA1] a known screen without view is denied with NO_VIEW', async () => {
    const { store } = await signedIn(P3.profile.id);

    expect(store.check(A, Actions.VIEW)).toEqual({ allowed: false, reason: 'NO_VIEW' });
  });

  it('[EP00-TBR-005-CA1] forbidden(decision) is a FORBIDDEN ApiError with a Spanish message that does not show the code', async () => {
    const { store } = await signedIn(P1.profile.id);
    const decision = store.check(A, Actions.CAPTURE);

    const error = store.forbidden(decision);

    expect(isApiError(error)).toBe(true);
    expect(error.code).toBe('FORBIDDEN');
    expect(error.message.trim()).not.toBe('');
    expect(error.message).not.toMatch(CODE_WORDS);
  });
});

// ---------- CA2 ----------

describe('[EP00-TBR-005-CA2] AccessStore always normalizes (X3)', () => {
  it('[EP00-TBR-005-CA2] capture and approve without view in the raw grants are not granted after signIn', async () => {
    const { store } = await signedIn(P2.profile.id);

    expect(store.can(A, Actions.CAPTURE)).toBe(false);
    expect(store.can(A, Actions.APPROVE)).toBe(false);
    expect(store.can(A, Actions.VIEW)).toBe(false);
    expect(store.check(A, Actions.CAPTURE)).toEqual({ allowed: false, reason: 'NO_VIEW' });
    expect(store.can(B, Actions.VIEW)).toBe(true);
  });

  it('[EP00-TBR-005-CA2] the same normalization applies to a restored session', async () => {
    const { store, identity } = setup();
    identity.restoreWith = P2;

    const result = await outcome(store.restore());

    expect(result.error).toBeUndefined();
    expect(store.session()?.profile.id).toBe(P2.profile.id);
    expect(store.can(A, Actions.CAPTURE)).toBe(false);
    expect(store.can(B, Actions.VIEW)).toBe(true);
    expect(store.can(X, Actions.VIEW)).toBe(false);
  });

  it('[EP00-TBR-005-CA2] when a profile has capture, it also has view on that screen (every allowed action implies view)', async () => {
    for (const g of [P1, P2, P3, P4]) {
      TestBed.resetTestingModule();
      const { store } = await signedIn(g.profile.id);
      for (const screen of [A, B, X, UNKNOWN])
        for (const act of [Actions.CAPTURE, Actions.APPROVE])
          if (store.can(screen, act)) expect(store.can(screen, Actions.VIEW)).toBe(true);
    }
  });
});

// ---------- CA3 ----------

describe('[EP00-TBR-005-CA3] AccessStore.switchProfile', () => {
  it('[EP00-TBR-005-CA3] switching recomputes permissions without reloading and raises epoch', async () => {
    const { store } = await signedIn(P1.profile.id);
    const epoch = store.epoch();

    const result = await outcome(store.switchProfile(P2.profile.id));

    expect(result.error).toBeUndefined();
    expect(result.values.at(-1)?.profile.id).toBe(P2.profile.id);
    expect(store.session()?.profile.id).toBe(P2.profile.id);
    expect(store.can(A, Actions.VIEW)).toBe(false);
    expect(store.epoch()).toBeGreaterThan(epoch);
    expect(store.status()).toBe('signed-in');
  });

  it('[EP00-TBR-005-CA3] whatever depends on permissions through signals is recomputed by itself', async () => {
    const { store } = await signedIn(P1.profile.id);
    const canViewA = computed(() => store.can(A, Actions.VIEW));
    const profileName = computed(() => store.session()?.profile.name ?? null);
    expect(canViewA()).toBe(true);
    expect(profileName()).toBe(P1.profile.name);

    await outcome(store.switchProfile(P2.profile.id));

    expect(canViewA()).toBe(false);
    expect(profileName()).toBe(P2.profile.name);
  });

  it('[EP00-TBR-005-CA3] the switch asks the port for the demo profile', async () => {
    const { store, identity } = await signedIn(P1.profile.id);

    await outcome(store.switchProfile(P4.profile.id));

    expect(identity.signInCalls.at(-1)).toEqual({ kind: 'demo', profileId: P4.profile.id });
  });

  it('[EP00-TBR-005-CA3] switching to the active profile is a no-op: same session, same epoch, no port call (PA-5)', async () => {
    const { store, identity, catalog } = await signedIn(P1.profile.id);
    const session = store.session();
    const epoch = store.epoch();
    const identityCalls = identity.signInCalls.length;
    const catalogCalls = catalog.calls;

    const result = await outcome(store.switchProfile(P1.profile.id));

    expect(result.error).toBeUndefined();
    expect(result.values.at(-1)).toBe(session);
    expect(store.session()).toBe(session);
    expect(store.epoch()).toBe(epoch);
    expect(identity.signInCalls.length).toBe(identityCalls);
    expect(catalog.calls).toBe(catalogCalls);
    expect(store.status()).toBe('signed-in');
  });

  it('[EP00-TBR-005-CA3] a failed switch (UNAVAILABLE) keeps the previous session intact (P-3)', async () => {
    const { store, identity } = await signedIn(P1.profile.id);
    const session = store.session();
    const epoch = store.epoch();
    identity.next = unavailable();

    const result = await outcome(store.switchProfile(P2.profile.id));

    expect(isApiError(result.error)).toBe(true);
    expect((result.error as ApiError).code).toBe('UNAVAILABLE');
    expect(store.session()).toBe(session);
    expect(store.epoch()).toBe(epoch);
    expect(store.status()).toBe('signed-in');
    expect(store.can(A, Actions.VIEW)).toBe(true);
  });

  it('[EP00-TBR-005-CA3] a failed switch (VALIDATION, unknown profile) keeps the previous session and the code (P-3, PA-1)', async () => {
    const { store } = await signedIn(P1.profile.id);
    const session = store.session();
    const epoch = store.epoch();

    const result = await outcome(store.switchProfile('profile-test-missing'));

    expect(isApiError(result.error)).toBe(true);
    expect((result.error as ApiError).code).toBe('VALIDATION');
    expect((result.error as ApiError).field).toBe('profileId');
    expect(store.session()).toBe(session);
    expect(store.epoch()).toBe(epoch);
  });

  it('[EP00-TBR-005-CA3] a switch whose catalog fails keeps the previous session (atomic)', async () => {
    const { store, catalog } = await signedIn(P1.profile.id);
    const session = store.session();
    catalog.failWith = unavailable();

    const result = await outcome(store.switchProfile(P2.profile.id));

    expect(isApiError(result.error)).toBe(true);
    expect((result.error as ApiError).code).toBe('UNAVAILABLE');
    expect(store.session()).toBe(session);
  });

  it('[EP00-TBR-005-CA3] while switching, status is signing-in and the previous session stays set until success (PA-4)', async () => {
    const { store, identity } = await signedIn(P1.profile.id);
    const session = store.session();
    const epoch = store.epoch();
    identity.next = 'pending';

    const done = outcome(store.switchProfile(P2.profile.id));

    expect(store.status()).toBe('signing-in');
    expect(store.session()).toBe(session);
    expect(store.epoch()).toBe(epoch);
    identity.resolve(P2.profile.id);
    await done;
    expect(store.status()).toBe('signed-in');
    expect(store.session()?.profile.id).toBe(P2.profile.id);
  });

  it('[EP00-TBR-005-CA3] a second switch while one is in flight is ignored (PA-4)', async () => {
    const { store, identity } = await signedIn(P1.profile.id);
    identity.next = 'pending';
    const callsBefore = identity.signInCalls.length;

    const first = outcome(store.switchProfile(P2.profile.id));
    store.switchProfile(P4.profile.id).subscribe({ error: () => undefined });
    store.signIn({ kind: 'demo', profileId: P3.profile.id }).subscribe({ error: () => undefined });

    expect(identity.signInCalls.length).toBe(callsBefore + 1);
    identity.resolve(P2.profile.id);
    await first;
    expect(store.session()?.profile.id).toBe(P2.profile.id);
  });

  it('[EP00-TBR-005-CA3] after a failed switch the status goes back to signed-in', async () => {
    const { store, identity } = await signedIn(P1.profile.id);
    identity.next = 'pending';

    const done = outcome(store.switchProfile(P2.profile.id));
    identity.fail(unavailable());
    await done;

    expect(store.status()).toBe('signed-in');
    expect(store.session()?.profile.id).toBe(P1.profile.id);
  });
});

// ---------- CA4 ----------

describe('[EP00-TBR-005-CA4] AccessStore: restore and sign-out', () => {
  it('[EP00-TBR-005-CA4] restore without a stored session leaves no session and status signed-out', async () => {
    const { store, identity } = setup();
    identity.restoreWith = null;

    const result = await outcome(store.restore());

    expect(result.error).toBeUndefined();
    expect(result.values.at(-1) ?? null).toBeNull();
    expect(store.session()).toBeNull();
    expect(store.status()).toBe('signed-out');
  });

  it('[EP00-TBR-005-CA4] restore with a stored session signs in with it', async () => {
    const { store, identity } = setup();
    identity.restoreWith = P1;

    const result = await outcome(store.restore());

    expect(result.values.at(-1)?.profile.id).toBe(P1.profile.id);
    expect(store.session()?.profile.id).toBe(P1.profile.id);
    expect(store.status()).toBe('signed-in');
  });

  it('[EP00-TBR-005-CA4] a failing restore leaves no session and status signed-out', async () => {
    const { store, identity } = setup();
    identity.restoreWith = unavailable();

    await outcome(store.restore());

    expect(store.session()).toBeNull();
    expect(store.status()).toBe('signed-out');
  });

  it('[EP00-TBR-005-CA4] signIn passes the demo request to the port and opens the session', async () => {
    const { store, identity } = setup();
    const epoch = store.epoch();

    const result = await outcome(store.signIn({ kind: 'demo', profileId: P4.profile.id }));

    expect(identity.signInCalls).toEqual([{ kind: 'demo', profileId: P4.profile.id }]);
    expect(result.values.at(-1)?.profile.id).toBe(P4.profile.id);
    expect(store.session()?.profile.id).toBe(P4.profile.id);
    expect(store.epoch()).toBeGreaterThan(epoch);
    expect(store.status()).toBe('signed-in');
  });

  it('[EP00-TBR-005-CA4] signOut clears the session, raises epoch and calls the port', async () => {
    const { store, identity } = await signedIn(P1.profile.id);
    const epoch = store.epoch();

    await outcome(store.signOut());

    expect(identity.signOutCalls).toBe(1);
    expect(store.session()).toBeNull();
    expect(store.status()).toBe('signed-out');
    expect(store.epoch()).toBeGreaterThan(epoch);
    expect(store.check(A, Actions.VIEW)).toEqual({ allowed: false, reason: 'NO_SESSION' });
  });
});

// ---------- CA6 ----------

describe('[EP00-TBR-005-CA6] AccessStore: identity not available, no partial session', () => {
  it('[EP00-TBR-005-CA6] UNAVAILABLE from the port: the sign-in fails with UNAVAILABLE and no session is created', async () => {
    const { store, identity } = setup();
    const epoch = store.epoch();
    identity.next = unavailable();

    const result = await outcome(store.signIn({ kind: 'demo', profileId: P1.profile.id }));

    expect(isApiError(result.error)).toBe(true);
    expect((result.error as ApiError).code).toBe('UNAVAILABLE');
    expect(result.values).toEqual([]);
    expect(store.session()).toBeNull();
    expect(store.status()).toBe('signed-out');
    expect(store.epoch()).toBe(epoch);
    expect(store.can(A, Actions.VIEW)).toBe(false);
    expect(store.permissions().size).toBe(0);
  });

  it('[EP00-TBR-005-CA6] an error that is not an ApiError becomes UNAVAILABLE without exposing its text', async () => {
    const { store, identity } = setup();
    identity.next = new TypeError('boom-internal-detail');

    const result = await outcome(store.signIn({ kind: 'demo', profileId: P1.profile.id }));

    expect(isApiError(result.error)).toBe(true);
    expect((result.error as ApiError).code).toBe('UNAVAILABLE');
    expect((result.error as ApiError).message).not.toContain('boom-internal-detail');
    expect((result.error as ApiError).message.trim()).not.toBe('');
    expect(store.session()).toBeNull();
  });

  it('[EP00-TBR-005-CA6] the catalog not responding is UNAVAILABLE too, with no session (atomic sign-in)', async () => {
    const { store, catalog } = setup();
    catalog.failWith = new Error('catalog-internal-detail');

    const result = await outcome(store.signIn({ kind: 'demo', profileId: P1.profile.id }));

    expect(isApiError(result.error)).toBe(true);
    expect((result.error as ApiError).code).toBe('UNAVAILABLE');
    expect((result.error as ApiError).message).not.toContain('catalog-internal-detail');
    expect(store.session()).toBeNull();
    expect(store.status()).toBe('signed-out');
  });

  it('[EP00-TBR-005-CA6] VALIDATION (unknown demo profile) keeps its code in the store, with no session (PA-1)', async () => {
    const { store } = setup();

    const result = await outcome(store.signIn({ kind: 'demo', profileId: 'profile-test-missing' }));

    expect(isApiError(result.error)).toBe(true);
    expect((result.error as ApiError).code).toBe('VALIDATION');
    expect((result.error as ApiError).field).toBe('profileId');
    expect(store.session()).toBeNull();
    expect(store.status()).toBe('signed-out');
  });

  it('[EP00-TBR-005-CA6] while signing in there is no session yet and status is signing-in; a failure leaves signed-out', async () => {
    const { store, identity } = setup();
    identity.next = 'pending';

    const done = outcome(store.signIn({ kind: 'demo', profileId: P1.profile.id }));

    expect(store.status()).toBe('signing-in');
    expect(store.session()).toBeNull();
    identity.fail(unavailable());
    await done;
    expect(store.status()).toBe('signed-out');
    expect(store.session()).toBeNull();
  });

  it('[EP00-TBR-005-CA6] a second sign-in while one is in flight is ignored (PA-4)', async () => {
    const { store, identity } = setup();
    identity.next = 'pending';

    const first = outcome(store.signIn({ kind: 'demo', profileId: P1.profile.id }));
    store.signIn({ kind: 'demo', profileId: P2.profile.id }).subscribe({ error: () => undefined });

    expect(identity.signInCalls).toEqual([{ kind: 'demo', profileId: P1.profile.id }]);
    identity.resolve(P1.profile.id);
    await first;
    expect(store.session()?.profile.id).toBe(P1.profile.id);
  });

  it('[EP00-TBR-005-CA6] after a failure the person can choose again and enter', async () => {
    const { store, identity } = setup();
    identity.next = unavailable();
    await outcome(store.signIn({ kind: 'demo', profileId: P1.profile.id }));

    identity.next = 'ok';
    const result = await outcome(store.signIn({ kind: 'demo', profileId: P1.profile.id }));

    expect(result.error).toBeUndefined();
    expect(store.session()?.profile.id).toBe(P1.profile.id);
    expect(store.status()).toBe('signed-in');
  });
});
