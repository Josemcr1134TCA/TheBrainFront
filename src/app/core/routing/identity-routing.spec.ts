// Router integration tests of the identity guards and the profile-change reaction (design EP00-TBR-005 §7; decisions
// S8, P-2, DA-3, PA-2 and precision (a) of the architect). Synthetic routes and stub screens, real guards, real
// AccessStore and the real provideIdentityRouting(); the identity and catalog ports are fakes with synthetic grants.
// [EP00-TBR-005-CA3] Changing the profile over the current screen re-evaluates it without reloading the app: if the
//                    new profile has no view the «sin permisos» state is shown and nothing loaded with the previous
//                    profile stays on screen; if it has view, the screen is built again from scratch. Same profile: no-op.
//                    On /entrada the reaction does not act (precision a).
// [EP00-TBR-005-CA4] Without a session any internal route goes to /entrada?returnUrl=<requested URL>, and back to it
//                    after choosing a profile. The session is restored at start-up.
// [EP00-TBR-005-CA5] Without view on the screen of a route, «sin permisos» is shown, the screen is never loaded
//                    (canMatch runs before loadComponent) and the address bar keeps the requested URL.
// S8: the entry (selector) only matches in memory mode.
// Written before the code (T1). Synthetic data only.
import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PartialMatchRouteSnapshot, provideRouter, Route, Router, Routes, UrlSegment } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom, isObservable, Observable, of, throwError } from 'rxjs';
import { Screen, ScreenCode } from '../model/screen';
import { SignInRequest } from '../model/session';
import { AccessStore } from '../data/access.store';
import { ApiError } from '../data/api-error';
import { DATA_MODE, DataMode, provideDataMode } from '../data/data-mode';
import { IdentityGrantDto, IdentityPort } from '../data/identity.port';
import { ScreenCatalogPort } from '../data/screen-catalog.port';
import { demoModeGuard } from './demo-mode.guard';
import { provideIdentityRouting } from './identity-routing.providers';
import { requireScreen } from './require-screen';
import { safeReturnUrl } from './return-url';
import { screenGuard } from './screen.guard';
import { sessionGuard } from './session.guard';

// ---------- synthetic data ----------

const code = (value: string) => value as ScreenCode;
const A = code('sample.test.a');
const B = code('sample.test.b');
const UNKNOWN = code('sample.test.unknown');

const SCREENS: Screen[] = [
  { code: A, module: 'Módulo de prueba', name: 'Pantalla de prueba A', active: true },
  { code: B, module: 'Módulo de prueba', name: 'Pantalla de prueba B', active: true },
];

const grant = (id: string, name: string, grants: IdentityGrantDto['grants']): IdentityGrantDto => ({
  user: { id: `user-${id}`, displayName: `Usuario de prueba ${id}` },
  profile: { id, name, synthetic: true },
  grants,
});

// P1 views A and B; P2 has capture/approve on A WITHOUT view (normalized away) and views B; P4 views A.
const P1 = grant('profile-test-1', 'Perfil de prueba 1', [
  { screen: A, actions: ['view'] },
  { screen: B, actions: ['view'] },
]);
const P2 = grant('profile-test-2', 'Perfil de prueba 2', [
  { screen: A, actions: ['capture', 'approve'] },
  { screen: B, actions: ['view'] },
]);
const P4 = grant('profile-test-4', 'Perfil de prueba 4', [{ screen: A, actions: ['view', 'capture'] }]);
const BY_ID: Record<string, IdentityGrantDto> = Object.fromEntries([P1, P2, P4].map((g) => [g.profile.id, g]));

class FakeIdentityPort extends IdentityPort {
  restoreWith: IdentityGrantDto | null | Error = null;
  failNext: unknown = null;
  signInCalls = 0;

  restore(): Observable<IdentityGrantDto | null> {
    const r = this.restoreWith;
    return r instanceof Error ? throwError(() => r) : of(r);
  }
  signIn(request: SignInRequest): Observable<IdentityGrantDto> {
    this.signInCalls++;
    const failure = this.failNext;
    if (failure) return throwError(() => failure);
    const found = BY_ID[request.profileId];
    return found
      ? of(found)
      : throwError(() => new ApiError({ code: 'VALIDATION', message: 'Perfil inexistente (prueba).', field: 'profileId' }));
  }
  signOut(): Observable<void> {
    return of(undefined);
  }
}

class FakeScreenCatalogPort extends ScreenCatalogPort {
  screens(): Observable<readonly Screen[]> {
    return of(SCREENS);
  }
}

// ---------- stub screens ----------

const counts = { screenA: 0, screenB: 0, entry: 0, denied: 0, loadA: 0, loadB: 0 };

// Simulates a screen that loads data with the profile active when it is built.
@Component({ selector: 'test-screen-a', template: '<p class="screen-a">Datos de la pantalla A para {{ loadedFor }}</p>' })
class ScreenAStub {
  readonly loadedFor = inject(AccessStore).session()?.profile.name ?? 'nadie';
  constructor() {
    counts.screenA++;
  }
}

@Component({ selector: 'test-screen-b', template: '<p class="screen-b">Pantalla B para {{ loadedFor }}</p>' })
class ScreenBStub {
  readonly loadedFor = inject(AccessStore).session()?.profile.name ?? 'nadie';
  constructor() {
    counts.screenB++;
  }
}

@Component({ selector: 'test-open', template: '<p class="open">Pantalla sin código</p>' })
class OpenStub {}

@Component({ selector: 'test-home', template: '<p class="home">Inicio de prueba</p>' })
class HomeStub {}

@Component({ selector: 'test-entry', template: '<p class="entry">Entrada de prueba</p>' })
class EntryStub {
  constructor() {
    counts.entry++;
  }
}

@Component({ selector: 'test-denied', template: '<p class="denied">Sin permiso de prueba</p>' })
class DeniedStub {
  constructor() {
    counts.denied++;
  }
}

const ROUTES: Routes = [
  { path: 'entrada', canMatch: [demoModeGuard], component: EntryStub },
  { path: 'sin-permiso', canMatch: [sessionGuard], component: DeniedStub },
  {
    path: '',
    canMatch: [sessionGuard],
    runGuardsAndResolvers: 'always',
    children: [
      {
        path: 'zona-a',
        ...requireScreen(A),
        loadComponent: () => {
          counts.loadA++;
          return Promise.resolve(ScreenAStub);
        },
      },
      {
        path: 'zona-b',
        ...requireScreen(B),
        loadComponent: () => {
          counts.loadB++;
          return Promise.resolve(ScreenBStub);
        },
      },
      { path: 'zona-desconocida', ...requireScreen(UNKNOWN), component: OpenStub },
      { path: 'zona-sin-codigo', canMatch: [screenGuard], component: OpenStub },
      { path: '', pathMatch: 'full', component: HomeStub },
    ],
  },
];

// ---------- harness ----------

async function start(options: { restoreWith?: IdentityGrantDto | null | Error; mode?: DataMode } = {}) {
  for (const k of Object.keys(counts) as (keyof typeof counts)[]) counts[k] = 0;
  const identity = new FakeIdentityPort();
  identity.restoreWith = options.restoreWith ?? null;
  TestBed.configureTestingModule({
    providers: [
      provideRouter(ROUTES),
      provideDataMode(options.mode ?? 'memory'),
      { provide: IdentityPort, useValue: identity },
      { provide: ScreenCatalogPort, useValue: new FakeScreenCatalogPort() },
      provideIdentityRouting(),
    ],
  });
  const harness = await RouterTestingHarness.create();
  return {
    harness,
    identity,
    store: TestBed.inject(AccessStore),
    router: TestBed.inject(Router),
    location: TestBed.inject(Location),
  };
}

type Ctx = Awaited<ReturnType<typeof start>>;

async function settle(ctx: Ctx) {
  for (let i = 0; i < 6; i++) {
    TestBed.tick();
    await ctx.harness.fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
  }
  ctx.harness.detectChanges();
}

async function go(ctx: Ctx, url: string) {
  await ctx.harness.navigateByUrl(url);
  await settle(ctx);
}

async function signIn(ctx: Ctx, g: IdentityGrantDto) {
  await firstValueFrom(ctx.store.signIn({ kind: 'demo', profileId: g.profile.id }));
  await settle(ctx);
}

async function switchTo(ctx: Ctx, g: IdentityGrantDto) {
  await firstValueFrom(ctx.store.switchProfile(g.profile.id)).catch(() => undefined);
  await settle(ctx);
}

const text = (ctx: Ctx) => (ctx.harness.fixture.nativeElement as HTMLElement).textContent ?? '';
const shown = (ctx: Ctx, selector: string) => (ctx.harness.fixture.nativeElement as HTMLElement).querySelector(selector) !== null;
const pathOf = (ctx: Ctx) => ctx.router.parseUrl(ctx.router.url);
const returnUrlOf = (ctx: Ctx) => pathOf(ctx).queryParams['returnUrl'] as string | undefined;
const primaryPath = (ctx: Ctx) => '/' + (pathOf(ctx).root.children['primary']?.segments.map((s) => s.path).join('/') ?? '');

// Runs a functional guard and resolves what it returns (value, promise or observable). Angular 22 passes a third
// argument (the partial snapshot at match time); the guards under test do not read it, so a minimal one is enough.
async function runGuard(guard: typeof screenGuard, route: Route): Promise<unknown> {
  const snapshot = { routeConfig: route, url: [], params: {}, queryParams: {}, fragment: null, data: route.data ?? {}, outlet: 'primary' } as unknown as PartialMatchRouteSnapshot;
  const result: unknown = TestBed.runInInjectionContext(() => guard(route, [] as UrlSegment[], snapshot));
  if (isObservable(result)) return firstValueFrom(result);
  return await result;
}

// ---------- requireScreen and guards in isolation ----------

describe('[EP00-TBR-005-CA5] requireScreen and demoModeGuard', () => {
  it('[EP00-TBR-005-CA5] requireScreen(code) declares the screen code in data and protects the route with screenGuard in canMatch', () => {
    const route = requireScreen(A) as Route;

    expect(route.data?.['screen']).toBe(A);
    expect(route.canMatch).toContain(screenGuard);
  });

  it('[EP00-TBR-005-CA4] demoModeGuard lets the entry match in memory mode (S8)', async () => {
    TestBed.configureTestingModule({ providers: [provideDataMode('memory')] });

    expect(await runGuard(demoModeGuard, { path: 'entrada' })).toBe(true);
  });

  it('[EP00-TBR-005-CA4] demoModeGuard does not let the entry match in another mode (S8)', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: DATA_MODE, useValue: 'remote' as unknown as DataMode }] });

    expect(await runGuard(demoModeGuard, { path: 'entrada' })).not.toBe(true);
  });
});

// ---------- CA4 ----------

describe('[EP00-TBR-005-CA4] without a session (sessionGuard)', () => {
  it('[EP00-TBR-005-CA4] an internal route goes to /entrada with the requested URL as returnUrl, and the screen is not loaded', async () => {
    const ctx = await start();

    await go(ctx, '/zona-a?pagina=2');

    expect(primaryPath(ctx)).toBe('/entrada');
    expect(returnUrlOf(ctx)).toBe('/zona-a?pagina=2');
    expect(shown(ctx, '.entry')).toBe(true);
    expect(counts.loadA).toBe(0);
    expect(counts.screenA).toBe(0);
  });

  it('[EP00-TBR-005-CA4] the root route also goes to the entry', async () => {
    const ctx = await start();

    await go(ctx, '/');

    expect(primaryPath(ctx)).toBe('/entrada');
    expect(shown(ctx, '.home')).toBe(false);
  });

  it('[EP00-TBR-005-CA4] /sin-permiso without a session goes to the entry too', async () => {
    const ctx = await start();

    await go(ctx, '/sin-permiso');

    expect(primaryPath(ctx)).toBe('/entrada');
    expect(counts.denied).toBe(0);
  });

  it('[EP00-TBR-005-CA4] /entrada opens without a session (no redirect loop)', async () => {
    const ctx = await start();

    await go(ctx, '/entrada');

    expect(primaryPath(ctx)).toBe('/entrada');
    expect(shown(ctx, '.entry')).toBe(true);
    expect(counts.entry).toBe(1);
  });

  it('[EP00-TBR-005-CA4] after choosing a profile the app returns to the requested route', async () => {
    const ctx = await start();
    await go(ctx, '/zona-a?pagina=2');
    const back = safeReturnUrl(returnUrlOf(ctx));

    await signIn(ctx, P1);
    await go(ctx, back);

    expect(ctx.location.path()).toBe('/zona-a?pagina=2');
    expect(shown(ctx, '.screen-a')).toBe(true);
    expect(text(ctx)).toContain('Perfil de prueba 1');
  });

  it('[EP00-TBR-005-CA4] a session stored before start-up is restored and the route opens directly', async () => {
    const ctx = await start({ restoreWith: P1 });

    await go(ctx, '/zona-a');

    expect(ctx.store.session()?.profile.id).toBe(P1.profile.id);
    expect(primaryPath(ctx)).toBe('/zona-a');
    expect(shown(ctx, '.screen-a')).toBe(true);
  });

  it('[EP00-TBR-005-CA4] a failed restore at start-up does not break the app: it goes to the entry', async () => {
    const ctx = await start({
      restoreWith: new ApiError({ code: 'UNAVAILABLE', message: 'No responde (prueba).', field: null }),
    });

    await go(ctx, '/zona-a');

    expect(ctx.store.status()).toBe('signed-out');
    expect(primaryPath(ctx)).toBe('/entrada');
  });
});

// ---------- CA5 ----------

describe('[EP00-TBR-005-CA5] route without permission (screenGuard)', () => {
  it('[EP00-TBR-005-CA5] without view, «sin permisos» is shown, the screen is never loaded and the URL is kept', async () => {
    const ctx = await start();
    await signIn(ctx, P2);

    await go(ctx, '/zona-a');

    expect(shown(ctx, '.denied')).toBe(true);
    expect(shown(ctx, '.screen-a')).toBe(false);
    expect(counts.loadA).toBe(0);
    expect(counts.screenA).toBe(0);
    expect(ctx.location.path()).toBe('/zona-a');
  });

  it('[EP00-TBR-005-CA5] the URL with its query is kept in the address bar', async () => {
    const ctx = await start();
    await signIn(ctx, P2);

    await go(ctx, '/zona-a?pagina=3');

    expect(shown(ctx, '.denied')).toBe(true);
    expect(ctx.location.path()).toBe('/zona-a?pagina=3');
  });

  it('[EP00-TBR-005-CA5] with view the screen is loaded normally', async () => {
    const ctx = await start();
    await signIn(ctx, P2);

    await go(ctx, '/zona-b');

    expect(shown(ctx, '.screen-b')).toBe(true);
    expect(shown(ctx, '.denied')).toBe(false);
    expect(counts.loadB).toBe(1);
  });

  it('[EP00-TBR-005-CA5] a screen code outside the catalog is denied (fails closed)', async () => {
    const ctx = await start();
    await signIn(ctx, P1);

    await go(ctx, '/zona-desconocida');

    expect(shown(ctx, '.denied')).toBe(true);
    expect(shown(ctx, '.open')).toBe(false);
    expect(ctx.location.path()).toBe('/zona-desconocida');
  });

  it('[EP00-TBR-005-CA5] a route guarded by screenGuard without a screen code is denied (fails closed)', async () => {
    const ctx = await start();
    await signIn(ctx, P1);

    await go(ctx, '/zona-sin-codigo');

    expect(shown(ctx, '.denied')).toBe(true);
    expect(shown(ctx, '.open')).toBe(false);
  });

  it('[EP00-TBR-005-CA5] after a denied route, an allowed one opens normally', async () => {
    const ctx = await start();
    await signIn(ctx, P2);
    await go(ctx, '/zona-a');

    await go(ctx, '/zona-b');

    expect(shown(ctx, '.screen-b')).toBe(true);
    expect(shown(ctx, '.denied')).toBe(false);
    expect(ctx.location.path()).toBe('/zona-b');
  });
});

// ---------- CA3 ----------

describe('[EP00-TBR-005-CA3] profile change over the current screen', () => {
  it('[EP00-TBR-005-CA3] if the new profile has no view, «sin permisos» is shown and no data of the previous profile stays', async () => {
    const ctx = await start();
    await signIn(ctx, P1);
    await go(ctx, '/zona-a');
    expect(text(ctx)).toContain('Perfil de prueba 1');

    await switchTo(ctx, P2);

    expect(shown(ctx, '.denied')).toBe(true);
    expect(shown(ctx, '.screen-a')).toBe(false);
    expect(text(ctx)).not.toContain('Perfil de prueba 1');
    expect(ctx.location.path()).toBe('/zona-a');
  });

  it('[EP00-TBR-005-CA3] if the new profile has view, the screen is built again from scratch with the new profile', async () => {
    const ctx = await start();
    await signIn(ctx, P1);
    await go(ctx, '/zona-a');
    expect(counts.screenA).toBe(1);

    await switchTo(ctx, P4);

    expect(counts.screenA).toBe(2);
    expect(shown(ctx, '.screen-a')).toBe(true);
    expect(text(ctx)).toContain('Perfil de prueba 4');
    expect(text(ctx)).not.toContain('Perfil de prueba 1');
    expect(ctx.location.path()).toBe('/zona-a');
  });

  it('[EP00-TBR-005-CA3] arriving at the screen from the entry, a switch to a profile with view rebuilds it with the new profile', async () => {
    const ctx = await start();
    await go(ctx, '/entrada?returnUrl=%2Fzona-a');
    await signIn(ctx, P1);
    await go(ctx, '/zona-a');
    expect(counts.screenA).toBe(1);

    await switchTo(ctx, P4);

    expect(counts.screenA).toBe(2);
    expect(text(ctx)).toContain('Perfil de prueba 4');
    expect(text(ctx)).not.toContain('Perfil de prueba 1');
  });

  it('[EP00-TBR-005-CA3] from «sin permisos», a profile with view brings back the requested screen (visible URL, not /sin-permiso)', async () => {
    const ctx = await start();
    await signIn(ctx, P2);
    await go(ctx, '/zona-a');
    expect(shown(ctx, '.denied')).toBe(true);

    await switchTo(ctx, P1);

    expect(shown(ctx, '.screen-a')).toBe(true);
    expect(shown(ctx, '.denied')).toBe(false);
    expect(text(ctx)).toContain('Perfil de prueba 1');
    expect(ctx.location.path()).toBe('/zona-a');
  });

  it('[EP00-TBR-005-CA3] the change happens without reloading the app (same router, same root component)', async () => {
    const ctx = await start();
    await signIn(ctx, P1);
    await go(ctx, '/zona-a');
    const root = ctx.harness.fixture.componentInstance;
    const router = ctx.router;

    await switchTo(ctx, P4);

    expect(ctx.harness.fixture.componentInstance).toBe(root);
    expect(TestBed.inject(Router)).toBe(router);
  });

  it('[EP00-TBR-005-CA3] choosing the active profile again changes nothing: the screen is not rebuilt (PA-5)', async () => {
    const ctx = await start();
    await signIn(ctx, P1);
    await go(ctx, '/zona-a');
    const calls = ctx.identity.signInCalls;

    await switchTo(ctx, P1);

    expect(counts.screenA).toBe(1);
    expect(counts.loadA).toBe(1);
    expect(ctx.identity.signInCalls).toBe(calls);
    expect(shown(ctx, '.screen-a')).toBe(true);
  });

  it('[EP00-TBR-005-CA3] a failed change keeps the screen and the previous profile as they were (P-3)', async () => {
    const ctx = await start();
    await signIn(ctx, P1);
    await go(ctx, '/zona-a');
    ctx.identity.failNext = new ApiError({ code: 'UNAVAILABLE', message: 'No responde (prueba).', field: null });

    await switchTo(ctx, P2);

    expect(ctx.store.session()?.profile.id).toBe(P1.profile.id);
    expect(counts.screenA).toBe(1);
    expect(shown(ctx, '.screen-a')).toBe(true);
    expect(text(ctx)).toContain('Perfil de prueba 1');
  });

  it('[EP00-TBR-005-CA3] on /entrada the reaction does not navigate: the entry stays and is not rebuilt (precision a)', async () => {
    const ctx = await start();
    await signIn(ctx, P1);
    await go(ctx, '/zona-a');
    await go(ctx, '/entrada?returnUrl=%2Fzona-a');
    const entries = counts.entry;
    const loads = counts.loadA;

    await switchTo(ctx, P2);

    expect(primaryPath(ctx)).toBe('/entrada');
    expect(counts.entry).toBe(entries);
    expect(counts.loadA).toBe(loads);
    expect(shown(ctx, '.entry')).toBe(true);
  });

  it('[EP00-TBR-005-CA3] signing out over a screen leaves no data of the profile on screen and goes to the entry', async () => {
    const ctx = await start();
    await signIn(ctx, P1);
    await go(ctx, '/zona-a');

    await new Promise<void>((done) => ctx.store.signOut().subscribe({ complete: () => done(), error: () => done() }));
    await settle(ctx);

    expect(shown(ctx, '.screen-a')).toBe(false);
    expect(text(ctx)).not.toContain('Perfil de prueba 1');
    expect(primaryPath(ctx)).toBe('/entrada');
  });
});

// ---------- CA3 edge cases after round 2 of T2 (shouldAttach), final quality review ----------

describe('[EP00-TBR-005-CA3] epoch edge cases (final quality review)', () => {
  const signOut = (ctx: Ctx) =>
    new Promise<void>((done) => ctx.store.signOut().subscribe({ complete: () => done(), error: () => done() }));

  it('[EP00-TBR-005-CA3] a normal navigation under the same epoch does not rebuild the screen (no regression)', async () => {
    const ctx = await start();
    await signIn(ctx, P1);
    await go(ctx, '/zona-a?pagina=1');

    await go(ctx, '/zona-a?pagina=2');

    expect(counts.screenA).toBe(1);
    expect(counts.loadA).toBe(1);
    expect(ctx.location.path()).toBe('/zona-a?pagina=2');
  });

  it('[EP00-TBR-005-CA3] after a rebuild by a profile change, a normal navigation does not rebuild it again', async () => {
    const ctx = await start();
    await signIn(ctx, P1);
    await go(ctx, '/zona-a?pagina=1');
    await switchTo(ctx, P4);
    expect(counts.screenA).toBe(2);

    await go(ctx, '/zona-a?pagina=2');

    expect(counts.screenA).toBe(2);
    expect(text(ctx)).toContain('Perfil de prueba 4');
  });

  it('[EP00-TBR-005-CA3] restored session + direct link: a switch to a profile with view rebuilds the screen', async () => {
    const ctx = await start({ restoreWith: P1 });
    await go(ctx, '/zona-a');
    expect(counts.screenA).toBe(1);

    await switchTo(ctx, P4);

    expect(counts.screenA).toBe(2);
    expect(text(ctx)).toContain('Perfil de prueba 4');
    expect(text(ctx)).not.toContain('Perfil de prueba 1');
    expect(ctx.location.path()).toBe('/zona-a');
  });

  it('[EP00-TBR-005-CA3] restored session + direct link: a switch to a profile without view shows «sin permisos» and no previous data', async () => {
    const ctx = await start({ restoreWith: P1 });
    await go(ctx, '/zona-a');

    await switchTo(ctx, P2);

    expect(shown(ctx, '.denied')).toBe(true);
    expect(shown(ctx, '.screen-a')).toBe(false);
    expect(text(ctx)).not.toContain('Perfil de prueba 1');
    expect(ctx.location.path()).toBe('/zona-a');
  });

  it('[EP00-TBR-005-CA4] signing out over «sin permisos» goes to the entry', async () => {
    const ctx = await start();
    await signIn(ctx, P2);
    await go(ctx, '/zona-a');
    expect(shown(ctx, '.denied')).toBe(true);

    await signOut(ctx);
    await settle(ctx);

    expect(shown(ctx, '.denied')).toBe(false);
    expect(primaryPath(ctx)).toBe('/entrada');
  });

  it('[EP00-TBR-005-CA3] sign out and sign in with another profile: the screen is built with the new profile only', async () => {
    const ctx = await start();
    await signIn(ctx, P1);
    await go(ctx, '/zona-a');
    await signOut(ctx);
    await settle(ctx);

    await signIn(ctx, P4);
    await go(ctx, '/zona-a');

    expect(shown(ctx, '.screen-a')).toBe(true);
    expect(text(ctx)).toContain('Perfil de prueba 4');
    expect(text(ctx)).not.toContain('Perfil de prueba 1');
  });
});
