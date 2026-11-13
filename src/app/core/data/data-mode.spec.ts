// [EP00-TBR-003-CA1] The adapter is chosen by configuration (design EP00-TBR-003 §3.3): DATA_MODE has no default value,
// provideDataMode(mode) sets it and providePort(port, adapters) resolves the port to the adapter of that mode, or fails
// at startup with a Spanish message («No hay adaptador de datos para el modo …»); it never falls back to another mode.
// [EP00-TBR-003-CA2] The in-memory failure switch never reaches the app (design §3.4, barrier c): with appConfig and the
// catalog routes, IN_MEMORY_FAILURE resolves to null.
// Black box: written before the code (T1). Synthetic data only.
import { createEnvironmentInjector, EnvironmentInjector, Injectable, Provider, EnvironmentProviders } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Routes } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { appConfig } from '../../app.config';
import { routes as appRoutes } from '../../app.routes';
import { provideCatalogData } from '../../catalog/data/catalog-data.providers';
import { InMemoryProductAdapter } from '../../catalog/data/in-memory-product.adapter';
import { ProductPort } from '../../catalog/data/product.port';
import { DATA_MODE, DataMode, provideDataMode, providePort } from './data-mode';
import { IN_MEMORY_FAILURE } from './in-memory-failure';

const NO_ADAPTER = /No hay adaptador de datos para el modo/;
// Path of the catalog screen, approved with the UI (question 13/14: /catalogo).
const CATALOG_PATH = 'catalogo';

// A synthetic port with two adapters, to test the switch without the catalog.
abstract class GreetingPort {
  abstract hello(): string;
}

@Injectable()
class MemoryGreetingAdapter extends GreetingPort {
  hello(): string {
    return 'memoria';
  }
}

describe('[EP00-TBR-003-CA1] data mode switch (DATA_MODE, provideDataMode, providePort)', () => {
  it('[EP00-TBR-003-CA1] DATA_MODE has no default value', () => {
    TestBed.configureTestingModule({});

    expect(TestBed.inject(DATA_MODE, null)).toBeNull();
  });

  it('[EP00-TBR-003-CA1] provideDataMode sets DATA_MODE', () => {
    TestBed.configureTestingModule({ providers: [provideDataMode('memory')] });

    expect(TestBed.inject(DATA_MODE)).toBe('memory');
  });

  it('[EP00-TBR-003-CA1] providePort resolves the port to the adapter of the configured mode', () => {
    TestBed.configureTestingModule({
      providers: [provideDataMode('memory'), providePort(GreetingPort, { memory: MemoryGreetingAdapter })],
    });

    const port = TestBed.inject(GreetingPort);

    expect(port).toBeInstanceOf(MemoryGreetingAdapter);
    expect(port.hello()).toBe('memoria');
  });

  it('[EP00-TBR-003-CA1] without DATA_MODE the port fails with a Spanish message', () => {
    TestBed.configureTestingModule({ providers: [providePort(GreetingPort, { memory: MemoryGreetingAdapter })] });

    expect(() => TestBed.inject(GreetingPort)).toThrow(NO_ADAPTER);
  });

  it('[EP00-TBR-003-CA1] a mode without an adapter fails with a Spanish message and never falls back to another mode', () => {
    TestBed.configureTestingModule({
      providers: [provideDataMode('remote' as unknown as DataMode), providePort(GreetingPort, { memory: MemoryGreetingAdapter })],
    });

    expect(() => TestBed.inject(GreetingPort)).toThrow(NO_ADAPTER);
  });
});

describe('[EP00-TBR-003-CA1] catalog data wiring', () => {
  it('[EP00-TBR-003-CA1] in memory mode, ProductPort is the in-memory adapter', () => {
    TestBed.configureTestingModule({ providers: [provideDataMode('memory'), provideCatalogData()] });

    expect(TestBed.inject(ProductPort)).toBeInstanceOf(InMemoryProductAdapter);
  });

  it('[EP00-TBR-003-CA1] without a data mode, ProductPort fails with a Spanish message', () => {
    TestBed.configureTestingModule({ providers: [provideCatalogData()] });

    expect(() => TestBed.inject(ProductPort)).toThrow(NO_ADAPTER);
  });
});

// Providers of a route tree (route.providers of each route and its children).
function collectProviders(routes: Routes): (Provider | EnvironmentProviders)[] {
  return routes.flatMap((r: Route) => [...(r.providers ?? []), ...collectProviders(r.children ?? [])]);
}

// Path from the root of a route tree to the route with `path`, at any depth (EP00-TBR-005 nests the protected routes
// under a session-guarded parent, CA4/CA5); [] when it is not there.
function findRoutePath(routes: Routes, path: string): Route[] {
  for (const r of routes) {
    if (r.path === path) return [r];
    const below = findRoutePath(r.children ?? [], path);
    if (below.length > 0) return [r, ...below];
  }
  return [];
}

// The catalog routes as the app registers them in app.routes.ts (loadChildren, DEC-0014) or as inline children,
// together with their ancestors in the tree (whose providers the route would also see).
async function catalogRoutes(): Promise<Routes> {
  const chain = findRoutePath(appRoutes, CATALOG_PATH);
  const route = chain.at(-1);
  expect(route, `falta la ruta '${CATALOG_PATH}' en app.routes.ts`).toBeTruthy();
  const ancestors = chain.slice(0, -1).map((r) => ({ ...r, children: [] }));
  if (route?.loadChildren) {
    const loaded: unknown = await route.loadChildren();
    const children = (Array.isArray(loaded) ? loaded : (loaded as { default?: Routes }).default) as Routes | undefined;
    expect(Array.isArray(children), 'loadChildren de catalogo debe entregar sus rutas').toBe(true);
    return [...ancestors, route, ...(children ?? [])];
  }
  return [...ancestors, route as Route];
}

describe('[EP00-TBR-003-CA1][EP00-TBR-003-CA2] the real app configuration (appConfig and the catalog routes)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });
  });

  it('[EP00-TBR-003-CA1] appConfig starts the app in memory mode', () => {
    expect(TestBed.inject(DATA_MODE)).toBe('memory');
  });

  it('[EP00-TBR-003-CA1][EP00-TBR-005-CA4][EP00-TBR-005-CA5] the catalog route (inside the protected tree) resolves ProductPort to the in-memory adapter and lists the demo products', async () => {
    const injector = createEnvironmentInjector(collectProviders(await catalogRoutes()), TestBed.inject(EnvironmentInjector));

    const port = injector.get(ProductPort);
    expect(port).toBeInstanceOf(InMemoryProductAdapter);
    const page = await firstValueFrom(port.list());
    expect(page.items.length).toBeGreaterThan(0);
    injector.destroy();
  });

  it('[EP00-TBR-003-CA2] IN_MEMORY_FAILURE resolves to null with appConfig (nobody provides it in app code)', () => {
    expect(TestBed.inject(IN_MEMORY_FAILURE, null)).toBeNull();
  });

  it('[EP00-TBR-003-CA2][EP00-TBR-005-CA4][EP00-TBR-005-CA5] IN_MEMORY_FAILURE resolves to null inside the catalog route providers (inside the protected tree)', async () => {
    const injector = createEnvironmentInjector(collectProviders(await catalogRoutes()), TestBed.inject(EnvironmentInjector));

    expect(injector.get(IN_MEMORY_FAILURE, null)).toBeNull();
    injector.destroy();
  });

  it('[EP00-TBR-003-CA2] IN_MEMORY_FAILURE has no default value', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(IN_MEMORY_FAILURE, null)).toBeNull();
  });
});
