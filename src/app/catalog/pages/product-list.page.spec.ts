// Black-box tests of the catalog screen (task T5), written before the screen exists (T6).
// Sources: story EP00-TBR-003 v3, design docs/diseno/EP00-TBR-003.md §8.6, approved UI docs/ui/EP00-TBR-003/
// (index.html + propuesta.md §1, §2, §3, §6 and §7; approved by Mariana, delegated by the PO, on 2026-11-11).
// [EP00-TBR-003-CA1] (b) In memory mode the screen, mounted by the real route, shows the first page of 20 demo products
//                    without any network call (HttpTestingController.verify() and spies on fetch and XHR).
// [EP00-TBR-003-CA2] (b) One state per ApiError code, with IN_MEMORY_FAILURE: fixed title and phrase per code; the
//                    service message only when field is null; «Referencia: <correlationId>» only when it comes; codes
//                    are never shown; any error that is not an ApiError is treated as UNAVAILABLE.
// [EP00-TBR-003-CA3] Cursor pagination on screen (PZ-23): «Página n · N productos», «Siguiente», «Anterior», «Primera
//                    página»; the view keeps the cursor stack; rows in the order the port gives, never re-sorted.
// Contract assumed for T6 (names): class ProductListPage, standalone, in ./product-list.page.ts; it injects ProductPort;
// it uses tb-data-table (searchable=false, title «Productos») and tb-cursor-pager projected with [tbFooter]; the route
// '' of catalog/index.ts adds loadComponent to it. Synthetic data only (no real GUNA data).
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom, Observable, of, Subject, throwError } from 'rxjs';
import { appConfig } from '../../app.config';
import { AccessStore } from '../../core/data/access.store';
import { ApiError, ApiErrorCode } from '../../core/data/api-error';
import { provideDataMode } from '../../core/data/data-mode';
import { IN_MEMORY_FAILURE } from '../../core/data/in-memory-failure';
import { Page, PageRequest } from '../../core/data/page';
import { provideCatalogData } from '../data/catalog-data.providers';
import { ProductDto } from '../data/product.dto';
import { ProductPort } from '../data/product.port';
import { PRODUCT_SEED, PRODUCTS_FIXTURE } from '../data/products.fixture';
import { Product } from '../model/product';
import { ProductListPage } from './product-list.page';

// ---------- approved texts (docs/ui/EP00-TBR-003/index.html and propuesta.md §3 and §6) ----------

const COLUMN_HEADERS = [
  'Código',
  'Nombre',
  'EAN',
  'Marca',
  'Proveedor',
  'Presentación',
  'Departamento',
  'Sub departamento',
  'Categoría',
  'Sub categoría',
];
const DASH = '—';
const NEXT = 'Siguiente';
const PREVIOUS = 'Anterior';
const FIRST = 'Primera página';
const RETRY = 'Reintentar';
const GO_FIRST = 'Ir a la primera página';
const NO_MORE = 'No hay más productos';
const LOADING_LABEL = 'Cargando productos';
const EMPTY_HEADING = 'Aún no hay productos en el catálogo';
const EMPTY_MESSAGE = 'Cuando haya productos registrados, aparecerán aquí.';
const RETRY_PHRASE = 'Reintenta; si sigue igual, avisa al equipo técnico.';

interface CodeState {
  heading: string;
  phrase: string;
  role: 'alert' | 'status';
  /** Buttons of the state, in order, with their look. */
  actions: { label: string; look: 'primary' | 'ghost' }[];
  /** Field of the synthetic error: null means the service message is shown. */
  field: string | null;
  /** Service message of the synthetic error (as in the prototype when it is shown). */
  message: string;
}

const BY_CODE: Record<ApiErrorCode, CodeState> = {
  UNAVAILABLE: {
    heading: 'No pudimos cargar el catálogo',
    phrase: RETRY_PHRASE,
    role: 'alert',
    actions: [{ label: RETRY, look: 'primary' }],
    field: null,
    message: 'El servicio no está disponible por ahora.',
  },
  VALIDATION: {
    heading: 'No pudimos pedir esa página',
    phrase: RETRY_PHRASE,
    role: 'alert',
    actions: [
      { label: RETRY, look: 'primary' },
      { label: GO_FIRST, look: 'ghost' },
    ],
    field: 'pageSize',
    message: 'El tamaño de página debe ser un entero entre 1 y 100.',
  },
  NOT_FOUND: {
    heading: 'No encontramos el catálogo',
    phrase: 'Vuelve a abrirlo desde el menú.',
    role: 'alert',
    actions: [],
    field: null,
    message: 'No existe el recurso pedido.',
  },
  INVALID_CURSOR: {
    heading: 'Esa página ya no está disponible',
    phrase: 'Vuelve a la primera página.',
    role: 'alert',
    actions: [{ label: GO_FIRST, look: 'primary' }],
    field: 'cursor',
    message: 'El cursor de paginación no es válido.',
  },
  FORBIDDEN: {
    heading: 'Tu perfil no puede ver el catálogo',
    phrase: 'Pide acceso a quien administra tu perfil.',
    role: 'status',
    actions: [],
    field: null,
    message: 'No tienes permiso para esta consulta.',
  },
};
const CODES = Object.keys(BY_CODE) as ApiErrorCode[];
const CODE_WORDS = /\b(UNAVAILABLE|FORBIDDEN|NOT_FOUND|VALIDATION|INVALID_CURSOR)\b/;

const failureOf = (code: ApiErrorCode, correlationId?: string) =>
  new ApiError({
    code,
    message: BY_CODE[code].message,
    field: BY_CODE[code].field,
    ...(correlationId === undefined ? {} : { correlationId }),
  });

// ---------- synthetic data ----------

function product(n: number, overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    code: `SYN${String(n).padStart(4, '0')}`,
    name: `Producto sintético ${n}`,
    brand: 'Marca sintética A',
    ean: `2900000${String(n).padStart(6, '0')}`,
    presentation: 'Caja 12 pzas',
    classification: {
      department: 'Departamento sintético',
      subDepartment: 'Sub departamento sintético',
      category: 'Categoría sintética',
      subCategory: 'Sub categoría sintética',
    },
    supplier: { id: 'supplier-syn-a', name: 'Proveedor sintético A' },
    ...overrides,
  };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => product(from + i));

// Three pages behind opaque cursors (20, 20 and 5), as in the approved flow.
const CURSOR_2 = 'opaque-cursor-for-page-2';
const CURSOR_3 = 'opaque-cursor-for-page-3';
const PAGE_1: Page<Product> = { items: range(1, 20), nextCursor: CURSOR_2 };
const PAGE_2: Page<Product> = { items: range(21, 40), nextCursor: CURSOR_3 };
const PAGE_3: Page<Product> = { items: range(41, 45), nextCursor: null };
const codesOf = (page: Page<Product>) => page.items.map((p) => p.code);

function threePages(request: PageRequest): Observable<Page<Product>> {
  const cursor = request.cursor ?? null;
  if (cursor === null) return of(PAGE_1);
  if (cursor === CURSOR_2) return of(PAGE_2);
  if (cursor === CURSOR_3) return of(PAGE_3);
  return throwError(() => failureOf('INVALID_CURSOR'));
}

// A port scripted by the test; it records every request (the screen only knows ProductPort).
class ScriptedProductPort extends ProductPort {
  readonly requests: PageRequest[] = [];

  constructor(private readonly reply: (request: PageRequest, call: number) => Observable<Page<Product>>) {
    super();
  }

  list(request: PageRequest = {}): Observable<Page<Product>> {
    this.requests.push(request);
    return this.reply(request, this.requests.length);
  }
}

const cursorOf = (request: PageRequest | undefined) => request?.cursor ?? null;

// ---------- harness ----------

interface MountOptions {
  seed?: readonly ProductDto[];
  failure?: unknown;
  port?: ProductPort;
}

function mount(options: MountOptions = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideDataMode('memory'),
      provideCatalogData(),
      ...(options.seed ? [{ provide: PRODUCT_SEED, useValue: options.seed }] : []),
      ...(options.failure !== undefined ? [{ provide: IN_MEMORY_FAILURE, useValue: options.failure }] : []),
      ...(options.port ? [{ provide: ProductPort, useValue: options.port }] : []),
    ],
  });
  const fixture = TestBed.createComponent(ProductListPage);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: ComponentFixture<unknown>) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function open(options: MountOptions = {}) {
  const screen = mount(options);
  await settle(screen.fixture);
  return screen;
}

async function press(fixture: ComponentFixture<unknown>, button: HTMLButtonElement | undefined) {
  expect(button, 'el botón debe existir').toBeTruthy();
  button!.click();
  await settle(fixture);
}

// ---------- queries ----------

const flat = (node: Element | null | undefined) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

// Text a sighted person reads: without the screen-reader-only spans.
function visible(node: Element): string {
  const copy = node.cloneNode(true) as Element;
  copy.querySelectorAll('.tb-sr, .sr-only').forEach((n) => n.remove());
  return flat(copy);
}

const headers = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>('[role="columnheader"]')).map((h) => visible(h));
const rows = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>('[role="row"]')).filter((r) => r.querySelector('[role="cell"]'));
const cells = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>('[role="cell"]'));
const rowTexts = (row: HTMLElement) => cells(row).map((c) => visible(c));
const shownCodes = (el: HTMLElement) => rows(el).map((r) => visible(cells(r)[0]));
const rowOf = (el: HTMLElement, code: string) => rows(el).find((r) => visible(cells(r)[0]) === code);

const pager = (el: HTMLElement) => el.querySelector<HTMLElement>('tb-cursor-pager');
const stateBox = (el: HTMLElement) => el.querySelector<HTMLElement>('tb-empty-state');
const skeleton = (el: HTMLElement) => el.querySelector<HTMLElement>('tb-skeleton');
const roleOf = (host: HTMLElement) =>
  host.getAttribute('role') ?? host.querySelector('[role]')?.getAttribute('role') ?? null;

const buttons = (root: Element | null) => (root ? Array.from(root.querySelectorAll('button')) : []);
const labels = (root: Element | null) => buttons(root).map((b) => flat(b));
const button = (root: Element | null, label: string) => buttons(root).find((b) => flat(b) === label);
const pagerButton = (el: HTMLElement, label: string) => button(pager(el), label);
const lookOf = (b: HTMLElement | undefined) =>
  b?.classList.contains('primary') ? 'primary' : b?.classList.contains('ghost') ? 'ghost' : 'default';

function expectFrame(el: HTMLElement) {
  expect(flat(el.querySelector('h1'))).toBe('Catálogo');
  expect(Array.from(el.querySelectorAll('h2')).map((h) => flat(h))).toContain('Productos');
}

function expectPage(el: HTMLElement, n: number, count: number) {
  expect(pager(el), 'debe haber paginador').not.toBeNull();
  expect(flat(pager(el))).toContain(`Página ${n} · ${count} productos`);
}

function expectNoList(el: HTMLElement) {
  expect(rows(el)).toHaveLength(0);
  expect(pager(el)).toBeNull();
  expect(flat(el)).not.toMatch(/Página \d/);
}

// ---------- CA1b: the screen in memory mode, by the real route, without network ----------

describe('[EP00-TBR-003-CA1] catalog screen in memory mode (route /catalogo)', () => {
  afterEach(() => vi.restoreAllMocks());

  // Since EP00-TBR-005 /catalogo needs a session (CA4) and view on its sample screen (CA5): the arrangement enters with a
  // demonstration profile that has it («Sistemas», demo-1) and signs out at the end so nothing stays in sessionStorage.
  it('[EP00-TBR-003-CA1][EP00-TBR-005-CA4][EP00-TBR-005-CA5] navigating to /catalogo (signed in with a demo profile with view) renders ProductListPage with the first 20 demo products and no network call', async () => {
    const fetchSpy =
      typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sin red')) : null;
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClient(), provideHttpClientTesting()],
    });

    const harness = await RouterTestingHarness.create();
    const access = TestBed.inject(AccessStore);
    await firstValueFrom(access.signIn({ kind: 'demo', profileId: 'demo-1' }));
    onTestFinished(() => firstValueFrom(access.signOut(), { defaultValue: undefined }).then(() => undefined));
    const page = await harness.navigateByUrl('/catalogo', ProductListPage);
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;

    expect(page).toBeInstanceOf(ProductListPage);
    expectFrame(el);
    expect(headers(el)).toEqual(COLUMN_HEADERS);
    const firstTwenty = [...PRODUCTS_FIXTURE.map((p) => p.code)].sort().slice(0, 20);
    expect(shownCodes(el)).toEqual(firstTwenty);
    expectPage(el, 1, 20);
    TestBed.inject(HttpTestingController).verify();
    if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it('[EP00-TBR-003-CA1] the screen asks the port for the first page: no cursor and the contract page size (20)', async () => {
    const port = new ScriptedProductPort(threePages);
    await open({ port });

    expect(port.requests).toHaveLength(1);
    expect(cursorOf(port.requests[0])).toBeNull();
    expect([undefined, 20]).toContain(port.requests[0].pageSize);
  });

  it('[EP00-TBR-003-CA1] shows the page «Catálogo» with the card «Productos», ten columns in the approved order', async () => {
    const { el } = await open();

    expectFrame(el);
    expect(headers(el)).toEqual(COLUMN_HEADERS);
    expect(rows(el)).toHaveLength(20);
    for (const row of rows(el)) expect(cells(row)).toHaveLength(10);
  });

  it('[EP00-TBR-003-CA1] each row shows the master data of the product, the EAN as plain text (not a formatted number)', async () => {
    const seed = [
      product(1, {
        code: 'SYN0001',
        name: 'Galleta sintética',
        ean: '2000000000015',
        brand: 'Marca sintética B',
        supplier: { id: 'supplier-syn-b', name: 'Proveedor sintético B' },
        presentation: 'Bolsa 500 g',
        classification: {
          department: 'Botanas',
          subDepartment: 'Horneado',
          category: 'Galletas',
          subCategory: 'Dulces',
        },
      }),
    ];
    const { el } = await open({ seed });

    expect(rowTexts(rows(el)[0])).toEqual([
      'SYN0001',
      'Galleta sintética',
      '2000000000015',
      'Marca sintética B',
      'Proveedor sintético B',
      'Bolsa 500 g',
      'Botanas',
      'Horneado',
      'Galletas',
      'Dulces',
    ]);
  });

  it('[EP00-TBR-003-CA1] a product without supplier and without EAN shows «—» in those cells (nothing is invented)', async () => {
    const seed = [product(1), product(2, { supplier: null, ean: null }), product(3)];
    const { el } = await open({ seed });
    const texts = rowTexts(rowOf(el, 'SYN0002')!);

    expect(texts[2]).toBe(DASH);
    expect(texts[4]).toBe(DASH);
    expect(flat(rowOf(el, 'SYN0002'))).not.toMatch(/Proveedor sintético/);
  });

  it('[EP00-TBR-003-CA1] the «—» cells carry the screen-reader text «Sin proveedor» and «Sin EAN» (approved UI)', async () => {
    const seed = [product(1, { supplier: null, ean: null })];
    const { el } = await open({ seed });
    const row = rows(el)[0];

    expect(flat(cells(row)[4])).toContain('Sin proveedor');
    expect(flat(cells(row)[2])).toContain('Sin EAN');
  });

  it('[EP00-TBR-003-CA1] a repeated EAN does not identify the row: both products are listed with their own code', async () => {
    const shared = '2000000000127';
    const seed = [product(1), product(2, { ean: shared }), product(3, { ean: shared }), product(4)];
    const { el } = await open({ seed });

    expect(shownCodes(el)).toEqual(['SYN0001', 'SYN0002', 'SYN0003', 'SYN0004']);
    expect(rows(el).filter((r) => rowTexts(r)[2] === shared)).toHaveLength(2);
  });

  it('[EP00-TBR-003-CA1] uses the design system pieces: tb-data-table without search box or sorting, tb-cursor-pager in its footer', async () => {
    const { el } = await open();

    expect(el.querySelector('tb-data-table')).not.toBeNull();
    expect(pager(el)!.closest('tb-data-table')).not.toBeNull();
    expect(pager(el)!.closest('footer')).not.toBeNull();
    expect(el.querySelectorAll('input, select, textarea')).toHaveLength(0);
    expect(el.querySelector('.tb-filterbar, .tb-find')).toBeNull();
    expect(el.querySelectorAll('[role="columnheader"] button, [aria-sort]')).toHaveLength(0);
    expect(el.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});

// ---------- CA3: cursor pagination on screen ----------

describe('[EP00-TBR-003-CA3] catalog screen: cursor pagination (PZ-23)', () => {
  it('[EP00-TBR-003-CA3] page 1 reads «Página 1 · 20 productos» and offers only «Siguiente», enabled', async () => {
    const { el } = await open();

    expectPage(el, 1, 20);
    expect(labels(pager(el))).toEqual([NEXT]);
    expect(pagerButton(el, NEXT)!.disabled).toBe(false);
  });

  it('[EP00-TBR-003-CA3] demo catalog: «Siguiente» to page 2 and 3, then «Anterior» back to 2 and 1 with the same products', async () => {
    const { fixture, el } = await open();
    const page1 = shownCodes(el);

    await press(fixture, pagerButton(el, NEXT));
    expectPage(el, 2, 20);
    expect(labels(pager(el))).toEqual([FIRST, PREVIOUS, NEXT]);
    const page2 = shownCodes(el);
    expect(page2).toHaveLength(20);
    expect(page2.some((c) => page1.includes(c))).toBe(false);

    await press(fixture, pagerButton(el, NEXT));
    expectPage(el, 3, 5);
    expect(rows(el)).toHaveLength(5);
    const next = pagerButton(el, NEXT)!;
    expect(next.disabled).toBe(true);
    expect(next.getAttribute('title')).toBe(NO_MORE);
    const all = [...page1, ...page2, ...shownCodes(el)];
    expect(all).toEqual([...PRODUCTS_FIXTURE.map((p) => p.code)].sort());

    await press(fixture, pagerButton(el, PREVIOUS));
    expectPage(el, 2, 20);
    expect(shownCodes(el)).toEqual(page2);

    await press(fixture, pagerButton(el, PREVIOUS));
    expectPage(el, 1, 20);
    expect(shownCodes(el)).toEqual(page1);
    expect(labels(pager(el))).toEqual([NEXT]);
  });

  it('[EP00-TBR-003-CA3] «Primera página» from the last page goes back to page 1', async () => {
    const { fixture, el } = await open();
    const page1 = shownCodes(el);
    await press(fixture, pagerButton(el, NEXT));
    await press(fixture, pagerButton(el, NEXT));
    expectPage(el, 3, 5);

    await press(fixture, pagerButton(el, FIRST));

    expectPage(el, 1, 20);
    expect(shownCodes(el)).toEqual(page1);
    expect(labels(pager(el))).toEqual([NEXT]);
  });

  it('[EP00-TBR-003-CA3] «Siguiente» sends back the opaque nextCursor exactly as received', async () => {
    const port = new ScriptedProductPort(threePages);
    const { fixture, el } = await open({ port });

    await press(fixture, pagerButton(el, NEXT));
    expect(cursorOf(port.requests.at(-1))).toBe(CURSOR_2);
    expect(shownCodes(el)).toEqual(codesOf(PAGE_2));

    await press(fixture, pagerButton(el, NEXT));
    expect(cursorOf(port.requests.at(-1))).toBe(CURSOR_3);
    expect(shownCodes(el)).toEqual(codesOf(PAGE_3));
    expectPage(el, 3, 5);
  });

  it('[EP00-TBR-003-CA3] the view keeps the cursor stack: «Anterior» from page 3 shows page 2 (asking with its cursor if it asks)', async () => {
    const port = new ScriptedProductPort(threePages);
    const { fixture, el } = await open({ port });
    await press(fixture, pagerButton(el, NEXT));
    await press(fixture, pagerButton(el, NEXT));
    const before = port.requests.length;

    await press(fixture, pagerButton(el, PREVIOUS));

    expectPage(el, 2, 20);
    expect(shownCodes(el)).toEqual(codesOf(PAGE_2));
    if (port.requests.length > before) expect(cursorOf(port.requests.at(-1))).toBe(CURSOR_2);

    await press(fixture, pagerButton(el, PREVIOUS));
    expectPage(el, 1, 20);
    expect(shownCodes(el)).toEqual(codesOf(PAGE_1));
    if (port.requests.length > before + 1) expect(cursorOf(port.requests.at(-1))).toBeNull();
  });

  it('[EP00-TBR-003-CA3] «Primera página» asks without cursor (or shows the first page it already had)', async () => {
    const port = new ScriptedProductPort(threePages);
    const { fixture, el } = await open({ port });
    await press(fixture, pagerButton(el, NEXT));
    const before = port.requests.length;

    await press(fixture, pagerButton(el, FIRST));

    expectPage(el, 1, 20);
    expect(shownCodes(el)).toEqual(codesOf(PAGE_1));
    if (port.requests.length > before) expect(cursorOf(port.requests.at(-1))).toBeNull();
  });

  it('[EP00-TBR-003-CA3] the rows keep the order the port gives: the screen never re-sorts', async () => {
    const unsorted = [
      product(300, { name: 'Zeta sintético' }),
      product(100, { name: 'Alfa sintético' }),
      product(200, { name: 'Media sintético' }),
    ];
    const port = new ScriptedProductPort(() => of({ items: unsorted, nextCursor: null }));
    const { el } = await open({ port });

    expect(shownCodes(el)).toEqual(['SYN0300', 'SYN0100', 'SYN0200']);
  });

  it('[EP00-TBR-003-CA3] with the in-memory port the screen shows exactly the port first page, in the same order', async () => {
    const { el } = await open();
    const fromPort = await firstValueFrom(TestBed.inject(ProductPort).list());

    expect(shownCodes(el)).toEqual(fromPort.items.map((p) => p.code));
  });

  it('[EP00-TBR-003-CA3] a single page (nextCursor null) shows «Página 1 · N productos» and «Siguiente» disabled', async () => {
    const { el } = await open({ seed: range(1, 7) });

    expectPage(el, 1, 7);
    expect(labels(pager(el))).toEqual([NEXT]);
    expect(pagerButton(el, NEXT)!.disabled).toBe(true);
    expect(pagerButton(el, NEXT)!.getAttribute('title')).toBe(NO_MORE);
  });

  it('[EP00-TBR-003-CA3] shows no total and no page jump (opaque cursor, C6)', async () => {
    const { el } = await open();

    expect(flat(el)).not.toMatch(/\d+\s+de\s+\d+/);
    expect(labels(el)).not.toContain('Última página');
  });
});

// ---------- CA2b: one state per error code ----------

describe('[EP00-TBR-003-CA2] catalog screen: error states with IN_MEMORY_FAILURE', () => {
  for (const code of CODES) {
    const expected = BY_CODE[code];

    it(`[EP00-TBR-003-CA2] ${code}: «${expected.heading}», its phrase and its actions; no list, no empty state, no pager`, async () => {
      const { el } = await open({ failure: failureOf(code) });
      const box = stateBox(el);

      expectFrame(el);
      expect(box, 'debe mostrar el estado del error').not.toBeNull();
      expect(flat(box)).toContain(expected.heading);
      expect(flat(box)).toContain(expected.phrase);
      expect(labels(box)).toEqual(expected.actions.map((a) => a.label));
      for (const action of expected.actions) expect(lookOf(button(box, action.label))).toBe(action.look);
      expectNoList(el);
      expect(flat(el)).not.toContain(EMPTY_HEADING);
    });

    it(`[EP00-TBR-003-CA2] ${code}: role="${expected.role}"`, async () => {
      const { el } = await open({ failure: failureOf(code) });

      expect(roleOf(stateBox(el)!)).toBe(expected.role);
    });

    it(`[EP00-TBR-003-CA2] ${code}: the service message is shown ${expected.field === null ? 'because field is null' : 'never, because field is not null'}`, async () => {
      const { el } = await open({ failure: failureOf(code) });
      const text = flat(stateBox(el));

      if (expected.field === null) expect(text).toContain(expected.message);
      else expect(text).not.toContain(expected.message);
    });

    it(`[EP00-TBR-003-CA2] ${code}: neither the code nor the field name is shown to the person`, async () => {
      const { el } = await open({ failure: failureOf(code, 'corr-syn-0001') });

      expect(flat(el)).not.toMatch(CODE_WORDS);
      if (expected.field !== null) expect(flat(el)).not.toContain(expected.field);
    });

    it(`[EP00-TBR-003-CA2] ${code}: «Referencia: <correlationId>» only when the error brings one`, async () => {
      const withId = await open({ failure: failureOf(code, 'corr-syn-0001') });
      expect(flat(stateBox(withId.el))).toContain('Referencia: corr-syn-0001');
      TestBed.resetTestingModule();

      const withoutId = await open({ failure: failureOf(code) });
      expect(flat(withoutId.el)).not.toContain('Referencia');
    });
  }

  it('[EP00-TBR-003-CA2] UNAVAILABLE as in the approved prototype: title, service message, phrase, «Referencia: c-demo-0001» and «Reintentar» primary', async () => {
    const { el } = await open({ failure: failureOf('UNAVAILABLE', 'c-demo-0001') });
    const box = stateBox(el)!;

    expect(flat(box)).toContain('No pudimos cargar el catálogo');
    expect(flat(box)).toContain('El servicio no está disponible por ahora.');
    expect(flat(box)).toContain(RETRY_PHRASE);
    expect(flat(box)).toContain('Referencia: c-demo-0001');
    expect(labels(box)).toEqual([RETRY]);
    expect(lookOf(button(box, RETRY))).toBe('primary');
  });

  it('[EP00-TBR-003-CA2] an error that is not an ApiError is treated as UNAVAILABLE and its internal text is not shown', async () => {
    const { el } = await open({ failure: new Error('fallo interno sintético') });
    const box = stateBox(el)!;

    expect(flat(box)).toContain(BY_CODE.UNAVAILABLE.heading);
    expect(flat(box)).toContain(RETRY_PHRASE);
    expect(labels(box)).toEqual([RETRY]);
    expect(flat(el)).not.toContain('fallo interno sintético');
    expectNoList(el);
  });

  it('[EP00-TBR-003-CA2] «Reintentar» asks again; when the port answers, the list replaces the error', async () => {
    const port = new ScriptedProductPort((request, call) =>
      call === 1 ? throwError(() => failureOf('UNAVAILABLE')) : threePages(request),
    );
    const { fixture, el } = await open({ port });
    expect(stateBox(el)).not.toBeNull();

    await press(fixture, button(stateBox(el), RETRY));

    expect(port.requests).toHaveLength(2);
    expect(cursorOf(port.requests[1])).toBeNull();
    expect(stateBox(el)).toBeNull();
    expect(shownCodes(el)).toEqual(codesOf(PAGE_1));
    expectPage(el, 1, 20);
  });

  it('[EP00-TBR-003-CA2] an error on page 2 hides the list and the pager (old rows are not kept)', async () => {
    const port = new ScriptedProductPort((request) =>
      cursorOf(request) === CURSOR_2 ? throwError(() => failureOf('UNAVAILABLE')) : threePages(request),
    );
    const { fixture, el } = await open({ port });

    await press(fixture, pagerButton(el, NEXT));

    expect(flat(stateBox(el))).toContain(BY_CODE.UNAVAILABLE.heading);
    expectNoList(el);
  });

  it('[EP00-TBR-003-CA2] VALIDATION on page 2: «Reintentar» asks again with the same cursor and shows page 2', async () => {
    let failed = false;
    const port = new ScriptedProductPort((request) => {
      if (cursorOf(request) === CURSOR_2 && !failed) {
        failed = true;
        return throwError(() => failureOf('VALIDATION'));
      }
      return threePages(request);
    });
    const { fixture, el } = await open({ port });
    await press(fixture, pagerButton(el, NEXT));
    expect(flat(stateBox(el))).toContain(BY_CODE.VALIDATION.heading);
    const before = port.requests.length;

    await press(fixture, button(stateBox(el), RETRY));

    expect(port.requests.length).toBe(before + 1);
    expect(cursorOf(port.requests.at(-1))).toBe(CURSOR_2);
    expect(shownCodes(el)).toEqual(codesOf(PAGE_2));
    expectPage(el, 2, 20);
  });

  it('[EP00-TBR-003-CA2] VALIDATION on page 2: «Ir a la primera página» asks without cursor and restarts at page 1', async () => {
    const port = new ScriptedProductPort((request) =>
      cursorOf(request) === CURSOR_2 ? throwError(() => failureOf('VALIDATION')) : threePages(request),
    );
    const { fixture, el } = await open({ port });
    await press(fixture, pagerButton(el, NEXT));
    const before = port.requests.length;

    await press(fixture, button(stateBox(el), GO_FIRST));

    expect(port.requests.length).toBe(before + 1);
    expect(cursorOf(port.requests.at(-1))).toBeNull();
    expect(shownCodes(el)).toEqual(codesOf(PAGE_1));
    expectPage(el, 1, 20);
    expect(labels(pager(el))).toEqual([NEXT]);
  });

  it('[EP00-TBR-003-CA2] INVALID_CURSOR on «Siguiente»: does not reload by itself; «Ir a la primera página» asks without cursor', async () => {
    const port = new ScriptedProductPort((request) =>
      cursorOf(request) === CURSOR_2 ? throwError(() => failureOf('INVALID_CURSOR')) : threePages(request),
    );
    const { fixture, el } = await open({ port });
    await press(fixture, pagerButton(el, NEXT));
    expect(flat(stateBox(el))).toContain(BY_CODE.INVALID_CURSOR.heading);
    const before = port.requests.length;
    await settle(fixture);
    expect(port.requests.length).toBe(before);

    await press(fixture, button(stateBox(el), GO_FIRST));

    expect(port.requests.length).toBe(before + 1);
    expect(cursorOf(port.requests.at(-1))).toBeNull();
    expect(stateBox(el)).toBeNull();
    expect(shownCodes(el)).toEqual(codesOf(PAGE_1));
    expectPage(el, 1, 20);
    expect(labels(pager(el))).toEqual([NEXT]);
  });

  it('[EP00-TBR-003-CA2] FORBIDDEN and NOT_FOUND offer no action: the screen asks only once', async () => {
    for (const code of ['FORBIDDEN', 'NOT_FOUND'] as const) {
      const port = new ScriptedProductPort(() => throwError(() => failureOf(code)));
      const { fixture, el } = await open({ port });
      await settle(fixture);

      expect(buttons(el)).toHaveLength(0);
      expect(port.requests).toHaveLength(1);
      TestBed.resetTestingModule();
    }
  });
});

// ---------- empty and loading ----------

describe('[EP00-TBR-003-CA3] catalog screen: empty catalog', () => {
  it('[EP00-TBR-003-CA3] with an empty seed: «Aún no hay productos en el catálogo», its message, no action and no list footer', async () => {
    const { el } = await open({ seed: [] });
    const box = stateBox(el);

    expectFrame(el);
    expect(box).not.toBeNull();
    expect(flat(box)).toContain(EMPTY_HEADING);
    expect(flat(box)).toContain(EMPTY_MESSAGE);
    expect(roleOf(box!)).toBe('status');
    expect(buttons(el)).toHaveLength(0);
    expectNoList(el);
  });

  it('[EP00-TBR-003-CA2] the empty catalog is not an error: no error title, no «Reintentar»', async () => {
    const { el } = await open({ seed: [] });

    for (const code of CODES) expect(flat(el)).not.toContain(BY_CODE[code].heading);
    expect(roleOf(stateBox(el)!)).not.toBe('alert');
  });
});

describe('[EP00-TBR-003-CA3] catalog screen: loading (fake timers)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function tick(fixture: ComponentFixture<unknown>, ms: number) {
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
  }

  it('[EP00-TBR-003-CA3] first load: busy «Cargando productos» at once, skeleton from 300 ms, then the rows replace it', async () => {
    const pending = new Subject<Page<Product>>();
    const port = new ScriptedProductPort(() => pending);
    const { fixture, el } = mount({ port });

    await tick(fixture, 0);
    expectFrame(el);
    const busy = el.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy!.getAttribute('aria-label')).toBe(LOADING_LABEL);
    expect(rows(el)).toHaveLength(0);
    expect(stateBox(el)).toBeNull();

    await tick(fixture, 300);
    expect(skeleton(el)).not.toBeNull();
    expect(rows(el)).toHaveLength(0);
    expect(pager(el)).toBeNull();

    pending.next(PAGE_1);
    pending.complete();
    await tick(fixture, 0);
    expect(skeleton(el)).toBeNull();
    expect(el.querySelector('[aria-busy="true"]')).toBeNull();
    expect(shownCodes(el)).toEqual(codesOf(PAGE_1));
    expectPage(el, 1, 20);
  });

  it('[EP00-TBR-003-CA3] «Siguiente» while loading: skeleton from 300 ms, never mixed with the old rows; then page 2', async () => {
    const pending = new Subject<Page<Product>>();
    const port = new ScriptedProductPort((request) => (cursorOf(request) === CURSOR_2 ? pending : threePages(request)));
    const { fixture, el } = mount({ port });
    await tick(fixture, 0);
    expect(shownCodes(el)).toEqual(codesOf(PAGE_1));

    pagerButton(el, NEXT)!.click();
    await tick(fixture, 300);
    expect(skeleton(el)).not.toBeNull();
    expect(rows(el)).toHaveLength(0);

    pending.next(PAGE_2);
    pending.complete();
    await tick(fixture, 0);
    expect(skeleton(el)).toBeNull();
    expect(shownCodes(el)).toEqual(codesOf(PAGE_2));
    expectPage(el, 2, 20);
  });
});

// ---------- T7 (trazabilidad): gaps found after reading the code ----------

// Approved widths (docs/ui/EP00-TBR-003/index.html, .proto-tabla --cols) and fixed columns (stick1 stick2, --stick2).
const APPROVED_TRACKS = '104px 200px 140px 130px 160px 130px 130px 160px 140px 150px';

describe('[EP00-TBR-003-CA1] catalog screen: layout of the approved table', () => {
  it('[EP00-TBR-003-CA1] the header and every row use the approved column widths, in the approved order', async () => {
    const { el } = await open();
    const head = el.querySelector<HTMLElement>('.tb-head-row');

    expect(head).not.toBeNull();
    expect(head!.style.getPropertyValue('--cols').trim()).toBe(APPROVED_TRACKS);
    for (const row of rows(el)) expect(row.style.getPropertyValue('--cols').trim()).toBe(APPROVED_TRACKS);
  });

  it('[EP00-TBR-003-CA1] «Código» and «Nombre» are fixed (stick1 stick2) and the second one starts after the 104px of the first plus the gap', async () => {
    const { el } = await open();
    const scroll = el.querySelector<HTMLElement>('.tb-hscroll');

    expect(scroll).not.toBeNull();
    expect(scroll!.classList.contains('stick1')).toBe(true);
    expect(scroll!.classList.contains('stick2')).toBe(true);
    expect(scroll!.style.getPropertyValue('--stick2').replace(/\s+/g, '')).toBe('calc(104px+var(--spacing-3))');
  });

  it('[EP00-TBR-003-CA1] the list uses the dense rows of the approved UI (tb-list dense)', async () => {
    const { el } = await open();

    expect(el.querySelector('.tb-list')?.classList.contains('dense')).toBe(true);
  });

  it('[EP00-TBR-003-CA1] the screen says «Código», never «SKU» (G-0004), in the visible text or in labels', async () => {
    const { el } = await open();
    const labelled = Array.from(el.querySelectorAll('[aria-label], [title]'))
      .map((n) => `${n.getAttribute('aria-label') ?? ''} ${n.getAttribute('title') ?? ''}`)
      .join(' ');

    expect(headers(el)[0]).toBe('Código');
    expect(flat(el)).not.toMatch(/sku/i);
    expect(labelled).not.toMatch(/sku/i);
  });

  // Approved UI 1607a54: the «Código» and «EAN» cells are mono (kit class tb-num); no other column is.
  // Accepted deviation H3: the «—» of an empty EAN may be mono or not, so that cell is neither required nor excluded.
  describe('[EP00-TBR-003-CA1] mono columns «Código» and «EAN» (tb-num)', () => {
    const MONO_HEADERS = ['Código', 'EAN'];
    const isMono = (cell: HTMLElement) => cell.classList.contains('tb-num') || !!cell.querySelector('.tb-num');

    function expectMonoColumns(el: HTMLElement, emptyEanCodes: readonly string[] = []) {
      const names = headers(el);
      expect(names).toHaveLength(10);
      expect(rows(el).length).toBeGreaterThan(0);
      const codeAt = names.indexOf('Código');
      const eanAt = names.indexOf('EAN');

      for (const head of Array.from(el.querySelectorAll<HTMLElement>('[role="columnheader"]'))) {
        expect(isMono(head), `la cabecera «${visible(head)}» no va en mono`).toBe(false);
      }
      for (const row of rows(el)) {
        const rowCells = cells(row);
        const code = visible(rowCells[codeAt]);
        expect(rowCells).toHaveLength(names.length);
        rowCells.forEach((cell, i) => {
          if (i === eanAt && emptyEanCodes.includes(code)) return; // H3: «—» of an empty EAN, free
          const expected = MONO_HEADERS.includes(names[i]);
          expect(isMono(cell), `fila ${code}, columna «${names[i]}»: mono debe ser ${expected}`).toBe(expected);
        });
      }
    }

    it('[EP00-TBR-003-CA1] demo catalog: every «Código» and «EAN» cell carries tb-num and no other cell does', async () => {
      const { el } = await open();

      expectMonoColumns(el);
    });

    it('[EP00-TBR-003-CA1] with an empty EAN and supplier: the «—» of «Proveedor» is not mono; the rest keeps the rule', async () => {
      const seed = [product(1), product(2, { supplier: null, ean: null }), product(3)];
      const { el } = await open({ seed });

      expect(rows(el)).toHaveLength(3);
      expectMonoColumns(el, ['SYN0002']);
    });

  });
});

describe('[EP00-TBR-003-CA2] catalog screen: load timeout (10 s) and reset of the previous failure', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function tick(fixture: ComponentFixture<unknown>, ms: number) {
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
  }

  it('[EP00-TBR-003-CA2] a first load that passes 10 s shows «No pudimos cargar el catálogo» with «Reintentar» primary and no list', async () => {
    const port = new ScriptedProductPort(() => new Subject<Page<Product>>());
    const { fixture, el } = mount({ port });

    await tick(fixture, 9_999);
    expect(stateBox(el)).toBeNull();

    await tick(fixture, 1);
    const box = stateBox(el);
    expect(box, 'a los 10 s debe mostrar el error').not.toBeNull();
    expect(flat(box)).toContain(BY_CODE.UNAVAILABLE.heading);
    expect(labels(box)).toEqual([RETRY]);
    expect(lookOf(button(box, RETRY))).toBe('primary');
    expect(roleOf(box!)).toBe('alert');
    expectNoList(el);
  });

  it('[EP00-TBR-003-CA2] «Reintentar» after the 10 s timeout asks the port again and the answer replaces the error', async () => {
    const hung = new Subject<Page<Product>>();
    const port = new ScriptedProductPort((request, call) => (call === 1 ? hung : threePages(request)));
    const { fixture, el } = mount({ port });
    await tick(fixture, 10_000);
    expect(stateBox(el)).not.toBeNull();

    button(stateBox(el), RETRY)!.click();
    await tick(fixture, 0);

    expect(port.requests).toHaveLength(2);
    expect(cursorOf(port.requests[1])).toBeNull();
    expect(stateBox(el)).toBeNull();
    expect(shownCodes(el)).toEqual(codesOf(PAGE_1));
    expectPage(el, 1, 20);
  });

  it('[EP00-TBR-003-CA2] «Reintentar» after the 10 s timeout shows loading again (the error does not stay while the port answers)', async () => {
    const port = new ScriptedProductPort(() => new Subject<Page<Product>>());
    const { fixture, el } = mount({ port });
    await tick(fixture, 10_000);
    expect(stateBox(el)).not.toBeNull();

    button(stateBox(el), RETRY)!.click();
    await tick(fixture, 0);

    expect(port.requests).toHaveLength(2);
    expect(stateBox(el), 'tras «Reintentar» no debe quedar el error anterior').toBeNull();
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('[EP00-TBR-003-CA2] each request clears the previous failure: INVALID_CURSOR, then a first page that passes 10 s shows UNAVAILABLE texts', async () => {
    const hung = new Subject<Page<Product>>();
    const port = new ScriptedProductPort((request, call) => {
      if (call === 1) return of(PAGE_1);
      if (cursorOf(request) === CURSOR_2) return throwError(() => failureOf('INVALID_CURSOR', 'corr-syn-0009'));
      return hung;
    });
    const { fixture, el } = mount({ port });
    await tick(fixture, 0);
    pagerButton(el, NEXT)!.click();
    await tick(fixture, 0);
    expect(flat(stateBox(el))).toContain(BY_CODE.INVALID_CURSOR.heading);

    button(stateBox(el), GO_FIRST)!.click();
    await tick(fixture, 10_000);

    const box = stateBox(el);
    expect(box).not.toBeNull();
    expect(flat(box)).toContain(BY_CODE.UNAVAILABLE.heading);
    expect(flat(box)).not.toContain(BY_CODE.INVALID_CURSOR.heading);
    expect(flat(box)).not.toContain('corr-syn-0009');
    expect(labels(box)).toEqual([RETRY]);

    button(box, RETRY)!.click();
    await tick(fixture, 0);
    expect(cursorOf(port.requests[port.requests.length - 1])).toBeNull();
  });

  it('[EP00-TBR-003-CA2] each request clears the previous failure: VALIDATION «Reintentar» that passes 10 s loses the secondary action and the reference', async () => {
    const hung = new Subject<Page<Product>>();
    const port = new ScriptedProductPort((_request, call) =>
      call === 1 ? throwError(() => failureOf('VALIDATION', 'corr-syn-0010')) : hung,
    );
    const { fixture, el } = mount({ port });
    await tick(fixture, 0);
    expect(labels(stateBox(el))).toEqual([RETRY, GO_FIRST]);

    button(stateBox(el), RETRY)!.click();
    await tick(fixture, 10_000);

    const box = stateBox(el);
    expect(box).not.toBeNull();
    expect(flat(box)).toContain(BY_CODE.UNAVAILABLE.heading);
    expect(labels(box)).toEqual([RETRY]);
    expect(flat(box)).not.toContain('corr-syn-0010');
  });
});
