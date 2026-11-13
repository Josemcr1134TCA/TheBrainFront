// Black-box tests of the demo entry page (profile selector, route /entrada), design EP00-TBR-005 §7.2, §7.4 and §8;
// approved UI docs/ui/EP00-TBR-005/ (index.html states normal, con-sesion, entrando, cambiando, cargando, error,
// error-cambio; propuesta.md §1, §3, §6, §7; PA-1, PA-4, PA-5, PA-7, PA-9; approved by the PO on 2026-11-13).
// [EP00-TBR-005-CA4] The entry is the selector: demo notice («Información.» + text, D2), title «Elige un perfil», eight profile rows with
//                    only the name; choosing one signs in and returns to safeReturnUrl(returnUrl) (internal only).
// [EP00-TBR-005-CA6] When the identity does not respond: error banner «Error. La identidad no está disponible por
//                    ahora. Elige un perfil otra vez.» inside the card, the person stays at the entry, no session, and
//                    can choose again; VALIDATION and any non-ApiError show the same text (PA-1); codes never shown.
// [EP00-TBR-005-CA3] With a session open (P-2): the active profile is marked (✓, aria-current, «Perfil activo» for
//                    screen readers); choosing another switches the profile and returns; choosing the active one does
//                    nothing and returns (PA-5); a failed change says «No pudimos cambiar de perfil. Sigues con …» (P-3).
// PA-4: «Entrando…» / «Cambiando…» on the chosen row and every row disabled while the request is in flight.
// Round 2 of the UI (2026-11-13, T4): D2 the notice is TbBanner level info as it is, so its bold word is «Información»
// and the text «Estás en modo demostración: los perfiles son de muestra.»; D3 VALIDATION while switching shows the
// switch-failure text; D7 a failure loading the profile list shows the CA6 text.
// Contract assumed for T3: class DemoSignInPage, standalone, in ./demo-sign-in.page.ts; it injects AccessStore and
// DemoProfilesPort; rows use the approved anatomy (button.tb-mi), the notice and the error use TbBanner (.tb-banner).
// Written before the code (T1). Synthetic data only.
import { Component, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom, Observable, of, Subject, throwError } from 'rxjs';
import { Profile } from '../model/profile';
import { Screen, ScreenCode } from '../model/screen';
import { SignInRequest } from '../model/session';
import { AccessStore } from '../data/access.store';
import { ApiError } from '../data/api-error';
import { provideDataMode } from '../data/data-mode';
import { DemoProfilesPort } from '../data/demo-profiles.port';
import { provideIdentityData } from '../data/identity-data.providers';
import { IdentityGrantDto, IdentityPort } from '../data/identity.port';
import { IN_MEMORY_FAILURE } from '../data/in-memory-failure';
import { DEMO_SESSION_STORAGE } from '../data/in-memory-identity.adapter';
import { ScreenCatalogPort } from '../data/screen-catalog.port';
import { DemoSignInPage } from './demo-sign-in.page';

// ---------- approved texts (propuesta.md §6) ----------

const TITLE = 'Elige un perfil';
// D2 (UI round 2): the word is the one TbBanner sets for level info.
const NOTICE_WORD = 'Información';
const NOTICE_TEXT = 'Estás en modo demostración: los perfiles son de muestra.';
const ERROR_WORD = 'Error';
const IDENTITY_ERROR = 'La identidad no está disponible por ahora. Elige un perfil otra vez.';
const switchError = (name: string) => `No pudimos cambiar de perfil. Sigues con ${name}.`;
const ENTERING = 'Entrando…';
const SWITCHING = 'Cambiando…';
const ACTIVE_SR = 'Perfil activo';
const NAMES = [
  'Sistemas',
  'Perfil de demostración 2',
  'Perfil de demostración 3',
  'Perfil de demostración 4',
  'Perfil de demostración 5',
  'Perfil de demostración 6',
  'Perfil de demostración 7',
  'Perfil de demostración 8',
];
const CODE_WORDS = /\b(UNAVAILABLE|FORBIDDEN|NOT_FOUND|VALIDATION|INVALID_CURSOR)\b/;

// ---------- synthetic data and fakes ----------

const A = 'sample.test.a' as ScreenCode;
const PROFILES: Profile[] = NAMES.map((name, i) => ({ id: `demo-test-${i + 1}`, name, synthetic: true }));
const idOf = (name: string) => (PROFILES.find((p) => p.name === name) as Profile).id;
const grantOf = (id: string): IdentityGrantDto => {
  const p = PROFILES.find((x) => x.id === id) as Profile;
  return { user: { id: `user-${id}`, displayName: `Usuario ${p.name}` }, profile: { ...p }, grants: [{ screen: A, actions: ['view'] }] };
};

class FakeIdentityPort extends IdentityPort {
  readonly calls: SignInRequest[] = [];
  next: 'ok' | 'pending' | unknown = 'ok';
  pending = new Subject<IdentityGrantDto>();

  restore(): Observable<IdentityGrantDto | null> {
    return of(null);
  }
  signIn(request: SignInRequest): Observable<IdentityGrantDto> {
    this.calls.push(request);
    const next = this.next;
    if (next === 'ok') {
      return PROFILES.some((p) => p.id === request.profileId)
        ? of(grantOf(request.profileId))
        : throwError(() => new ApiError({ code: 'VALIDATION', message: 'Perfil inexistente (prueba).', field: 'profileId' }));
    }
    if (next === 'pending') return this.pending.asObservable();
    return throwError(() => next);
  }
  signOut(): Observable<void> {
    return of(undefined);
  }
  resolve(id: string) {
    this.pending.next(grantOf(id));
    this.pending.complete();
  }
}

class FakeScreenCatalogPort extends ScreenCatalogPort {
  screens(): Observable<readonly Screen[]> {
    return of([{ code: A, module: 'Módulo de prueba', name: 'Pantalla de prueba A', active: true }]);
  }
}

class FakeDemoProfilesPort extends DemoProfilesPort {
  list$: Observable<readonly Profile[]> = of(PROFILES);
  list(): Observable<readonly Profile[]> {
    return this.list$;
  }
}

@Component({ selector: 'test-zone', template: '<p class="zone">Zona de prueba</p>' })
class ZoneStub {}

@Component({ selector: 'test-home', template: '<p class="home">Inicio de prueba</p>' })
class HomeStub {}

const ROUTES = [
  { path: 'entrada', component: DemoSignInPage },
  { path: 'zona-a', component: ZoneStub },
  { path: 'sin-permiso', component: ZoneStub },
  { path: '', pathMatch: 'full' as const, component: HomeStub },
];

// ---------- harness ----------

interface Options {
  /** Real demo adapters (provideIdentityData) instead of fakes. */
  real?: boolean;
  extra?: Provider[];
  profiles?: FakeDemoProfilesPort;
}

async function open(url = '/entrada?returnUrl=%2Fzona-a', options: Options = {}, before?: (store: AccessStore) => Promise<void>) {
  const identity = new FakeIdentityPort();
  const profiles = options.profiles ?? new FakeDemoProfilesPort();
  const storage = new Map<string, string>();
  const storageDouble = {
    get length() {
      return storage.size;
    },
    key: (i: number) => [...storage.keys()][i] ?? null,
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
    clear: () => storage.clear(),
  } as unknown as Storage;
  TestBed.configureTestingModule({
    providers: [
      provideRouter(ROUTES),
      provideDataMode('memory'),
      ...(options.real
        ? [provideIdentityData(), { provide: DEMO_SESSION_STORAGE, useValue: storageDouble }]
        : [
            { provide: IdentityPort, useValue: identity },
            { provide: ScreenCatalogPort, useValue: new FakeScreenCatalogPort() },
            { provide: DemoProfilesPort, useValue: profiles },
          ]),
      ...(options.extra ?? []),
    ],
  });
  const store = TestBed.inject(AccessStore);
  if (before) await before(store);
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const ctx = { harness, identity, profiles, store, storage, router: TestBed.inject(Router) };
  await settle(ctx);
  return ctx;
}

type Ctx = Awaited<ReturnType<typeof open>>;

async function settle(ctx: { harness: RouterTestingHarness }) {
  for (let i = 0; i < 5; i++) {
    TestBed.tick();
    await ctx.harness.fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
  }
  ctx.harness.detectChanges();
}

const root = (ctx: Ctx) => ctx.harness.fixture.nativeElement as HTMLElement;
const flat = (node: Element | null) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
const rows = (ctx: Ctx) => [...root(ctx).querySelectorAll<HTMLElement>('.tb-mi')];
const row = (ctx: Ctx, name: string) => rows(ctx).find((r) => flat(r).includes(name)) as HTMLElement;
const disabled = (r: HTMLElement) => r.hasAttribute('disabled') || r.getAttribute('aria-disabled') === 'true';
const notice = (ctx: Ctx) => root(ctx).querySelector<HTMLElement>('.tb-banner.info');
const alert = (ctx: Ctx) => root(ctx).querySelector<HTMLElement>('[role="alert"]');
const path = (ctx: Ctx) => '/' + (ctx.router.parseUrl(ctx.router.url).root.children['primary']?.segments.map((s) => s.path).join('/') ?? '');

async function choose(ctx: Ctx, name: string) {
  row(ctx, name).click();
  await settle(ctx);
}

const signedInAs = (name: string) => async (store: AccessStore) => {
  await firstValueFrom(store.signIn({ kind: 'demo', profileId: idOf(name) }));
};

// ---------- normal (CA4) ----------

describe('[EP00-TBR-005-CA4] DemoSignInPage: entry without a session (state «normal»)', () => {
  it('[EP00-TBR-005-CA4] shows the title «Elige un perfil»', async () => {
    const ctx = await open();

    expect(flat(root(ctx).querySelector('h1'))).toBe(TITLE);
  });

  it('[EP00-TBR-005-CA4] shows the demo notice as an info banner with role="status" and the approved text (S10, D2)', async () => {
    const ctx = await open();

    const banner = notice(ctx);
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute('role')).toBe('status');
    expect(flat(banner)).toContain(NOTICE_TEXT);
    expect(flat(banner)).toContain(NOTICE_WORD);
  });

  it('[EP00-TBR-005-CA4] the bold word of the notice is «Información», the one of TbBanner level info (D2)', async () => {
    const ctx = await open();

    expect(flat(notice(ctx)?.querySelector('b') ?? null).replace(/\.$/, '')).toBe(NOTICE_WORD);
  });

  it('[EP00-TBR-005-CA4] lists the eight profiles in order, each row with only its name (PA-9)', async () => {
    const ctx = await open();

    expect(rows(ctx)).toHaveLength(8);
    rows(ctx).forEach((r, i) => {
      expect(flat(r)).toContain(NAMES[i]);
      expect(r.querySelector('small')).toBeNull();
    });
  });

  it('[EP00-TBR-005-CA4] with the real demo adapter the rows are the eight approved profiles', async () => {
    const ctx = await open(undefined, { real: true });

    expect(rows(ctx).map((r) => NAMES.find((n) => flat(r).includes(n)))).toEqual(NAMES);
  });

  it('[EP00-TBR-005-CA4] without a session no row is marked active, no row is disabled and there is no error', async () => {
    const ctx = await open();

    expect(rows(ctx).some((r) => r.getAttribute('aria-current') === 'true')).toBe(false);
    expect(flat(root(ctx))).not.toContain(ACTIVE_SR);
    expect(rows(ctx).some(disabled)).toBe(false);
    expect(alert(ctx)).toBeNull();
  });

  it('[EP00-TBR-005-CA4] choosing a profile signs in with it and returns to the requested route', async () => {
    const ctx = await open('/entrada?returnUrl=%2Fzona-a%3Fpagina%3D2');

    await choose(ctx, 'Perfil de demostración 4');

    expect(ctx.identity.calls).toEqual([{ kind: 'demo', profileId: idOf('Perfil de demostración 4') }]);
    expect(ctx.store.session()?.profile.id).toBe(idOf('Perfil de demostración 4'));
    expect(ctx.router.url).toBe('/zona-a?pagina=2');
  });

  it('[EP00-TBR-005-CA4] without returnUrl it goes to «/»', async () => {
    const ctx = await open('/entrada');

    await choose(ctx, 'Sistemas');

    expect(ctx.router.url).toBe('/');
  });

  for (const evil of ['https%3A%2F%2Fevil.example', '%2F%2Fevil.example', '%2F%5Cevil.example', '%2Fsin-permiso', '%2Fentrada']) {
    it(`[EP00-TBR-005-CA4] a returnUrl that is not an allowed internal route («${decodeURIComponent(evil)}») goes to «/»`, async () => {
      const ctx = await open(`/entrada?returnUrl=${evil}`);

      await choose(ctx, 'Sistemas');

      expect(ctx.router.url).toBe('/');
    });
  }
});

// ---------- cargando and entrando (PA-4) ----------

describe('[EP00-TBR-005-CA4] DemoSignInPage: loading and entering (states «cargando», «entrando»)', () => {
  it('[EP00-TBR-005-CA4] while the list loads: skeleton (aria-busy) inside the card, title and notice already there, no rows', async () => {
    const profiles = new FakeDemoProfilesPort();
    const list = new Subject<readonly Profile[]>();
    profiles.list$ = list.asObservable();
    const ctx = await open(undefined, { profiles });

    expect(root(ctx).querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(flat(root(ctx).querySelector('h1'))).toBe(TITLE);
    expect(notice(ctx)).not.toBeNull();
    expect(rows(ctx)).toHaveLength(0);

    list.next(PROFILES);
    list.complete();
    await settle(ctx);
    expect(root(ctx).querySelector('[aria-busy="true"]')).toBeNull();
    expect(rows(ctx)).toHaveLength(8);
  });

  it('[EP00-TBR-005-CA4] while entering, the chosen row says «Entrando…» and every row is disabled (PA-4)', async () => {
    const ctx = await open();
    ctx.identity.next = 'pending';

    await choose(ctx, 'Perfil de demostración 4');

    expect(flat(rows(ctx)[3])).toContain(ENTERING);
    expect(rows(ctx).every(disabled)).toBe(true);
    expect(flat(root(ctx))).not.toContain(SWITCHING);
    expect(path(ctx)).toBe('/entrada');
  });

  it('[EP00-TBR-005-CA4] a second choice while entering does nothing (PA-4)', async () => {
    const ctx = await open();
    ctx.identity.next = 'pending';
    await choose(ctx, 'Perfil de demostración 4');

    rows(ctx)[1].click();
    await settle(ctx);

    expect(ctx.identity.calls).toHaveLength(1);
    ctx.identity.resolve(idOf('Perfil de demostración 4'));
    await settle(ctx);
    expect(ctx.store.session()?.profile.id).toBe(idOf('Perfil de demostración 4'));
    expect(ctx.router.url).toBe('/zona-a');
  });
});

// ---------- error (CA6) ----------

describe('[EP00-TBR-005-CA6] DemoSignInPage: identity not available (state «error»)', () => {
  const FAILURES: [string, () => unknown][] = [
    ['UNAVAILABLE', () => new ApiError({ code: 'UNAVAILABLE', message: 'Servicio caído (prueba).', field: null })],
    ['an error that is not an ApiError', () => new TypeError('detalle-interno-de-prueba')],
  ];
  for (const [label, failure] of FAILURES) {
    it(`[EP00-TBR-005-CA6] on ${label}: error banner with the approved text, stays at the entry, no session`, async () => {
      const ctx = await open();
      ctx.identity.next = failure();

      await choose(ctx, 'Sistemas');

      const banner = alert(ctx);
      expect(banner).not.toBeNull();
      expect(flat(banner)).toContain(IDENTITY_ERROR);
      expect(flat(banner?.querySelector('b') ?? null).replace(/\.$/, '')).toBe(ERROR_WORD);
      expect(path(ctx)).toBe('/entrada');
      expect(ctx.store.session()).toBeNull();
      expect(flat(root(ctx))).not.toMatch(CODE_WORDS);
      expect(flat(root(ctx))).not.toContain('detalle-interno-de-prueba');
      expect(flat(root(ctx))).not.toContain('Servicio caído (prueba).');
      expect(flat(root(ctx))).not.toContain('Referencia');
    });
  }

  it('[EP00-TBR-005-CA6] VALIDATION (unknown profile) shows the same text as UNAVAILABLE (PA-1)', async () => {
    const profiles = new FakeDemoProfilesPort();
    profiles.list$ = of([...PROFILES.slice(0, 7), { id: 'demo-test-missing', name: 'Perfil de demostración 8', synthetic: true }]);
    const ctx = await open(undefined, { profiles });

    await choose(ctx, 'Perfil de demostración 8');

    expect(flat(alert(ctx))).toContain(IDENTITY_ERROR);
    expect(path(ctx)).toBe('/entrada');
    expect(ctx.store.session()).toBeNull();
    expect(flat(root(ctx))).not.toMatch(CODE_WORDS);
  });

  it('[EP00-TBR-005-CA6] the error sits inside the card and the demo notice stays outside it (PA-7)', async () => {
    const ctx = await open();
    ctx.identity.next = new ApiError({ code: 'UNAVAILABLE', message: 'x', field: null });

    await choose(ctx, 'Sistemas');

    expect(notice(ctx)).not.toBeNull();
    const banner = alert(ctx) as HTMLElement;
    expect(banner.closest('.tb-authcard')).not.toBeNull();
    expect(notice(ctx)?.closest('.tb-authcard')).toBeNull();
  });

  it('[EP00-TBR-005-CA6] after the error the list is still choosable and choosing again can enter', async () => {
    const ctx = await open();
    ctx.identity.next = new ApiError({ code: 'UNAVAILABLE', message: 'x', field: null });
    await choose(ctx, 'Sistemas');
    expect(rows(ctx)).toHaveLength(8);
    expect(rows(ctx).some(disabled)).toBe(false);

    ctx.identity.next = 'ok';
    await choose(ctx, 'Sistemas');

    expect(ctx.store.session()?.profile.name).toBe('Sistemas');
    expect(ctx.router.url).toBe('/zona-a');
  });

  it('[EP00-TBR-005-CA6] with the real demo adapter and IN_MEMORY_FAILURE: same text, no session, nothing stored', async () => {
    const failure = new ApiError({ code: 'UNAVAILABLE', message: 'Servicio caído (prueba).', field: null });
    const ctx = await open(undefined, { real: true, extra: [{ provide: IN_MEMORY_FAILURE, useValue: failure }] });

    await choose(ctx, 'Sistemas');

    expect(flat(alert(ctx))).toContain(IDENTITY_ERROR);
    expect(path(ctx)).toBe('/entrada');
    expect(ctx.store.session()).toBeNull();
    expect(ctx.storage.size).toBe(0);
  });
});

// ---------- with a session (CA3, P-2) ----------

describe('[EP00-TBR-005-CA3] DemoSignInPage with a session open (states «con-sesion», «cambiando», «error-cambio»)', () => {
  const ACTIVE = 'Perfil de demostración 3';

  it('[EP00-TBR-005-CA3] marks the active profile: aria-current="true" and «Perfil activo» for screen readers; only that row', async () => {
    const ctx = await open(undefined, {}, signedInAs(ACTIVE));

    const current = rows(ctx).filter((r) => r.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(flat(current[0])).toContain(ACTIVE);
    expect(flat(current[0])).toContain(ACTIVE_SR);
    expect(rows(ctx).filter((r) => flat(r).includes(ACTIVE_SR))).toHaveLength(1);
  });

  it('[EP00-TBR-005-CA3] choosing another profile switches it without a new sign-in flow and returns to the previous route', async () => {
    const ctx = await open('/entrada?returnUrl=%2Fzona-a', {}, signedInAs(ACTIVE));
    const before = ctx.store.epoch();

    await choose(ctx, 'Perfil de demostración 8');

    expect(ctx.identity.calls.at(-1)).toEqual({ kind: 'demo', profileId: idOf('Perfil de demostración 8') });
    expect(ctx.store.session()?.profile.name).toBe('Perfil de demostración 8');
    expect(ctx.store.epoch()).toBeGreaterThan(before);
    expect(ctx.router.url).toBe('/zona-a');
  });

  it('[EP00-TBR-005-CA3] choosing the active profile does nothing and returns to the previous route (PA-5)', async () => {
    const ctx = await open('/entrada?returnUrl=%2Fzona-a', {}, signedInAs(ACTIVE));
    const calls = ctx.identity.calls.length;
    const epoch = ctx.store.epoch();
    const session = ctx.store.session();

    await choose(ctx, ACTIVE);

    expect(ctx.identity.calls.length).toBe(calls);
    expect(ctx.store.epoch()).toBe(epoch);
    expect(ctx.store.session()).toBe(session);
    expect(ctx.router.url).toBe('/zona-a');
  });

  it('[EP00-TBR-005-CA3] while switching, the chosen row says «Cambiando…», every row is disabled and the active mark stays (PA-4)', async () => {
    const ctx = await open(undefined, {}, signedInAs(ACTIVE));
    ctx.identity.next = 'pending';

    await choose(ctx, 'Perfil de demostración 4');

    expect(flat(rows(ctx)[3])).toContain(SWITCHING);
    expect(flat(root(ctx))).not.toContain(ENTERING);
    expect(rows(ctx).every(disabled)).toBe(true);
    expect(row(ctx, ACTIVE).getAttribute('aria-current')).toBe('true');
    expect(path(ctx)).toBe('/entrada');
  });

  it('[EP00-TBR-005-CA3] a failed switch says «No pudimos cambiar de perfil. Sigues con <activo>.» and keeps the previous profile (P-3)', async () => {
    const ctx = await open(undefined, {}, signedInAs(ACTIVE));
    const session = ctx.store.session();
    ctx.identity.next = new ApiError({ code: 'UNAVAILABLE', message: 'Servicio caído (prueba).', field: null });

    await choose(ctx, 'Perfil de demostración 8');

    const banner = alert(ctx);
    expect(flat(banner)).toContain(switchError(ACTIVE));
    expect(flat(banner?.querySelector('b') ?? null).replace(/\.$/, '')).toBe(ERROR_WORD);
    expect(ctx.store.session()).toBe(session);
    expect(row(ctx, ACTIVE).getAttribute('aria-current')).toBe('true');
    expect(rows(ctx).some(disabled)).toBe(false);
    expect(path(ctx)).toBe('/entrada');
    expect(flat(root(ctx))).not.toMatch(CODE_WORDS);
  });

  it('[EP00-TBR-005-CA3] VALIDATION while switching (unknown profile) shows the switch-failure text and keeps the previous profile (D3)', async () => {
    const profiles = new FakeDemoProfilesPort();
    profiles.list$ = of([...PROFILES.slice(0, 7), { id: 'demo-test-missing', name: 'Perfil de demostración 8', synthetic: true }]);
    const ctx = await open(undefined, { profiles }, signedInAs(ACTIVE));
    const session = ctx.store.session();

    await choose(ctx, 'Perfil de demostración 8');

    const banner = alert(ctx);
    expect(flat(banner)).toContain(switchError(ACTIVE));
    expect(flat(banner)).not.toContain(IDENTITY_ERROR);
    expect(ctx.store.session()).toBe(session);
    expect(path(ctx)).toBe('/entrada');
    expect(flat(root(ctx))).not.toMatch(CODE_WORDS);
  });
});

// ---------- profile list failure (D7) ----------

describe('[EP00-TBR-005-CA6] DemoSignInPage: the profile list fails to load (D7)', () => {
  const failingList = () => {
    const profiles = new FakeDemoProfilesPort();
    profiles.list$ = throwError(() => new ApiError({ code: 'UNAVAILABLE', message: 'Lista caída (prueba).', field: null }));
    return profiles;
  };

  it('[EP00-TBR-005-CA6] without a session: the CA6 error text, no skeleton left, stays at the entry and no session (D7)', async () => {
    const ctx = await open(undefined, { profiles: failingList() });

    const banner = alert(ctx);
    expect(flat(banner)).toContain(IDENTITY_ERROR);
    expect(flat(banner?.querySelector('b') ?? null).replace(/\.$/, '')).toBe(ERROR_WORD);
    expect(root(ctx).querySelector('[aria-busy="true"]')).toBeNull();
    expect(path(ctx)).toBe('/entrada');
    expect(ctx.store.session()).toBeNull();
    expect(flat(root(ctx))).not.toContain('Lista caída (prueba).');
    expect(flat(root(ctx))).not.toMatch(CODE_WORDS);
  });

  it('[EP00-TBR-005-CA6] with a session open: still the CA6 error text, not the switch-failure text (no switch was tried) (D7)', async () => {
    const ctx = await open(undefined, { profiles: failingList() }, signedInAs('Perfil de demostración 3'));

    const banner = alert(ctx);
    expect(flat(banner)).toContain(IDENTITY_ERROR);
    expect(flat(banner)).not.toContain('No pudimos cambiar de perfil');
    expect(ctx.store.session()?.profile.name).toBe('Perfil de demostración 3');
  });
});
