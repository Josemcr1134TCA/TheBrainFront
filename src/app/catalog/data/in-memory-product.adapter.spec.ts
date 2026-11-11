// Contract tests of the catalog port in memory mode (design EP00-TBR-003 §3.2–3.5, §6, §8.5 and §8.6).
// [EP00-TBR-003-CA1] The demo products come from typed synthetic fixtures, without any network call.
// [EP00-TBR-003-CA2] With IN_MEMORY_FAILURE the port emits that typed error (code, message, field) and no data;
//                    invalid requests emit VALIDATION (field pageSize) or INVALID_CURSOR (field cursor).
// [EP00-TBR-003-CA3] Cursor pagination: every page but the last brings nextCursor; the last one brings null, also on
//                    the exact edge (total multiple of pageSize). Order by internal code, ascending and ordinal (C3).
// Black box: written before the code (T1), only through ProductPort. Synthetic data only (no real GUNA data).
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable } from 'rxjs';
import { ApiError, ApiErrorCode, isApiError } from '../../core/data/api-error';
import { provideDataMode } from '../../core/data/data-mode';
import { IN_MEMORY_FAILURE } from '../../core/data/in-memory-failure';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page, PageRequest } from '../../core/data/page';
import { Product } from '../model/product';
import { provideCatalogData } from './catalog-data.providers';
import { InMemoryProductAdapter } from './in-memory-product.adapter';
import { ProductDto } from './product.dto';
import { ProductPort } from './product.port';
import { PRODUCT_SEED, PRODUCTS_FIXTURE } from './products.fixture';

// ---------- synthetic data ----------

// EAN-13 with a correct check digit, built from 12 digits.
function ean13(first12: string): string {
  const sum = [...first12].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return first12 + String((10 - (sum % 10)) % 10);
}

function isValidEan13(ean: string): boolean {
  return /^\d{13}$/.test(ean) && ean13(ean.slice(0, 12)) === ean;
}

function dto(n: number, overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    code: `TST${String(n).padStart(4, '0')}`,
    name: `Producto de prueba ${n}`,
    brand: 'Marca de prueba',
    ean: ean13(`20${String(n).padStart(10, '0')}`),
    presentation: 'Caja con 10 piezas',
    classification: {
      department: n % 2 === 0 ? 'Departamento de prueba A' : 'Departamento de prueba B',
      subDepartment: 'Sub departamento de prueba',
      category: 'Categoría de prueba',
      subCategory: 'Sub categoría de prueba',
    },
    supplier: { id: 'supplier-test-a', name: 'Proveedor de prueba A' },
    ...overrides,
  };
}

// Deterministic shuffle (fixed seed), so the port has to sort.
function scramble<T>(list: readonly T[]): T[] {
  const out = [...list];
  let s = 42;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function seedOf(size: number): ProductDto[] {
  return scramble(Array.from({ length: size }, (_, i) => dto(i + 1)));
}

const byCode = (list: readonly { code: string }[]) => [...list].map((p) => p.code).sort();

const base64url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ---------- harness ----------

function setup(options: { seed?: readonly ProductDto[]; failure?: ApiError } = {}): ProductPort {
  TestBed.configureTestingModule({
    providers: [
      provideDataMode('memory'),
      provideCatalogData(),
      ...(options.seed ? [{ provide: PRODUCT_SEED, useValue: options.seed }] : []),
      ...(options.failure ? [{ provide: IN_MEMORY_FAILURE, useValue: options.failure }] : []),
    ],
  });
  return TestBed.inject(ProductPort);
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

function request(cursor: string | null, pageSize?: number): PageRequest {
  return pageSize === undefined ? { cursor } : { cursor, pageSize };
}

// Walks the whole list following nextCursor (bounded, so a cursor that never ends fails the test).
async function allPages(port: ProductPort, pageSize?: number): Promise<Page<Product>[]> {
  const pages: Page<Product>[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const page: Page<Product> = await firstValueFrom(port.list(request(cursor, pageSize)));
    pages.push(page);
    if (page.nextCursor === null) return pages;
    cursor = page.nextCursor;
  }
  throw new Error('la paginación no termina');
}

async function expectApiError(source: Observable<unknown>, code: ApiErrorCode, field: string | null): Promise<ApiError> {
  const result = await outcome(source);
  expect(result.values, 'no debe entregar datos junto con el error').toEqual([]);
  expect(isApiError(result.error), `se esperaba un ApiError y llegó: ${String(result.error)}`).toBe(true);
  const error = result.error as ApiError;
  expect(error.code).toBe(code);
  expect(error.field).toBe(field);
  expect(typeof error.message).toBe('string');
  expect(error.message.trim()).not.toBe('');
  return error;
}

// ---------- CA1: demo products, no network ----------

describe('[EP00-TBR-003-CA1] in-memory catalog: demo products', () => {
  it('[EP00-TBR-003-CA1] ProductPort is the in-memory adapter in memory mode', () => {
    expect(setup()).toBeInstanceOf(InMemoryProductAdapter);
  });

  it('[EP00-TBR-003-CA1] the default seed is the typed demo fixture', () => {
    setup();
    expect(TestBed.inject(PRODUCT_SEED)).toBe(PRODUCTS_FIXTURE);
  });

  it('[EP00-TBR-003-CA1] lists the demo products without any network call', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sin red')) : null;
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const port = setup();

    const pages = await allPages(port);

    expect(pages.flatMap((p) => p.items).length).toBe(PRODUCTS_FIXTURE.length);
    TestBed.inject(HttpTestingController).verify();
    if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('[EP00-TBR-003-CA1] the demo fixture has 45 products with unique internal codes', () => {
    expect(PRODUCTS_FIXTURE.length).toBe(45);
    expect(new Set(PRODUCTS_FIXTURE.map((p) => p.code)).size).toBe(45);
    for (const p of PRODUCTS_FIXTURE) expect(p.code.trim()).not.toBe('');
  });

  it('[EP00-TBR-003-CA1] the demo fixture carries only master data (no costs, discounts, status or sku; flat classification)', () => {
    const keys = ['brand', 'classification', 'code', 'ean', 'name', 'presentation', 'supplier'];
    const classificationKeys = ['category', 'department', 'subCategory', 'subDepartment'];
    for (const p of PRODUCTS_FIXTURE) {
      expect(Object.keys(p).sort(), `campos de ${p.code}`).toEqual(keys);
      expect(Object.keys(p.classification).sort(), `clasificación de ${p.code}`).toEqual(classificationKeys);
      for (const level of Object.values(p.classification)) expect(typeof level).toBe('string');
      if (p.supplier !== null) {
        expect(Object.keys(p.supplier).sort()).toEqual(['id', 'name']);
        expect(p.supplier.id.trim()).not.toBe('');
      }
    }
  });

  it('[EP00-TBR-003-CA1] the demo fixture covers the expert edge cases: no supplier, repeated EAN, no EAN, two departments', () => {
    expect(PRODUCTS_FIXTURE.some((p) => p.supplier === null)).toBe(true);
    expect(PRODUCTS_FIXTURE.some((p) => p.ean === null)).toBe(true);
    const eans = PRODUCTS_FIXTURE.map((p) => p.ean).filter((e): e is string => e !== null);
    expect(new Set(eans).size, 'debe haber al menos un EAN repetido').toBeLessThan(eans.length);
    expect(new Set(PRODUCTS_FIXTURE.map((p) => p.classification.department)).size).toBeGreaterThanOrEqual(2);
  });

  it('[EP00-TBR-003-CA1] every demo EAN is synthetic: prefix 20 and a correct EAN-13 check digit', () => {
    for (const p of PRODUCTS_FIXTURE) {
      if (p.ean === null) continue;
      expect(p.ean.startsWith('20'), `EAN de ${p.code}`).toBe(true);
      expect(isValidEan13(p.ean), `dígito verificador del EAN de ${p.code}`).toBe(true);
    }
  });

  it('[EP00-TBR-003-CA1] a product without supplier is delivered with supplier null (no default supplier is invented)', async () => {
    const seed = [dto(1), dto(2, { supplier: null }), dto(3)];
    const page = await firstValueFrom(setup({ seed }).list());

    expect(page.items.find((p) => p.code === 'TST0002')?.supplier).toBeNull();
  });

  it('[EP00-TBR-003-CA1] delivers each product exactly as the master data (mapping keeps every field)', async () => {
    const seed = seedOf(5);
    const page = await firstValueFrom(setup({ seed }).list());

    expect(page.items).toEqual([...seed].sort((a, b) => (a.code < b.code ? -1 : 1)));
  });
});

// ---------- CA2: typed errors ----------

describe('[EP00-TBR-003-CA2] in-memory catalog: configured failure', () => {
  const CODES: ApiErrorCode[] = ['UNAVAILABLE', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'INVALID_CURSOR'];

  it('[EP00-TBR-003-CA2] with IN_MEMORY_FAILURE = UNAVAILABLE (field null) list() emits that typed error and no data', async () => {
    const failure = new ApiError({ code: 'UNAVAILABLE', message: 'El catálogo no está disponible (prueba).', field: null });
    const error = await expectApiError(setup({ failure }).list(), 'UNAVAILABLE', null);

    expect(error.message).toBe('El catálogo no está disponible (prueba).');
  });

  it.each(CODES)('[EP00-TBR-003-CA2] emits the configured %s error with its code, message and field', async (code) => {
    const failure = new ApiError({ code, message: `Fallo simulado ${code}.`, field: code === 'INVALID_CURSOR' ? 'cursor' : null });
    const error = await expectApiError(setup({ failure }).list({ cursor: null }), code, failure.field);

    expect(error.message).toBe(`Fallo simulado ${code}.`);
  });

  it('[EP00-TBR-003-CA2] keeps the correlationId of the configured error', async () => {
    const failure = new ApiError({ code: 'FORBIDDEN', message: 'Sin permiso (prueba).', field: null, correlationId: 'corr-test-0001' });
    const error = await expectApiError(setup({ failure }).list(), 'FORBIDDEN', null);

    expect(error.correlationId).toBe('corr-test-0001');
  });

  it('[EP00-TBR-003-CA2] the configured failure wins over request validation', async () => {
    const failure = new ApiError({ code: 'UNAVAILABLE', message: 'Fallo simulado.', field: null });

    await expectApiError(setup({ failure }).list({ pageSize: 0, cursor: 'xyz' }), 'UNAVAILABLE', null);
  });

  it('[EP00-TBR-003-CA2] the configured failure applies to every call, not only the first one', async () => {
    const failure = new ApiError({ code: 'UNAVAILABLE', message: 'Fallo simulado.', field: null });
    const port = setup({ failure });

    await expectApiError(port.list(), 'UNAVAILABLE', null);
    await expectApiError(port.list(), 'UNAVAILABLE', null);
  });

  it('[EP00-TBR-003-CA2] without IN_MEMORY_FAILURE list() delivers data and completes', async () => {
    const result = await outcome(setup({ seed: seedOf(3) }).list());

    expect(result.error).toBeUndefined();
    expect(result.completed).toBe(true);
    expect(result.values.length).toBe(1);
  });
});

describe('[EP00-TBR-003-CA2] in-memory catalog: invalid requests', () => {
  it.each([0, -1, 2.5, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    '[EP00-TBR-003-CA2] pageSize %s emits VALIDATION with field pageSize',
    async (pageSize) => {
      await expectApiError(setup({ seed: seedOf(30) }).list({ pageSize }), 'VALIDATION', 'pageSize');
    },
  );

  const INVALID_CURSORS: [string, string][] = [
    ['plain text', 'xyz'],
    ['empty string', ''],
    ['base64url of garbage', base64url('esto no es un cursor')],
    ['base64url of JSON with an unknown version', base64url(JSON.stringify({ v: 999, version: 999, code: 'TST0001' }))],
    ['base64url of a JSON array', base64url('[1,2,3]')],
  ];
  it.each(INVALID_CURSORS)('[EP00-TBR-003-CA2] cursor (%s) emits INVALID_CURSOR with field cursor', async (_label, cursor) => {
    await expectApiError(setup({ seed: seedOf(30) }).list({ cursor }), 'INVALID_CURSOR', 'cursor');
  });
});

// ---------- CA3: cursor pagination ----------

describe('[EP00-TBR-003-CA3] in-memory catalog: cursor pagination', () => {
  it('[EP00-TBR-003-CA3] the contract defaults are 20 per page and 100 at most', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(20);
    expect(MAX_PAGE_SIZE).toBe(100);
  });

  it('[EP00-TBR-003-CA3] 41 products with pageSize 20: pages of 20, 20 and 1; cursor on the first two, null on the last', async () => {
    const seed = seedOf(41);
    const pages = await allPages(setup({ seed }), 20);

    expect(pages.map((p) => p.items.length)).toEqual([20, 20, 1]);
    expect(typeof pages[0].nextCursor).toBe('string');
    expect(typeof pages[1].nextCursor).toBe('string');
    expect(pages[0].nextCursor).not.toBe('');
    expect(pages[1].nextCursor).not.toBe('');
    expect(pages[2].nextCursor).toBeNull();
  });

  it('[EP00-TBR-003-CA3] following the cursors gives every product once, without repeats or gaps, in code order', async () => {
    const seed = seedOf(41);
    const codes = (await allPages(setup({ seed }), 20)).flatMap((p) => p.items.map((i) => i.code));

    expect(codes).toEqual(byCode(seed));
  });

  it('[EP00-TBR-003-CA3] the demo catalog (45) gives pages of 20, 20 and 5 with the default page size', async () => {
    const pages = await allPages(setup());

    expect(pages.map((p) => p.items.length)).toEqual([20, 20, 5]);
    expect(pages.map((p) => p.nextCursor === null)).toEqual([false, false, true]);
    expect(pages.flatMap((p) => p.items.map((i) => i.code))).toEqual(byCode(PRODUCTS_FIXTURE));
  });

  it('[EP00-TBR-003-CA3] exact edge: 40 products with pageSize 20 give two full pages, the second with nextCursor null and no empty third page', async () => {
    const pages = await allPages(setup({ seed: seedOf(40) }), 20);

    expect(pages.map((p) => p.items.length)).toEqual([20, 20]);
    expect(typeof pages[0].nextCursor).toBe('string');
    expect(pages[1].nextCursor).toBeNull();
  });

  it('[EP00-TBR-003-CA3] exactly one page: 20 products with pageSize 20 give one page with nextCursor null', async () => {
    const pages = await allPages(setup({ seed: seedOf(20) }), 20);

    expect(pages.map((p) => p.items.length)).toEqual([20]);
    expect(pages[0].nextCursor).toBeNull();
  });

  it('[EP00-TBR-003-CA3] empty catalog: { items: [], nextCursor: null }', async () => {
    const page = await firstValueFrom(setup({ seed: [] }).list());

    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it('[EP00-TBR-003-CA3] without a request, or with cursor null, the first page is delivered with 20 products', async () => {
    const port = setup({ seed: seedOf(30) });
    const noRequest = await firstValueFrom(port.list());
    const nullCursor = await firstValueFrom(port.list({ cursor: null }));

    expect(noRequest.items.length).toBe(20);
    expect(nullCursor).toEqual(noRequest);
    expect(noRequest.items.map((i) => i.code)).toEqual(byCode(seedOf(30)).slice(0, 20));
  });

  it('[EP00-TBR-003-CA3] page size on the edges is valid: 1 and 100', async () => {
    const port = setup({ seed: seedOf(150) });
    const one = await firstValueFrom(port.list({ pageSize: 1 }));
    const hundred = await allPages(port, 100);

    expect(one.items.length).toBe(1);
    expect(typeof one.nextCursor).toBe('string');
    expect(hundred.map((p) => p.items.length)).toEqual([100, 50]);
    expect(hundred[1].nextCursor).toBeNull();
  });

  it('[EP00-TBR-003-CA3] the same cursor gives the same page (deterministic)', async () => {
    const port = setup({ seed: seedOf(41) });
    const first = await firstValueFrom(port.list({ pageSize: 20 }));
    const again = await firstValueFrom(port.list({ cursor: first.nextCursor, pageSize: 20 }));
    const twice = await firstValueFrom(port.list({ cursor: first.nextCursor, pageSize: 20 }));

    expect(twice).toEqual(again);
  });

  it('[EP00-TBR-003-CA3] orders by internal code ascending with ordinal comparison, whatever the seed order', async () => {
    const codes = ['b01', 'TST9', 'A02', 'a03', 'TST10', 'B04'];
    const page = await firstValueFrom(setup({ seed: codes.map((code, i) => dto(i + 1, { code })) }).list());

    expect(page.items.map((p) => p.code)).toEqual(['A02', 'B04', 'TST10', 'TST9', 'a03', 'b01']);
  });

  it('[EP00-TBR-003-CA3] the demo fixture is not already in code order (the port sorts, not the data)', () => {
    expect(PRODUCTS_FIXTURE.map((p) => p.code)).not.toEqual(byCode(PRODUCTS_FIXTURE));
  });

  it('[EP00-TBR-003-CA3] repeated EAN does not identify the row: both products appear once, also across a page border', async () => {
    const shared = ean13('200000009999');
    const seed = scramble(Array.from({ length: 41 }, (_, i) => (i === 19 || i === 20 ? dto(i + 1, { ean: shared }) : dto(i + 1))));
    const items = (await allPages(setup({ seed }), 20)).flatMap((p) => p.items);

    expect(items.filter((p) => p.ean === shared).map((p) => p.code)).toEqual(['TST0020', 'TST0021']);
    expect(items.map((p) => p.code)).toEqual(byCode(seed));
  });

  it('[EP00-TBR-003-CA3] products without EAN are listed and paginated like the rest', async () => {
    const seed = scramble(Array.from({ length: 25 }, (_, i) => (i % 5 === 0 ? dto(i + 1, { ean: null }) : dto(i + 1))));
    const items = (await allPages(setup({ seed }), 20)).flatMap((p) => p.items);

    expect(items.map((p) => p.code)).toEqual(byCode(seed));
    expect(items.filter((p) => p.ean === null).length).toBe(5);
  });

  it('[EP00-TBR-003-CA3] items are read only: changing a delivered page does not change the next response', async () => {
    const seed = seedOf(30);
    const port = setup({ seed });
    const page = await firstValueFrom(port.list());
    const expected = structuredClone(page.items);

    expect(Object.isFrozen(page.items)).toBe(true);
    try {
      (page.items as Product[]).splice(0, 1);
    } catch {
      /* frozen: expected */
    }
    try {
      (page.items[0] as { name: string }).name = 'cambiado por la vista';
    } catch {
      /* frozen: expected */
    }

    const next = await firstValueFrom(port.list());
    expect(next.items).toEqual(expected);
  });
});
