// Integration tests of the real app (appConfig + app.routes.ts + demo adapters), design EP00-TBR-005 §7.1 and §6;
// decisions P-4, PA-2 and S6. The demo session storage is replaced by an in-memory double (never the real one).
// [EP00-TBR-005-CA4] Without a session, /catalogo goes to /entrada?returnUrl=%2Fcatalogo and shows the profile selector.
// [EP00-TBR-005-CA5] «Perfil de demostración 8» is the only demo profile without view on the /catalogo screen: the
//                    route shows the «sin permisos» page (/sin-permiso, internal) and keeps /catalogo in the address bar.
// [EP00-TBR-005-CA3] Changing from a profile with view to «Perfil de demostración 8» over /catalogo replaces the catalog
//                    by «sin permisos», without data of the previous profile.
// S6: /catalogo is protected with a «sample.» screen code declared in app.routes.ts (AJ-4).
// Written before the code (T1, T3 pending). Synthetic data only.
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Route, Router, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { appConfig } from '../../app.config';
import { routes as appRoutes } from '../../app.routes';
import { Actions } from '../model/action';
import { Profile } from '../model/profile';
import { ScreenCode } from '../model/screen';
import { AccessStore } from '../data/access.store';
import { DemoProfilesPort } from '../data/demo-profiles.port';
import { DEMO_SESSION_STORAGE } from '../data/in-memory-identity.adapter';
import { AccessDeniedPage } from '../pages/access-denied.page';
import { DemoSignInPage } from '../pages/demo-sign-in.page';
import { demoModeGuard } from './demo-mode.guard';
import { screenGuard } from './screen.guard';
import { sessionGuard } from './session.guard';

const DENIED_TITLE = 'Tu perfil no puede ver esta pantalla';

class MemoryStorage {
  private readonly map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

// Route with that path and the chain of its ancestors.
function findRoute(routes: Routes, path: string, ancestors: Route[] = []): { route: Route; ancestors: Route[] } | null {
  for (const r of routes) {
    if (r.path === path) return { route: r, ancestors };
    const inner = findRoute(r.children ?? [], path, [...ancestors, r]);
    if (inner) return inner;
  }
  return null;
}

function catalogCode(): ScreenCode {
  const found = findRoute(appRoutes, 'catalogo');
  expect(found, 'falta la ruta catalogo en app.routes.ts').toBeTruthy();
  return found?.route.data?.['screen'] as ScreenCode;
}

async function start() {
  TestBed.configureTestingModule({
    providers: [...appConfig.providers, { provide: DEMO_SESSION_STORAGE, useValue: new MemoryStorage() as unknown as Storage }],
  });
  const harness = await RouterTestingHarness.create();
  return {
    harness,
    store: TestBed.inject(AccessStore),
    router: TestBed.inject(Router),
    location: TestBed.inject(Location),
    profiles: await firstValueFrom(TestBed.inject(DemoProfilesPort).list()),
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

const byName = (ctx: Ctx, name: string) => ctx.profiles.find((p) => p.name === name) as Profile;
const routed = (ctx: Ctx) => ctx.harness.routeDebugElement?.componentInstance as unknown;
const el = (ctx: Ctx) => ctx.harness.fixture.nativeElement as HTMLElement;

describe('[EP00-TBR-005-CA4][EP00-TBR-005-CA5] app.routes.ts declares the identity routes', () => {
  it('[EP00-TBR-005-CA4] /entrada only matches in memory mode (demoModeGuard, S8)', () => {
    const found = findRoute(appRoutes, 'entrada');

    expect(found).toBeTruthy();
    expect(found?.route.canMatch ?? []).toContain(demoModeGuard);
  });

  it('[EP00-TBR-005-CA5] /sin-permiso exists and needs a session (PA-2)', () => {
    const found = findRoute(appRoutes, 'sin-permiso');

    expect(found).toBeTruthy();
    const guards = [found?.route, ...(found?.ancestors ?? [])].flatMap((r) => r?.canMatch ?? []);
    expect(guards).toContain(sessionGuard);
  });

  it('[EP00-TBR-005-CA5] /catalogo needs a session and declares a «sample.» screen code checked by screenGuard (P-4, S6)', () => {
    const found = findRoute(appRoutes, 'catalogo');

    expect(found).toBeTruthy();
    expect(found?.route.canMatch ?? []).toContain(screenGuard);
    expect(found?.ancestors.flatMap((r) => r.canMatch ?? [])).toContain(sessionGuard);
    expect(catalogCode()).toMatch(/^sample\./);
  });
});

describe('[EP00-TBR-005-CA5] demo profiles against /catalogo (P-4)', () => {
  it('[EP00-TBR-005-CA5] only «Perfil de demostración 8» lacks view on the /catalogo screen', async () => {
    const ctx = await start();
    const code = catalogCode();
    const withoutView: string[] = [];

    for (const p of ctx.profiles) {
      await firstValueFrom(ctx.store.signIn({ kind: 'demo', profileId: p.id }));
      if (!ctx.store.can(code, Actions.VIEW)) withoutView.push(p.name);
      await new Promise<void>((done) => ctx.store.signOut().subscribe({ complete: () => done(), error: () => done() }));
    }

    expect(withoutView).toEqual(['Perfil de demostración 8']);
  });
});

describe('[EP00-TBR-005-CA4] the real app without a session', () => {
  it('[EP00-TBR-005-CA4] /catalogo goes to /entrada?returnUrl=%2Fcatalogo and shows the profile selector', async () => {
    const ctx = await start();

    await ctx.harness.navigateByUrl('/catalogo');
    await settle(ctx);

    const tree = ctx.router.parseUrl(ctx.router.url);
    expect(tree.root.children['primary']?.segments.map((s) => s.path)).toEqual(['entrada']);
    expect(tree.queryParams['returnUrl']).toBe('/catalogo');
    expect(routed(ctx)).toBeInstanceOf(DemoSignInPage);
  });
});

describe('[EP00-TBR-005-CA5][EP00-TBR-005-CA3] the real app with a demo profile', () => {
  it('[EP00-TBR-005-CA5] «Sistemas» opens /catalogo (the catalog screen of 003)', async () => {
    const ctx = await start();
    await firstValueFrom(ctx.store.signIn({ kind: 'demo', profileId: byName(ctx, 'Sistemas').id }));

    await ctx.harness.navigateByUrl('/catalogo');
    await settle(ctx);

    expect(ctx.location.path()).toBe('/catalogo');
    expect(routed(ctx)).not.toBeInstanceOf(AccessDeniedPage);
    expect(el(ctx).textContent).not.toContain(DENIED_TITLE);
  });

  it('[EP00-TBR-005-CA5] «Perfil de demostración 8» sees «sin permisos» on /catalogo and the address bar keeps /catalogo', async () => {
    const ctx = await start();
    await firstValueFrom(ctx.store.signIn({ kind: 'demo', profileId: byName(ctx, 'Perfil de demostración 8').id }));

    await ctx.harness.navigateByUrl('/catalogo');
    await settle(ctx);

    expect(routed(ctx)).toBeInstanceOf(AccessDeniedPage);
    expect(el(ctx).textContent).toContain(DENIED_TITLE);
    expect(el(ctx).querySelector('tb-data-table')).toBeNull();
    expect(ctx.location.path()).toBe('/catalogo');
  });

  it('[EP00-TBR-005-CA3] switching to «Perfil de demostración 8» over /catalogo shows «sin permisos» and no catalog data remains', async () => {
    const ctx = await start();
    await firstValueFrom(ctx.store.signIn({ kind: 'demo', profileId: byName(ctx, 'Perfil de demostración 3').id }));
    await ctx.harness.navigateByUrl('/catalogo');
    await settle(ctx);
    expect(routed(ctx)).not.toBeInstanceOf(AccessDeniedPage);

    await firstValueFrom(ctx.store.switchProfile(byName(ctx, 'Perfil de demostración 8').id));
    await settle(ctx);

    expect(routed(ctx)).toBeInstanceOf(AccessDeniedPage);
    expect(el(ctx).textContent).toContain(DENIED_TITLE);
    expect(el(ctx).querySelector('tb-data-table')).toBeNull();
    expect(el(ctx).querySelector('[role="row"]')).toBeNull();
    expect(ctx.location.path()).toBe('/catalogo');
  });
});
