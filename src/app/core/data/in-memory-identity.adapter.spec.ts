// Contract tests of the demo identity data in memory mode (design EP00-TBR-005 §3, §4, §6; decisions P-1, P-4, S6, S8,
// S10, DA-5 and the sessionStorage decision). Only through the ports (IdentityPort, DemoProfilesPort, ScreenCatalogPort)
// and AccessStore: the fixtures are never imported here.
// [EP00-TBR-005-CA1] The demo data brings a profile with only view on a screen and a profile with everything (Sistemas).
// [EP00-TBR-005-CA2] It brings a profile with capture/approve WITHOUT view in the raw data; the store drops them.
// [EP00-TBR-005-CA4] The demo session lives in sessionStorage as {v, profileId} only (never permissions); an unreadable
//                    value, another version or an unknown profile is erased and there is no session.
// [EP00-TBR-005-CA5] Eight synthetic profiles: «Sistemas» and «Perfil de demostración 2…8» (P-1).
// [EP00-TBR-005-CA6] IN_MEMORY_FAILURE (tests only) makes restore and signIn fail without touching the storage; the
//                    profile list does not fail; a failed sign-in leaves nothing stored (no partial session).
// S6: every screen code of the sample catalog and of the demo grants starts with «sample.». S8: memory mode only.
// Written before the code (T1). Synthetic data only.
import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, throwError } from 'rxjs';
import { appConfig } from '../../app.config';
import { Actions } from '../model/action';
import { Profile } from '../model/profile';
import { Screen } from '../model/screen';
import { AccessStore } from './access.store';
import { ApiError, isApiError } from './api-error';
import { DATA_MODE, DataMode, provideDataMode } from './data-mode';
import { DemoProfilesPort } from './demo-profiles.port';
import { provideIdentityData } from './identity-data.providers';
import { IdentityGrantDto, IdentityPort } from './identity.port';
import { InMemoryDemoProfilesAdapter } from './in-memory-demo-profiles.adapter';
import { IN_MEMORY_FAILURE } from './in-memory-failure';
import { DEMO_SESSION_STORAGE, InMemoryIdentityAdapter } from './in-memory-identity.adapter';
import { InMemoryScreenCatalogAdapter } from './in-memory-screen-catalog.adapter';
import { ScreenCatalogPort } from './screen-catalog.port';

const NO_ADAPTER = /No hay adaptador de datos para el modo/;
const APPROVED_NAMES = [
  'Sistemas',
  'Perfil de demostración 2',
  'Perfil de demostración 3',
  'Perfil de demostración 4',
  'Perfil de demostración 5',
  'Perfil de demostración 6',
  'Perfil de demostración 7',
  'Perfil de demostración 8',
];
const SAMPLE = /^sample\./;

// ---------- Storage double ----------

class MemoryStorage {
  private readonly map = new Map<string, string>();
  writes = 0;
  removes = 0;

  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.writes++;
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.removes++;
    this.map.delete(key);
  }
  clear(): void {
    this.removes++;
    this.map.clear();
  }
  entries(): [string, string][] {
    return [...this.map.entries()];
  }
  /** Writes without counting (to seed a test). */
  seed(key: string, value: string) {
    this.map.set(key, value);
  }
  asStorage(): Storage {
    return this as unknown as Storage;
  }
}

// ---------- harness ----------

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

function configure(storage: MemoryStorage, extra: Provider[] = []) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideDataMode('memory'),
      provideIdentityData(),
      { provide: DEMO_SESSION_STORAGE, useValue: storage.asStorage() },
      ...extra,
    ],
  });
  return {
    identity: TestBed.inject(IdentityPort),
    profiles: TestBed.inject(DemoProfilesPort),
    catalog: TestBed.inject(ScreenCatalogPort),
    store: TestBed.inject(AccessStore),
  };
}

const unavailable = () =>
  new ApiError({ code: 'UNAVAILABLE', message: 'La identidad no responde (prueba).', field: null });

async function demoProfiles(): Promise<readonly Profile[]> {
  return firstValueFrom(configure(new MemoryStorage()).profiles.list());
}

async function idOf(name: string): Promise<string> {
  const found = (await demoProfiles()).find((p) => p.name === name);
  expect(found, `falta el perfil «${name}»`).toBeTruthy();
  return (found as Profile).id;
}

async function rawGrantOf(id: string): Promise<IdentityGrantDto> {
  return firstValueFrom(configure(new MemoryStorage()).identity.signIn({ kind: 'demo', profileId: id }));
}

async function activeScreens(): Promise<Screen[]> {
  const screens = await firstValueFrom(configure(new MemoryStorage()).catalog.screens());
  return screens.filter((s) => s.active);
}

// Key under which the adapter keeps the demo session (not fixed by the design; discovered by signing in once).
async function storageKey(): Promise<string> {
  const storage = new MemoryStorage();
  const { identity, profiles } = configure(storage);
  const [first] = await firstValueFrom(profiles.list());
  await firstValueFrom(identity.signIn({ kind: 'demo', profileId: first.id }));
  expect(storage.length).toBe(1);
  return storage.key(0) as string;
}

// ---------- S8 and wiring ----------

describe('[EP00-TBR-005-CA4] identity data wiring (provideIdentityData, memory mode only, S8)', () => {
  it('[EP00-TBR-005-CA4] in memory mode the three ports resolve to the in-memory adapters', () => {
    const { identity, profiles, catalog } = configure(new MemoryStorage());

    expect(identity).toBeInstanceOf(InMemoryIdentityAdapter);
    expect(profiles).toBeInstanceOf(InMemoryDemoProfilesAdapter);
    expect(catalog).toBeInstanceOf(InMemoryScreenCatalogAdapter);
  });

  it('[EP00-TBR-005-CA4] without a data mode every identity port fails with the Spanish message of 003', () => {
    TestBed.configureTestingModule({ providers: [provideIdentityData()] });

    expect(() => TestBed.inject(IdentityPort)).toThrow(NO_ADAPTER);
    expect(() => TestBed.inject(DemoProfilesPort)).toThrow(NO_ADAPTER);
    expect(() => TestBed.inject(ScreenCatalogPort)).toThrow(NO_ADAPTER);
  });

  it('[EP00-TBR-005-CA4] another mode has no demo adapter and never falls back to memory', () => {
    TestBed.configureTestingModule({
      providers: [provideDataMode('remote' as unknown as DataMode), provideIdentityData()],
    });

    expect(() => TestBed.inject(IdentityPort)).toThrow(NO_ADAPTER);
    expect(() => TestBed.inject(DemoProfilesPort)).toThrow(NO_ADAPTER);
    expect(() => TestBed.inject(ScreenCatalogPort)).toThrow(NO_ADAPTER);
  });

  it('[EP00-TBR-005-CA4] the demo session storage is sessionStorage by default', () => {
    TestBed.configureTestingModule({ providers: [provideDataMode('memory'), provideIdentityData()] });

    expect(TestBed.inject(DEMO_SESSION_STORAGE)).toBe(globalThis.sessionStorage);
  });

  it('[EP00-TBR-005-CA6] with appConfig the identity port is the in-memory adapter and IN_MEMORY_FAILURE resolves to null', () => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, { provide: DEMO_SESSION_STORAGE, useValue: new MemoryStorage().asStorage() }],
    });

    expect(TestBed.inject(DATA_MODE)).toBe('memory');
    expect(TestBed.inject(IdentityPort)).toBeInstanceOf(InMemoryIdentityAdapter);
    expect(TestBed.inject(IN_MEMORY_FAILURE, null)).toBeNull();
  });
});

// ---------- demo profiles ----------

describe('[EP00-TBR-005-CA5] demo profiles (P-1, S10)', () => {
  it('[EP00-TBR-005-CA5] lists exactly the eight approved names, in order', async () => {
    expect((await demoProfiles()).map((p) => p.name)).toEqual(APPROVED_NAMES);
  });

  it('[EP00-TBR-005-CA5] every demo profile is synthetic, with a unique non-empty id', async () => {
    const list = await demoProfiles();

    expect(list.every((p) => p.synthetic === true)).toBe(true);
    const ids = list.map((p) => p.id);
    expect(ids.every((id) => typeof id === 'string' && id.trim() !== '')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('[EP00-TBR-005-CA5] signing in with each profile returns that same synthetic profile and a user', async () => {
    for (const p of await demoProfiles()) {
      const g = await rawGrantOf(p.id);
      expect(g.profile).toEqual({ id: p.id, name: p.name, synthetic: true });
      expect(g.user.id.trim()).not.toBe('');
      expect(g.user.displayName.trim()).not.toBe('');
    }
  });

  it('[EP00-TBR-005-CA6] the profile list does not fail with IN_MEMORY_FAILURE (the person stays at the entry)', async () => {
    const { profiles } = configure(new MemoryStorage(), [{ provide: IN_MEMORY_FAILURE, useValue: unavailable() }]);

    expect((await firstValueFrom(profiles.list())).map((p) => p.name)).toEqual(APPROVED_NAMES);
  });
});

// ---------- sample catalog and grants (S6) ----------

describe('[EP00-TBR-005-CA1] sample screen catalog (S6, R-0007)', () => {
  it('[EP00-TBR-005-CA1] every screen code of the catalog starts with «sample.» while S6 is open', async () => {
    const screens = await firstValueFrom(configure(new MemoryStorage()).catalog.screens());

    expect(screens.length).toBeGreaterThan(0);
    for (const s of screens) expect(s.code).toMatch(SAMPLE);
  });

  it('[EP00-TBR-005-CA1] codes are unique, names are «Pantalla de muestra n» and at least one screen is active', async () => {
    const screens = await firstValueFrom(configure(new MemoryStorage()).catalog.screens());

    expect(new Set(screens.map((s) => s.code)).size).toBe(screens.length);
    for (const s of screens) expect(s.name).toMatch(/^Pantalla de muestra \d+$/);
    expect(screens.some((s) => s.active)).toBe(true);
  });

  it('[EP00-TBR-005-CA1] every screen code in the raw grants of every demo profile starts with «sample.»', async () => {
    for (const p of await demoProfiles()) {
      const g = await rawGrantOf(p.id);
      for (const entry of g.grants) expect(entry.screen, `perfil ${p.name}`).toMatch(SAMPLE);
    }
  });
});

describe('[EP00-TBR-005-CA1][EP00-TBR-005-CA2] demo grants cover the cases of the story', () => {
  it('[EP00-TBR-005-CA1] some demo profile has only view on some active screen: it views it and cannot capture or approve', async () => {
    const active = await activeScreens();
    let found = false;
    for (const p of await demoProfiles()) {
      const { store } = configure(new MemoryStorage());
      await firstValueFrom(store.signIn({ kind: 'demo', profileId: p.id }));
      for (const s of active)
        if (store.can(s.code, Actions.VIEW) && !store.can(s.code, Actions.CAPTURE) && !store.can(s.code, Actions.APPROVE))
          found = true;
    }
    expect(found).toBe(true);
  });

  it('[EP00-TBR-005-CA2] some demo profile brings capture or approve WITHOUT view on a screen in the raw data, and the store drops them', async () => {
    let found = false;
    for (const p of await demoProfiles()) {
      const g = await rawGrantOf(p.id);
      const orphan = g.grants.find((e) => !e.actions.includes('view') && e.actions.some((a) => a === 'capture' || a === 'approve'));
      if (!orphan) continue;
      found = true;
      const { store } = configure(new MemoryStorage());
      await firstValueFrom(store.signIn({ kind: 'demo', profileId: p.id }));
      const screen = orphan.screen as Parameters<AccessStore['can']>[0];
      expect(store.can(screen, Actions.CAPTURE)).toBe(false);
      expect(store.can(screen, Actions.APPROVE)).toBe(false);
    }
    expect(found).toBe(true);
  });

  it('[EP00-TBR-005-CA1] some demo profile has no view on any screen', async () => {
    const active = await activeScreens();
    let found = false;
    for (const p of await demoProfiles()) {
      const { store } = configure(new MemoryStorage());
      await firstValueFrom(store.signIn({ kind: 'demo', profileId: p.id }));
      if (active.every((s) => !store.can(s.code, Actions.VIEW))) found = true;
    }
    expect(found).toBe(true);
  });

  it('[EP00-TBR-005-CA1] «Sistemas» has view, capture and approve on every active screen', async () => {
    const active = await activeScreens();
    const id = await idOf('Sistemas');
    const { store } = configure(new MemoryStorage());
    await firstValueFrom(store.signIn({ kind: 'demo', profileId: id }));

    for (const s of active)
      for (const act of [Actions.VIEW, Actions.CAPTURE, Actions.APPROVE]) expect(store.can(s.code, act), `${s.code} ${act}`).toBe(true);
  });
});

// ---------- CA6: simulated failure ----------

describe('[EP00-TBR-005-CA6] simulated identity failure (IN_MEMORY_FAILURE, tests only)', () => {
  it('[EP00-TBR-005-CA6] restore emits the configured error and does not touch the storage', async () => {
    const key = await storageKey();
    const id = await idOf('Perfil de demostración 3');
    const storage = new MemoryStorage();
    storage.seed(key, JSON.stringify({ v: 1, profileId: id }));
    const failure = unavailable();
    const { identity } = configure(storage, [{ provide: IN_MEMORY_FAILURE, useValue: failure }]);

    const result = await outcome(identity.restore());

    expect(result.error).toBe(failure);
    expect(storage.writes).toBe(0);
    expect(storage.removes).toBe(0);
    expect(storage.getItem(key)).toBe(JSON.stringify({ v: 1, profileId: id }));
  });

  it('[EP00-TBR-005-CA6] signIn emits the configured error, no data, and writes nothing', async () => {
    const id = await idOf('Sistemas');
    const storage = new MemoryStorage();
    const failure = unavailable();
    const { identity } = configure(storage, [{ provide: IN_MEMORY_FAILURE, useValue: failure }]);

    const result = await outcome(identity.signIn({ kind: 'demo', profileId: id }));

    expect(result.error).toBe(failure);
    expect(result.values).toEqual([]);
    expect(storage.writes).toBe(0);
    expect(storage.length).toBe(0);
  });

  it('[EP00-TBR-005-CA6] through the store: UNAVAILABLE, no session and nothing stored', async () => {
    const id = await idOf('Sistemas');
    const storage = new MemoryStorage();
    const { store } = configure(storage, [{ provide: IN_MEMORY_FAILURE, useValue: unavailable() }]);

    const result = await outcome(store.signIn({ kind: 'demo', profileId: id }));

    expect(isApiError(result.error)).toBe(true);
    expect((result.error as ApiError).code).toBe('UNAVAILABLE');
    expect(store.session()).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('[EP00-TBR-005-CA6] when the screen catalog fails during sign-in, no session is left in the storage either (no partial session)', async () => {
    const id = await idOf('Sistemas');
    const storage = new MemoryStorage();
    const failingCatalog: Provider = {
      provide: ScreenCatalogPort,
      useValue: { screens: (): Observable<readonly Screen[]> => throwError(() => unavailable()) },
    };
    const { store } = configure(storage, [failingCatalog]);

    const result = await outcome(store.signIn({ kind: 'demo', profileId: id }));

    expect((result.error as ApiError).code).toBe('UNAVAILABLE');
    expect(store.session()).toBeNull();
    expect(storage.length).toBe(0);
    // A reload must not bring back a session the person never got.
    const reload = configure(storage);
    expect(await firstValueFrom(reload.identity.restore())).toBeNull();
  });
});

// ---------- CA4: sessionStorage ----------

describe('[EP00-TBR-005-CA4] demo session in sessionStorage (only {v, profileId})', () => {
  it('[EP00-TBR-005-CA4] with nothing stored, restore gives no session', async () => {
    const { identity } = configure(new MemoryStorage());

    expect(await firstValueFrom(identity.restore())).toBeNull();
  });

  it('[EP00-TBR-005-CA4] a successful sign-in stores exactly {"v":1,"profileId":…} under one key, never permissions', async () => {
    const id = await idOf('Sistemas');
    const storage = new MemoryStorage();
    const { identity } = configure(storage);

    await firstValueFrom(identity.signIn({ kind: 'demo', profileId: id }));

    const entries = storage.entries();
    expect(entries).toHaveLength(1);
    const value: unknown = JSON.parse(entries[0][1]);
    expect(value).toEqual({ v: 1, profileId: id });
    expect(entries[0][1]).not.toMatch(/sample\.|view|capture|approve|grants|permissions/);
  });

  it('[EP00-TBR-005-CA4] after a reload (new injector, same storage) restore brings back the same profile', async () => {
    const id = await idOf('Perfil de demostración 4');
    const storage = new MemoryStorage();
    const expected = await rawGrantOf(id);
    await firstValueFrom(configure(storage).identity.signIn({ kind: 'demo', profileId: id }));

    const { store } = configure(storage);
    await firstValueFrom(store.restore());

    expect(store.session()?.profile.id).toBe(id);
    expect(store.status()).toBe('signed-in');
    const restored = await firstValueFrom(configure(storage).identity.restore());
    expect(restored).toEqual(expected);
  });

  it('[EP00-TBR-005-CA4] a profile switch stores the new profile id', async () => {
    const first = await idOf('Perfil de demostración 2');
    const second = await idOf('Perfil de demostración 5');
    const storage = new MemoryStorage();
    const { store } = configure(storage);
    await firstValueFrom(store.signIn({ kind: 'demo', profileId: first }));

    await firstValueFrom(store.switchProfile(second));

    expect(storage.entries().map(([, v]) => JSON.parse(v))).toEqual([{ v: 1, profileId: second }]);
  });

  it('[EP00-TBR-005-CA4] signOut erases the stored session', async () => {
    const id = await idOf('Sistemas');
    const storage = new MemoryStorage();
    const { store } = configure(storage);
    await firstValueFrom(store.signIn({ kind: 'demo', profileId: id }));

    await outcome(store.signOut());

    expect(storage.length).toBe(0);
    expect(await firstValueFrom(configure(storage).identity.restore())).toBeNull();
  });

  it('[EP00-TBR-005-CA4] signing in with an unknown profile is VALIDATION (field profileId) and stores nothing', async () => {
    const storage = new MemoryStorage();
    const { identity } = configure(storage);

    const result = await outcome(identity.signIn({ kind: 'demo', profileId: 'profile-test-missing' }));

    expect(isApiError(result.error)).toBe(true);
    expect((result.error as ApiError).code).toBe('VALIDATION');
    expect((result.error as ApiError).field).toBe('profileId');
    expect(storage.length).toBe(0);
  });

  const INVALID: [string, (id: string) => string][] = [
    ['unreadable text', () => 'not-json{'],
    ['another version', (id) => JSON.stringify({ v: 2, profileId: id })],
    ['no version', (id) => JSON.stringify({ profileId: id })],
    ['an unknown profile', () => JSON.stringify({ v: 1, profileId: 'profile-test-missing' })],
    ['no profile id', () => JSON.stringify({ v: 1 })],
    ['a profile id that is not text', () => JSON.stringify({ v: 1, profileId: 42 })],
    ['JSON null', () => 'null'],
    ['a JSON array', (id) => JSON.stringify([1, id])],
  ];
  for (const [label, value] of INVALID) {
    it(`[EP00-TBR-005-CA4] a stored value with ${label} is erased and there is no session`, async () => {
      const key = await storageKey();
      const id = await idOf('Sistemas');
      const storage = new MemoryStorage();
      storage.seed(key, value(id));
      const { identity } = configure(storage);

      const restored = await firstValueFrom(identity.restore());

      expect(restored).toBeNull();
      expect(storage.getItem(key)).toBeNull();
    });
  }

  it('[EP00-TBR-005-CA4] permissions written into the storage are ignored: restore recomputes them from the demo data', async () => {
    const key = await storageKey();
    const id = await idOf('Perfil de demostración 8');
    const expected = await rawGrantOf(id);
    const screens = await activeScreens();
    const storage = new MemoryStorage();
    storage.seed(
      key,
      JSON.stringify({
        v: 1,
        profileId: id,
        grants: screens.map((s) => ({ screen: s.code, actions: ['view', 'capture', 'approve'] })),
        permissions: screens.map((s) => s.code),
      }),
    );
    const { identity } = configure(storage);

    const restored = await firstValueFrom(identity.restore());

    expect(restored).toEqual(expected);
  });
});
