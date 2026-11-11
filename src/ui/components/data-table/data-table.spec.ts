// [EP00-TBR-004-CA4][EP00-TBR-004-CA3][EP00-TBR-004-CA2][EP00-TBR-004-CA1] DataTable with its search box
// (v6 c-DataTable, «Tablas», c-Skeleton rules; design docs/diseno/EP00-TBR-004.md §1.2, §3.4, §6, edge cases 1-8).
// The table presents and emits: it does not sort, filter or fetch (DEC-0012). Synthetic rows only.
// Assumption fixed by these tests (the design names TbTableTexts but not its shape): texts is keyed by
// TbEmptyVariant and each entry has heading, message and an optional actionLabel, like the EmptyState inputs.
// jsdom does not move focus with Tab nor turn Enter/Space on a native button into a click: tabbables() models the
// tab order and activate() dispatches the key and, like a browser, the click when the key was not cancelled.
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as publicApi from '../../index';
import { TB_CLOCK } from '../../format/clock';
import { TbIcon } from '../icon/icon';
import { TbCellDef, TbColumn, TbDataTable } from './data-table';

const THEMES = ['light', 'dark'] as const;
const NBSP = ' ';
const DASH = '—';

interface Row {
  id: string;
  name: string;
  price: number | null;
  qty: number;
  share: number;
  updated: string;
  status: string;
}

// [EP00-TBR-004-CA2] H4: typed with TbColumn, so type is the closed union of column types.
const COLUMNS: TbColumn<Row>[] = [
  { id: 'name', header: 'Nombre', type: 'text', value: (r: Row) => r.name },
  { id: 'price', header: 'Precio', type: 'money', value: (r: Row) => r.price, sortable: true },
  { id: 'qty', header: 'Existencia', type: 'quantity', value: (r: Row) => r.qty, sortable: true },
  { id: 'share', header: 'Participación', type: 'percent', value: (r: Row) => r.share },
  { id: 'updated', header: 'Actualizado', type: 'date', value: (r: Row) => r.updated },
  { id: 'status', header: 'Estado', type: 'status', value: (r: Row) => r.status },
];

const makeRows = (n: number, prefix = 'Producto sintético'): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p-${prefix.length}-${i + 1}`,
    name: `${prefix} ${i + 1}`,
    price: 1850000,
    qty: 1234,
    share: 24.5,
    updated: '2026-10-09',
    status: 'ACTIVE',
  }));

const TEXTS = {
  empty: {
    heading: 'Aún no hay productos',
    message: 'Cuando des de alta un producto aparecerá aquí.',
    actionLabel: 'Crear producto',
  },
  'no-results': { heading: 'Sin resultados', message: 'Ningún producto coincide con los filtros.' },
  forbidden: { heading: 'Sin permisos', message: 'Tu perfil no puede ver esta lista.' },
  offline: { heading: 'Sin conexión', message: 'Revisa tu red e inténtalo de nuevo.' },
  error: { heading: 'No se pudo cargar', message: 'El servicio no respondió.' },
};

const DEFAULTS: Record<string, unknown> = {
  title: 'Productos',
  columns: COLUMNS,
  rows: [],
  rowKey: (r: Row) => r.id,
  state: 'ready',
  sort: null,
  searchTerm: '',
  searchLabel: 'Buscar productos',
  searchPlaceholder: 'Buscar por nombre',
  filtersActive: false,
  itemLabel: { one: 'producto', other: 'productos' },
  loadingLabel: 'Cargando productos',
  texts: TEXTS,
  rowsActivatable: false,
};

function tabbables(root: ParentNode): HTMLElement[] {
  const selector = 'a[href], button, input, select, textarea, [tabindex]';
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !(el as HTMLButtonElement).disabled &&
      !el.closest('[hidden], [inert], [aria-hidden="true"]') &&
      !(el instanceof HTMLInputElement && el.type === 'hidden'),
  );
}

function key(target: Element, k: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function activate(el: HTMLElement, k: 'Enter' | ' ' = 'Enter') {
  const event = key(el, k);
  if (
    !event.defaultPrevented &&
    (el instanceof HTMLButtonElement || el.getAttribute('role') === 'button')
  )
    el.click();
}

interface Emitted {
  sort: unknown[];
  search: string[];
  clearFilters: number;
  retry: number;
  loadTimeout: number;
  rowActivate: unknown[];
  emptyAction: unknown[];
}

// Every test of this file reads dates with a fixed clock.
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [{ provide: TB_CLOCK, useValue: () => new Date('2026-11-11T18:00:00Z') }],
  });
});

function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(TbDataTable);
  for (const [k, v] of Object.entries({ ...DEFAULTS, ...inputs }))
    fixture.componentRef.setInput(k, v);
  const out: Emitted = {
    sort: [],
    search: [],
    clearFilters: 0,
    retry: 0,
    loadTimeout: 0,
    rowActivate: [],
    emptyAction: [],
  };
  const c = fixture.componentInstance;
  c.sortChange.subscribe((v: unknown) => out.sort.push(v));
  c.searchChange.subscribe((v: string) => out.search.push(v));
  c.clearFilters.subscribe(() => out.clearFilters++);
  c.retry.subscribe(() => out.retry++);
  c.loadTimeout.subscribe(() => out.loadTimeout++);
  c.rowActivate.subscribe((v: unknown) => out.rowActivate.push(v));
  c.emptyAction.subscribe((v: unknown) => out.emptyAction.push(v));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const set = (patch: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(patch)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
  };
  const sync = () => fixture.detectChanges();
  return { fixture, el, out, set, sync };
}

// Queries over the rendered table.
const dataRows = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>('[role="row"]')).filter((r) =>
    r.querySelector('[role="cell"]'),
  );
const cellsOf = (row: HTMLElement) =>
  Array.from(row.querySelectorAll<HTMLElement>('[role="cell"]'));
const headers = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>('[role="columnheader"]'));
const header = (el: HTMLElement, text: string) =>
  headers(el).find((h) => h.textContent?.includes(text)) as HTMLElement;
const headerControl = (h: HTMLElement) => (h.querySelector('button') as HTMLElement | null) ?? h;
const skeleton = (el: HTMLElement) => el.querySelector('tb-skeleton') as HTMLElement | null;
const emptyState = (el: HTMLElement) => el.querySelector('tb-empty-state') as HTMLElement | null;
const roleOf = (host: HTMLElement) =>
  host.getAttribute('role') ?? host.querySelector('[role]')?.getAttribute('role') ?? null;
const busyOwner = (el: HTMLElement) =>
  el.hasAttribute('aria-busy') ? el : (el.querySelector('[aria-busy]') as HTMLElement | null);
const isBusy = (el: HTMLElement) => busyOwner(el)?.getAttribute('aria-busy') === 'true';
const searchBox = (el: HTMLElement) =>
  el.querySelector('input[aria-label="Buscar productos"]') as HTMLInputElement | null;
const buttonByText = (root: HTMLElement, text: string) =>
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as
    HTMLButtonElement | undefined;
const isNum = (cell: HTMLElement) => cell.classList.contains('num') || !!cell.querySelector('.num');
const liveRegionsOutsideEmptyState = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>('[role="status"], [aria-live]')).filter(
    (r) => !r.closest('tb-empty-state'),
  );
const footerText = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

describe('[EP00-TBR-004-CA4] TbDataTable loading phases (fake timers)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('[EP00-TBR-004-CA4] loading sets aria-busy="true" and the loading label from the first instant', () => {
    const { el } = render({ state: 'loading' });
    const owner = busyOwner(el);
    expect(owner).not.toBeNull();
    expect(owner!.getAttribute('aria-busy')).toBe('true');
    expect(owner!.getAttribute('aria-label')).toBe('Cargando productos');
  });

  it('[EP00-TBR-004-CA4] there is no skeleton before 300 ms (299 ms)', () => {
    const { el, sync } = render({ state: 'loading' });
    vi.advanceTimersByTime(299);
    sync();
    expect(skeleton(el)).toBeNull();
    expect(emptyState(el)).toBeNull();
  });

  it('[EP00-TBR-004-CA4] at 300 ms the decorative skeleton of 5 rows appears', () => {
    const { el, sync } = render({ state: 'loading' });
    vi.advanceTimersByTime(300);
    sync();
    const sk = skeleton(el);
    expect(sk).not.toBeNull();
    const hidden =
      sk!.getAttribute('aria-hidden') === 'true' || !!sk!.querySelector('[aria-hidden="true"]');
    expect(hidden).toBe(true);
    expect(sk!.querySelectorAll('.tb-skel-rows > *')).toHaveLength(5);
    expect(dataRows(el)).toHaveLength(0);
    expect(isBusy(el)).toBe(true);
  });

  it('[EP00-TBR-004-CA4] at 10 s it switches to the error EmptyState with «Reintentar» and role="alert", emitting loadTimeout once', () => {
    const { el, out, sync } = render({ state: 'loading' });
    vi.advanceTimersByTime(9_999);
    sync();
    expect(out.loadTimeout).toBe(0);
    vi.advanceTimersByTime(1);
    sync();
    const es = emptyState(el);
    expect(es).not.toBeNull();
    expect(roleOf(es!)).toBe('alert');
    expect(buttonByText(es!, 'Reintentar')).toBeDefined();
    expect(skeleton(el)).toBeNull();
    expect(out.loadTimeout).toBe(1);
    vi.advanceTimersByTime(60_000);
    sync();
    expect(out.loadTimeout).toBe(1);
  });

  it('[EP00-TBR-004-CA4] «Reintentar» after the 10 s cut emits retry', () => {
    const { el, out, sync } = render({ state: 'loading' });
    vi.advanceTimersByTime(10_000);
    sync();
    buttonByText(emptyState(el)!, 'Reintentar')!.click();
    sync();
    expect(out.retry).toBe(1);
  });

  it('[EP00-TBR-004-CA4] loading -> ready before 300 ms never shows the skeleton (edge case 1)', () => {
    const { el, set, sync } = render({ state: 'loading' });
    vi.advanceTimersByTime(250);
    set({ rows: makeRows(3), state: 'ready' });
    for (let t = 0; t < 12; t++) {
      vi.advanceTimersByTime(1_000);
      sync();
      expect(skeleton(el)).toBeNull();
    }
    expect(dataRows(el)).toHaveLength(3);
    expect(emptyState(el)).toBeNull();
  });

  it('[EP00-TBR-004-CA4] data that arrive after the 10 s cut are shown (edge case 2)', () => {
    const { el, set, sync } = render({ state: 'loading' });
    vi.advanceTimersByTime(10_500);
    sync();
    set({ rows: makeRows(3), state: 'ready' });
    expect(dataRows(el)).toHaveLength(3);
    expect(emptyState(el)).toBeNull();
    expect(isBusy(el)).toBe(false);
  });

  it('[EP00-TBR-004-CA4] a reload keeps the old rows until 300 ms and then replaces them, never mixing (AJ-7, edge case 3)', () => {
    const { el, set, sync } = render({ state: 'ready', rows: makeRows(3) });
    expect(dataRows(el)).toHaveLength(3);
    set({ state: 'loading' });
    expect(isBusy(el)).toBe(true);
    expect(skeleton(el)).toBeNull();
    expect(dataRows(el)).toHaveLength(3);
    vi.advanceTimersByTime(299);
    sync();
    expect(skeleton(el)).toBeNull();
    expect(dataRows(el)).toHaveLength(3);
    vi.advanceTimersByTime(1);
    sync();
    expect(skeleton(el)).not.toBeNull();
    expect(dataRows(el)).toHaveLength(0);
  });

  it('[EP00-TBR-004-CA4] skeleton and rows are never on screen together during a whole load', () => {
    const { el, set, sync } = render({ state: 'ready', rows: makeRows(4) });
    set({ state: 'loading' });
    for (let t = 0; t <= 10_000; t += 100) {
      expect(!!skeleton(el) && dataRows(el).length > 0).toBe(false);
      vi.advanceTimersByTime(100);
      sync();
    }
  });

  it('[EP00-TBR-004-CA4] destroying the table while loading leaves no live timer (edge case 4)', () => {
    const { fixture, out } = render({ state: 'loading' });
    vi.advanceTimersByTime(100);
    fixture.destroy();
    expect(() => vi.advanceTimersByTime(20_000)).not.toThrow();
    expect(out.loadTimeout).toBe(0);
  });

  it('[EP00-TBR-004-CA4] leaving loading cancels the 10 s timer', () => {
    const { out, set } = render({ state: 'loading' });
    vi.advanceTimersByTime(500);
    set({ state: 'error' });
    vi.advanceTimersByTime(20_000);
    expect(out.loadTimeout).toBe(0);
  });

  it('[EP00-TBR-004-CA4] ready with rows removes aria-busy and announces the count once with role="status" (41 productos)', () => {
    const { el, set, sync } = render({ state: 'loading' });
    vi.advanceTimersByTime(500);
    sync();
    set({ rows: makeRows(41), state: 'ready' });
    vi.advanceTimersByTime(200);
    sync();
    expect(isBusy(el)).toBe(false);
    const announced = liveRegionsOutsideEmptyState(el).filter((r) =>
      r.textContent?.includes('41 productos'),
    );
    expect(announced).toHaveLength(1);
  });

  it('[EP00-TBR-004-CA4] ready with zero rows does not announce a count: the EmptyState role is enough (edge case 8)', () => {
    const { el, set, sync } = render({ state: 'loading' });
    vi.advanceTimersByTime(500);
    sync();
    set({ rows: [], state: 'ready' });
    vi.advanceTimersByTime(200);
    sync();
    expect(emptyState(el)).not.toBeNull();
    for (const region of liveRegionsOutsideEmptyState(el))
      expect(region.textContent?.trim()).toBe('');
  });
});

describe('[EP00-TBR-004-CA4] TbDataTable states', () => {
  it('[EP00-TBR-004-CA4] ready with zero rows and no filters shows the empty EmptyState with role="status"', () => {
    const { el } = render({ state: 'ready', rows: [] });
    const es = emptyState(el);
    expect(es).not.toBeNull();
    expect(roleOf(es!)).toBe('status');
    expect(es!.textContent).toContain('Aún no hay productos');
    expect(isBusy(el)).toBe(false);
  });

  it('[EP00-TBR-004-CA4] the empty action emits emptyAction("empty")', () => {
    const { el, out, sync } = render({ state: 'ready', rows: [] });
    buttonByText(emptyState(el)!, 'Crear producto')!.click();
    sync();
    expect(out.emptyAction).toEqual(['empty']);
  });

  it('[EP00-TBR-004-CA4] zero rows with active filters shows no-results with «Limpiar filtros», which emits clearFilters', () => {
    const { el, out, sync } = render({ state: 'ready', rows: [], filtersActive: true });
    const es = emptyState(el);
    expect(es).not.toBeNull();
    expect(roleOf(es!)).toBe('status');
    expect(es!.textContent).toContain('Sin resultados');
    buttonByText(es!, 'Limpiar filtros')!.click();
    sync();
    expect(out.clearFilters).toBe(1);
  });

  it('[EP00-TBR-004-CA4] zero rows with a search term also shows no-results', () => {
    const { el } = render({ state: 'ready', rows: [], searchTerm: 'xyz' });
    expect(emptyState(el)?.textContent).toContain('Sin resultados');
    expect(emptyState(el)?.textContent).not.toContain('Aún no hay productos');
  });

  it('[EP00-TBR-004-CA4] error shows its EmptyState with role="alert" and «Reintentar», which emits retry', () => {
    const { el, out, sync } = render({ state: 'error', rows: [] });
    const es = emptyState(el);
    expect(es).not.toBeNull();
    expect(roleOf(es!)).toBe('alert');
    expect(es!.textContent).toContain('No se pudo cargar');
    buttonByText(es!, 'Reintentar')!.click();
    sync();
    expect(out.retry).toBe(1);
  });

  it('[EP00-TBR-004-CA4] offline shows its EmptyState with role="alert" and «Reintentar», which emits retry', () => {
    const { el, out, sync } = render({ state: 'offline', rows: [] });
    const es = emptyState(el);
    expect(es).not.toBeNull();
    expect(roleOf(es!)).toBe('alert');
    expect(es!.textContent).toContain('Sin conexión');
    buttonByText(es!, 'Reintentar')!.click();
    sync();
    expect(out.retry).toBe(1);
  });

  it('[EP00-TBR-004-CA4] forbidden shows its EmptyState with role="status" and no action', () => {
    const { el } = render({ state: 'forbidden', rows: [] });
    const es = emptyState(el);
    expect(es).not.toBeNull();
    expect(roleOf(es!)).toBe('status');
    expect(es!.textContent).toContain('Sin permisos');
    expect(es!.querySelectorAll('button')).toHaveLength(0);
  });

  it('[EP00-TBR-004-CA4] error, offline and forbidden never show rows or skeleton, even with rows in the input', () => {
    for (const state of ['error', 'offline', 'forbidden']) {
      const { el } = render({ state, rows: makeRows(2) });
      expect(dataRows(el)).toHaveLength(0);
      expect(skeleton(el)).toBeNull();
      expect(emptyState(el)).not.toBeNull();
    }
  });

  it('[EP00-TBR-004-CA4] a single row renders one row and the footer says «1 producto» (edge case 5)', () => {
    const { el } = render({ rows: makeRows(1) });
    expect(dataRows(el)).toHaveLength(1);
    expect(footerText(el)).toMatch(/\b1 producto(?!s)/);
    expect(emptyState(el)).toBeNull();
  });

  it('[EP00-TBR-004-CA4] the footer uses count when given (cursor pages) and shows the note', () => {
    const { el } = render({ rows: makeRows(41), count: 120, note: 'Precios sin impuestos' });
    expect(footerText(el)).toContain('120 productos');
    expect(footerText(el)).toContain('Precios sin impuestos');
  });

  it('[EP00-TBR-004-CA4] the footer defaults to rows.length: 41 productos', () => {
    const { el } = render({ rows: makeRows(41) });
    expect(footerText(el)).toContain('41 productos');
  });
});

describe('[EP00-TBR-004-CA2] TbDataTable cells use the regional format', () => {
  it('[EP00-TBR-004-CA2] money, quantity, percent, date and status cells are formatted', () => {
    const { el } = render({ rows: makeRows(1) });
    // Collapse layout whitespace but keep U+00A0: the percent cell must carry it exactly (AJ-6).
    const cells = cellsOf(dataRows(el)[0]).map((c) =>
      c.textContent?.replace(/[^\S ]+/g, ' ').trim(),
    );
    expect(cells[0]).toBe('Producto sintético 1');
    expect(cells[1]).toBe('$1,850,000');
    expect(cells[2]).toBe('1,234');
    expect(cells[3]).toBe(`24.5${NBSP}%`);
    expect(cells[4]).toBe('9 oct');
    expect(cells[5]).toBe('Vigente');
    expect(cellsOf(dataRows(el)[0])[5].querySelector('tb-status')).not.toBeNull();
  });

  it('[EP00-TBR-004-CA2] a null cell shows «—»', () => {
    const rows = makeRows(1);
    rows[0].price = null;
    const { el } = render({ rows });
    expect(cellsOf(dataRows(el)[0])[1].textContent?.trim()).toBe(DASH);
  });

  it('[EP00-TBR-004-CA2] money with cents: true shows 2 decimals', () => {
    const rows = makeRows(1);
    rows[0].price = 1234.5;
    const columns = COLUMNS.map((c) => (c.id === 'price' ? { ...c, cents: true } : c));
    const { el } = render({ rows, columns });
    expect(cellsOf(dataRows(el)[0])[1].textContent?.trim()).toBe('$1,234.50');
  });

  it('[EP00-TBR-004-CA2] numeric cells and their headers are right aligned with num; text is not', () => {
    const { el } = render({ rows: makeRows(1) });
    const cells = cellsOf(dataRows(el)[0]);
    for (const i of [1, 2, 3]) {
      expect(isNum(cells[i])).toBe(true);
      expect(isNum(headers(el)[i])).toBe(true);
    }
    expect(isNum(cells[0])).toBe(false);
    expect(isNum(headers(el)[0])).toBe(false);
  });
});

for (const theme of THEMES) {
  describe(`[EP00-TBR-004-CA3] TbDataTable keyboard and ARIA (data-theme="${theme}")`, () => {
    beforeEach(() => document.documentElement.setAttribute('data-theme', theme));
    afterEach(() => document.documentElement.removeAttribute('data-theme'));

    it('[EP00-TBR-004-CA3] exposes role="table" labelled by the title, with columnheader, row and cell', () => {
      const { el } = render({ rows: makeRows(2) });
      const table = el.querySelector('[role="table"]') as HTMLElement;
      expect(table).not.toBeNull();
      expect(table.getAttribute('aria-label')).toBe('Productos');
      expect(headers(el).map((h) => h.textContent?.trim())).toEqual(COLUMNS.map((c) => c.header));
      expect(dataRows(el)).toHaveLength(2);
      expect(cellsOf(dataRows(el)[0])).toHaveLength(COLUMNS.length);
      expect(el.textContent).toContain('Productos');
    });

    it('[EP00-TBR-004-CA3] the search box has its aria-label and placeholder and is reachable with Tab', () => {
      const { el } = render({ rows: makeRows(2) });
      const box = searchBox(el);
      expect(box).not.toBeNull();
      expect(box!.getAttribute('placeholder')).toBe('Buscar por nombre');
      expect(tabbables(el)).toContain(box);
    });

    it('[EP00-TBR-004-CA3] typing emits searchChange on every input, without debounce or filtering', () => {
      const { el, out } = render({ rows: makeRows(3) });
      const box = searchBox(el)!;
      for (const text of ['p', 'pr', 'pro']) {
        box.value = text;
        box.dispatchEvent(new Event('input', { bubbles: true }));
      }
      expect(out.search).toEqual(['p', 'pr', 'pro']);
      expect(dataRows(el)).toHaveLength(3);
    });

    it('[EP00-TBR-004-CA3] the search box shows the searchTerm given by the caller', () => {
      const { el } = render({ rows: makeRows(1), searchTerm: 'sintético' });
      expect(searchBox(el)!.value).toBe('sintético');
    });

    it('[EP00-TBR-004-CA3] «Limpiar filtros» in the bar appears only with active filters and emits clearFilters', () => {
      const off = render({ rows: makeRows(2), filtersActive: false });
      expect(buttonByText(off.el, 'Limpiar filtros')).toBeUndefined();
      const on = render({ rows: makeRows(2), filtersActive: true });
      const clear = buttonByText(on.el, 'Limpiar filtros');
      expect(clear).toBeDefined();
      expect(tabbables(on.el)).toContain(clear);
      clear!.click();
      on.sync();
      expect(on.out.clearFilters).toBe(1);
    });

    it('[EP00-TBR-004-CA3] sortable headers are reachable with Tab; the others are not', () => {
      const { el } = render({ rows: makeRows(2) });
      const reachable = tabbables(el);
      expect(reachable).toContain(headerControl(header(el, 'Precio')));
      expect(reachable).toContain(headerControl(header(el, 'Existencia')));
      expect(reachable).not.toContain(headerControl(header(el, 'Nombre')));
    });

    it('[EP00-TBR-004-CA3] click on a sortable header emits asc first, then desc and asc again, without reordering rows', () => {
      const rows = makeRows(3);
      const { el, out, set } = render({ rows });
      headerControl(header(el, 'Precio')).click();
      expect(out.sort.at(-1)).toEqual({ columnId: 'price', direction: 'asc' });
      set({ sort: { columnId: 'price', direction: 'asc' } });
      headerControl(header(el, 'Precio')).click();
      expect(out.sort.at(-1)).toEqual({ columnId: 'price', direction: 'desc' });
      set({ sort: { columnId: 'price', direction: 'desc' } });
      headerControl(header(el, 'Precio')).click();
      expect(out.sort.at(-1)).toEqual({ columnId: 'price', direction: 'asc' });
      expect(dataRows(el).map((r) => cellsOf(r)[0].textContent?.trim())).toEqual(
        rows.map((r) => r.name),
      );
    });

    it('[EP00-TBR-004-CA3] Enter on a sortable header also emits the sort', () => {
      const { el, out } = render({ rows: makeRows(2) });
      const control = headerControl(header(el, 'Existencia'));
      control.focus();
      activate(control, 'Enter');
      expect(out.sort.at(-1)).toEqual({ columnId: 'qty', direction: 'asc' });
    });

    it('[EP00-TBR-004-CA3] a new column starts at asc again (one column at a time)', () => {
      const { el, out } = render({
        rows: makeRows(2),
        sort: { columnId: 'price', direction: 'asc' },
      });
      headerControl(header(el, 'Existencia')).click();
      expect(out.sort.at(-1)).toEqual({ columnId: 'qty', direction: 'asc' });
    });

    it('[EP00-TBR-004-CA3] aria-sort is only on the active columnheader', () => {
      const { el, set } = render({
        rows: makeRows(2),
        sort: { columnId: 'price', direction: 'asc' },
      });
      expect(header(el, 'Precio').getAttribute('aria-sort')).toBe('ascending');
      expect(headers(el).filter((h) => h.hasAttribute('aria-sort'))).toHaveLength(1);
      set({ sort: { columnId: 'price', direction: 'desc' } });
      expect(header(el, 'Precio').getAttribute('aria-sort')).toBe('descending');
      set({ sort: null });
      expect(headers(el).filter((h) => h.hasAttribute('aria-sort'))).toHaveLength(0);
    });

    it('[EP00-TBR-004-CA3] activatable rows have tabindex="0" and activate with click, Enter and Space', () => {
      const rows = makeRows(2);
      const { el, out } = render({ rows, rowsActivatable: true });
      const [first, second] = dataRows(el);
      expect(first.getAttribute('tabindex')).toBe('0');
      expect(tabbables(el)).toContain(first);
      first.click();
      first.focus();
      key(first, 'Enter');
      key(second, ' ');
      expect(out.rowActivate).toEqual([rows[0], rows[0], rows[1]]);
    });

    it('[EP00-TBR-004-CA3] non-activatable rows have no tabindex and do not activate', () => {
      const { el, out } = render({ rows: makeRows(2), rowsActivatable: false });
      for (const row of dataRows(el)) expect(row.hasAttribute('tabindex')).toBe(false);
      dataRows(el)[0].click();
      key(dataRows(el)[0], 'Enter');
      expect(out.rowActivate).toEqual([]);
    });

    it('[EP00-TBR-004-CA3] the Tab order is search box, sortable headers, then rows', () => {
      const { el } = render({ rows: makeRows(2), rowsActivatable: true });
      const order = tabbables(el);
      const at = (n: HTMLElement | null) => order.indexOf(n as HTMLElement);
      const search = at(searchBox(el));
      const price = at(headerControl(header(el, 'Precio')));
      const firstRow = at(dataRows(el)[0]);
      expect(search).toBeGreaterThanOrEqual(0);
      expect(search).toBeLessThan(price);
      expect(price).toBeLessThan(firstRow);
    });

    it('[EP00-TBR-004-CA3] a long text keeps its full value in the DOM (the ellipsis is only visual, edge case 6)', () => {
      const long = 'Producto sintético con un nombre muy largo '.repeat(8).trim();
      const rows = makeRows(1);
      rows[0].name = long;
      const { el } = render({ rows });
      expect(cellsOf(dataRows(el)[0])[0].textContent?.trim()).toBe(long);
    });

    it('[EP00-TBR-004-CA3] status cells carry their word, so the color is never alone', () => {
      const rows = makeRows(2);
      rows[1].status = 'WITH_ERROR';
      const { el } = render({ rows });
      expect(cellsOf(dataRows(el)[0])[5].textContent?.trim()).toBe('Vigente');
      expect(cellsOf(dataRows(el)[1])[5].textContent?.trim()).toBe('Con error');
    });

    it('[EP00-TBR-004-CA3] renders no hand-written color', () => {
      const { el } = render({ rows: makeRows(2), filtersActive: true });
      expect(el.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    });
  });
}

describe('[EP00-TBR-004-CA2][EP00-TBR-004-CA4] TbDataTable with values of the wrong kind (H2)', () => {
  it('[EP00-TBR-004-CA2] a date column that receives a number shows «—» without throwing, and the other rows still render', () => {
    const rows = makeRows(3);
    const columns: TbColumn<Row>[] = [
      COLUMNS[0],
      {
        id: 'updated',
        header: 'Actualizado',
        type: 'date',
        value: (r: Row) => (r.id === rows[1].id ? 20261009 : r.updated),
      },
    ];
    let el!: HTMLElement;
    expect(() => (el = render({ rows, columns }).el)).not.toThrow();
    expect(dataRows(el)).toHaveLength(3);
    expect(dataRows(el).map((r) => cellsOf(r)[1].textContent?.trim())).toEqual(['9 oct', DASH, '9 oct']);
    expect(dataRows(el).map((r) => cellsOf(r)[0].textContent?.trim())).toEqual(rows.map((r) => r.name));
  });

  it('[EP00-TBR-004-CA2] a status column with a value outside the list shows «—» without throwing, and the other rows still render', () => {
    const rows = makeRows(3);
    rows[1].status = 'ARCHIVED_SYNTHETIC';
    let el!: HTMLElement;
    expect(() => (el = render({ rows }).el)).not.toThrow();
    expect(dataRows(el)).toHaveLength(3);
    expect(dataRows(el).map((r) => cellsOf(r)[5].textContent?.trim())).toEqual(['Vigente', DASH, 'Vigente']);
    expect(cellsOf(dataRows(el)[1])[5].textContent).not.toContain('ARCHIVED_SYNTHETIC');
  });
});

describe('[EP00-TBR-004-CA2] TbColumn type is a closed union (H4)', () => {
  it('[EP00-TBR-004-CA2] a misspelled column type does not compile', () => {
    const misspelled: TbColumn<Row> = {
      id: 'price',
      header: 'Precio',
      // @ts-expect-error H4: «mony» is not a column type; with an open string type it would compile and show the raw number.
      type: 'mony',
      value: (r: Row) => r.price,
    };
    expect(misspelled.id).toBe('price');
  });
});

describe('[EP00-TBR-004-CA4] TbDataTable draws the rows it receives (H5)', () => {
  // Synthetic rows with shuffled prices and names, so any sort or filter would change the order or the count.
  const shuffled = (n: number): Row[] =>
    makeRows(n).map((r, i) => ({ ...r, name: `Producto ${(i * 17) % n}`, price: ((i * 31) % n) * 1000 }));

  it('[EP00-TBR-004-CA4] 41 rows with count=120 draw 41 rows in the order received, and the footer says 120', () => {
    const rows = shuffled(41);
    const { el } = render({ rows, count: 120 });
    expect(dataRows(el)).toHaveLength(41);
    expect(dataRows(el).map((r) => cellsOf(r)[0].textContent?.trim())).toEqual(rows.map((r) => r.name));
    expect(footerText(el)).toContain('120 productos');
  });

  it('[EP00-TBR-004-CA4] a sort, active filters and a search term do not sort, filter or page the rows', () => {
    const rows = shuffled(41);
    const { el } = render({
      rows,
      count: 120,
      sort: { columnId: 'price', direction: 'desc' },
      filtersActive: true,
      searchTerm: 'Producto 3',
    });
    expect(dataRows(el)).toHaveLength(41);
    expect(dataRows(el).map((r) => cellsOf(r)[0].textContent?.trim())).toEqual(rows.map((r) => r.name));
  });
});

// [EP00-TBR-004-CA1] H1: fidelity with the v6 anatomy (src/ui/docs/components.css and the c-DataTable section of the
// reference). jsdom does not lay out, so these tests read the CSS the pieces declare (their styles: metadata) and resolve
// it for an element with a small cascade: inline style first, then the matching rule with the highest specificity.
interface CssRule {
  readonly selectors: readonly string[];
  readonly decls: ReadonlyMap<string, string>;
}

function componentRules(...types: unknown[]): CssRule[] {
  const css = types
    .flatMap((t) => (t as Record<string, { styles?: readonly string[] } | undefined>)['ɵcmp']?.styles ?? [])
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    if (prelude.startsWith('@')) {
      // Drop @media and @keyframes blocks: only the base rules count.
      let depth = 1;
      let j = open + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      i = j;
      continue;
    }
    const close = css.indexOf('}', open);
    const decls = new Map<string, string>();
    for (const decl of css.slice(open + 1, close).split(';')) {
      const at = decl.indexOf(':');
      if (at > 0) decls.set(decl.slice(0, at).trim().toLowerCase(), decl.slice(at + 1).trim());
    }
    rules.push({ selectors: prelude.split(',').map((s) => s.trim()), decls });
    i = close + 1;
  }
  return rules;
}

function specificity(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) ?? []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  const types = (selector.match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return ids * 10_000 + classes * 100 + types;
}

// The compiled styles carry a %NS% placeholder inside custom property names (var(--%NS%spacing-3)); it is removed.
const normalize = (v: string) =>
  v.replace(/%ns%/gi, '').replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').trim().toLowerCase();

function declared(el: Element, prop: string, rules: readonly CssRule[]): string | null {
  const inline = (el as HTMLElement).style?.getPropertyValue(prop);
  if (inline) return normalize(inline);
  let best: { spec: number; value: string } | null = null;
  for (const rule of rules) {
    const value = rule.decls.get(prop);
    if (value === undefined) continue;
    for (const selector of rule.selectors) {
      let hit = false;
      try {
        hit = el.matches(selector);
      } catch {
        hit = false; // pseudo-elements and selectors jsdom cannot match
      }
      const spec = specificity(selector);
      if (hit && (!best || spec >= best.spec)) best = { spec, value };
    }
  }
  return best ? normalize(best.value) : null;
}

@Component({
  selector: 'tb-data-table-actions-host',
  imports: [TbDataTable],
  template: `
    <tb-data-table
      title="Productos"
      [columns]="columns"
      [rows]="rows"
      [rowKey]="rowKey"
      state="ready"
      searchLabel="Buscar productos"
      [itemLabel]="itemLabel"
      loadingLabel="Cargando productos"
      [texts]="texts"
    >
      <button tbActions type="button" id="caller-action">Nuevo producto</button>
    </tb-data-table>
  `,
})
class ActionsHost {
  columns = COLUMNS;
  rows = makeRows(2);
  rowKey = (r: Row) => r.id;
  itemLabel = { one: 'producto', other: 'productos' };
  texts = TEXTS;
}

describe('[EP00-TBR-004-CA1] TbDataTable follows the v6 anatomy (H1)', () => {
  it('[EP00-TBR-004-CA1] the card header is .tb-sec with an h2 title and the caller actions in .tools (not .tb-dt-head with h3)', () => {
    const fixture = TestBed.createComponent(ActionsHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const sec = el.querySelector('.tb-sec') as HTMLElement | null;
    expect(sec).not.toBeNull();
    expect(sec!.querySelector('h2')?.textContent?.trim()).toBe('Productos');
    expect(sec!.querySelector('.tools #caller-action')).not.toBeNull();
    expect(el.querySelector('.tb-dt-head')).toBeNull();
    expect(el.querySelector('h3')).toBeNull();
  });

  it('[EP00-TBR-004-CA1] .tb-sec declares the v6 padding, gap and border, and its h2 the v6 font', () => {
    const { el } = render({ rows: makeRows(2) });
    const rules = componentRules(TbIcon, TbDataTable);
    const sec = el.querySelector('.tb-sec') as HTMLElement | null;
    expect(sec).not.toBeNull();
    expect(declared(sec!, 'padding', rules)).toBe('var(--spacing-3) var(--spacing-4)');
    expect(declared(sec!, 'gap', rules)).toBe('var(--spacing-3)');
    expect(declared(sec!, 'justify-content', rules)).toBe('space-between');
    expect(declared(sec!, 'border-bottom', rules)).toBe('1px solid var(--color-line)');
    expect(declared(sec!.querySelector('h2')!, 'font', rules)).toBe('600 14px/20px var(--font-sans)');
  });

  it('[EP00-TBR-004-CA1] the icon of a sortable column header measures 12 px (.th .tb-ico)', () => {
    const { el } = render({ rows: makeRows(2) });
    const rules = componentRules(TbIcon, TbDataTable);
    const icon = headerControl(header(el, 'Precio')).querySelector('.tb-ico');
    expect(icon).not.toBeNull();
    expect(declared(icon!, 'width', rules)).toBe('12px');
    expect(declared(icon!, 'height', rules)).toBe('12px');
  });

  it('[EP00-TBR-004-CA1] the footer declares the v6 padding (10px space-4) and gap (space-4)', () => {
    const { el } = render({ rows: makeRows(41), note: 'Precios sin impuestos' });
    const rules = componentRules(TbIcon, TbDataTable);
    const count = Array.from(el.querySelectorAll('span')).find((s) => s.textContent?.trim() === '41 productos');
    expect(count).toBeDefined();
    const foot = count!.parentElement as HTMLElement;
    expect(declared(foot, 'padding', rules)).toBe('10px var(--spacing-4)');
    expect(declared(foot, 'gap', rules)).toBe('var(--spacing-4)');
    expect(declared(foot, 'justify-content', rules)).toBe('space-between');
  });

  it('[EP00-TBR-004-CA1] the cascade helper resolves inline style and specificity (self-check)', () => {
    const rules = componentRules(TbIcon);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tb-ico s14');
    expect(declared(svg, 'width', rules)).toBe('14px');
    svg.setAttribute('class', 'tb-ico');
    expect(declared(svg, 'width', rules)).toBe('16px');
    const div = document.createElement('div');
    div.style.setProperty('width', '70%');
    expect(declared(div, 'width', rules)).toBe('70%');
    expect(normalize('var(--%NS%spacing-3)  var(--%NS%spacing-4)')).toBe('var(--spacing-3) var(--spacing-4)');
  });
});

@Component({
  selector: 'tb-data-table-cell-host',
  imports: [TbDataTable, TbCellDef],
  template: `
    <tb-data-table
      title="Productos"
      [columns]="columns"
      [rows]="rows"
      [rowKey]="rowKey"
      state="ready"
      searchLabel="Buscar productos"
      [itemLabel]="itemLabel"
      loadingLabel="Cargando productos"
      [texts]="texts"
    >
      <ng-template tbCell="name"><span class="custom-cell">Celda propia</span></ng-template>
    </tb-data-table>
  `,
})
class CellDefHost {
  columns = COLUMNS;
  rows = makeRows(2);
  rowKey = (r: Row) => r.id;
  itemLabel = { one: 'producto', other: 'productos' };
  texts = TEXTS;
}

describe('[EP00-TBR-004-CA4] TbDataTable custom cell', () => {
  it('[EP00-TBR-004-CA4] an ng-template tbCell="<columnId>" replaces the cells of that column', () => {
    const fixture = TestBed.createComponent(CellDefHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const rows = dataRows(el);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(cellsOf(row)[0].querySelector('.custom-cell')?.textContent).toBe('Celda propia');
      expect(cellsOf(row)[1].textContent?.trim()).toBe('$1,850,000');
    }
  });
});

describe('[EP00-TBR-004-CA1] design system public API (src/ui/index.ts)', () => {
  it('[EP00-TBR-004-CA1] exports the pieces, the formats, the pipes and the clock', () => {
    const names = Object.keys(publicApi);
    const expected = [
      'TbButton',
      'TbFilterSelect',
      'TbTabs',
      'TbDataTable',
      'TbCellDef',
      'TbEmptyState',
      'TbBanner',
      'TbStatus',
      'TbBadge',
      'TbSkeleton',
      'formatMoney',
      'formatQuantity',
      'formatPercent',
      'formatDate',
      'NULL_DISPLAY',
      'TB_CLOCK',
      'TbMoneyPipe',
      'TbQuantityPipe',
      'TbPercentPipe',
      'TbDatePipe',
    ];
    for (const name of expected) expect(names).toContain(name);
  });

  it('[EP00-TBR-004-CA1] does not export the internal icon, the loading phase helper, the inner search box or a Chip', () => {
    const names = Object.keys(publicApi);
    expect(names.filter((n) => /icon|loadingphase|chip|search/i.test(n))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// [EP00-TBR-003-CA2][EP00-TBR-003-CA3] Extensions G1 to G3 for the Catálogo screen (task T3, black box, before T4).
// Sources: docs/ui/EP00-TBR-003/index.html (states normal, pagina-2, ultima-pagina, cargando, vacio, error-validation)
// and propuesta.md §3 to §5; plan G1 to G4 in docs/estado/EP00-TBR-003.md.
// API proposed for the T4 contract:
//   G1 input searchable (boolean, default true). With false there is no .tb-filterbar, .tb-find nor search box, and
//      searchLabel is not needed. Angular has no conditionally required input, so the assumption is that searchLabel
//      becomes optional (input<string | undefined>) and the 004 callers keep passing it.
//   G2 content projection with the selector [tbFooter], inside the table footer. Without it the footer is the 004 one.
//      The approved UI has no list footer in loading, empty or error states, so the projected content follows the footer.
//   G3 TbTableText gains an optional secondaryActionLabel; the table forwards it to its EmptyState and emits
//      secondaryAction with the variant (TbEmptyVariant). Without it everything stays as in 004.
// The new members do not exist before T4. They are reached through setInput and outputOf() so that this file keeps
// compiling and the 004 tests above keep running; the new tests fail at runtime for the missing API.
// ---------------------------------------------------------------------------------------------------------------------
interface OutputLike<T> {
  subscribe(fn: (value: T) => void): unknown;
}

function outputOf<T>(component: unknown, name: string): OutputLike<T> | undefined {
  const candidate = (component as Record<string, unknown>)[name] as OutputLike<T> | undefined;
  return candidate && typeof candidate.subscribe === 'function' ? candidate : undefined;
}

const filterBar = (el: HTMLElement) => el.querySelector('.tb-filterbar');
const findBox = (el: HTMLElement) => el.querySelector('.tb-find');

describe('[EP00-TBR-003-CA3] G1 TbDataTable without search box (searchable)', () => {
  it('[EP00-TBR-003-CA3] by default the filter bar and the search box are there, as in 004', () => {
    const { el } = render({ rows: makeRows(2) });
    expect(filterBar(el)).not.toBeNull();
    expect(findBox(el)).not.toBeNull();
    expect(searchBox(el)).not.toBeNull();
  });

  it('[EP00-TBR-003-CA3] searchable=true behaves like the default', () => {
    const { el } = render({ rows: makeRows(2), searchable: true });
    expect(filterBar(el)).not.toBeNull();
    expect(findBox(el)).not.toBeNull();
    expect(searchBox(el)!.getAttribute('placeholder')).toBe('Buscar por nombre');
  });

  it('[EP00-TBR-003-CA3] searchable=false paints no filter bar, no search box and no text input', () => {
    const { el } = render({ rows: makeRows(2), searchable: false });
    expect(filterBar(el)).toBeNull();
    expect(findBox(el)).toBeNull();
    expect(el.querySelectorAll('input')).toHaveLength(0);
  });

  it('[EP00-TBR-003-CA3] searchable=false keeps the header, the rows and the footer', () => {
    const { el } = render({ rows: makeRows(20), searchable: false });
    expect(el.querySelector('.tb-sec h2')?.textContent?.trim()).toBe('Productos');
    expect(el.querySelector('[role="table"]')).not.toBeNull();
    expect(dataRows(el)).toHaveLength(20);
    expect(footerText(el)).toContain('20 productos');
  });

  it('[EP00-TBR-003-CA3] searchable=false hides «Limpiar filtros» of the bar even with filtersActive', () => {
    const { el } = render({ rows: makeRows(2), searchable: false, filtersActive: true });
    expect(buttonByText(el, 'Limpiar filtros')).toBeUndefined();
  });

  it('[EP00-TBR-003-CA3] searchable=false: the first tabbable is a sortable header, not a search box', () => {
    const { el } = render({ rows: makeRows(2), searchable: false, rowsActivatable: true });
    expect(tabbables(el)[0]).toBe(headerControl(header(el, 'Precio')));
  });

  it('[EP00-TBR-003-CA3] searchable=false does not need searchLabel (assumption: searchLabel becomes optional)', () => {
    const fixture = TestBed.createComponent(TbDataTable);
    const inputs: Record<string, unknown> = { ...DEFAULTS, rows: makeRows(2), searchable: false };
    delete inputs['searchLabel'];
    delete inputs['searchPlaceholder'];
    expect(() => {
      for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
      fixture.detectChanges();
    }).not.toThrow();
    const el = fixture.nativeElement as HTMLElement;
    expect(dataRows(el)).toHaveLength(2);
    expect(findBox(el)).toBeNull();
  });

  it('[EP00-TBR-003-CA3] searchable can be switched at runtime', () => {
    const { el, set } = render({ rows: makeRows(2), searchable: false });
    expect(findBox(el)).toBeNull();
    set({ searchable: true });
    expect(searchBox(el)).not.toBeNull();
  });

  it('[EP00-TBR-003-CA2] searchable=false keeps the error EmptyState with role="alert" and «Reintentar»', () => {
    const { el, out, sync } = render({ state: 'error', rows: [], searchable: false });
    const es = emptyState(el);
    expect(es).not.toBeNull();
    expect(roleOf(es!)).toBe('alert');
    buttonByText(es!, 'Reintentar')!.click();
    sync();
    expect(out.retry).toBe(1);
    expect(filterBar(el)).toBeNull();
  });
});

@Component({
  selector: 'tb-data-table-footer-host',
  imports: [TbDataTable],
  template: `
    <tb-data-table
      title="Productos"
      [columns]="columns"
      [rows]="rows"
      [rowKey]="rowKey"
      [state]="state"
      searchLabel="Buscar productos"
      [itemLabel]="itemLabel"
      loadingLabel="Cargando productos"
      [texts]="texts"
    >
      <div tbFooter id="caller-footer"><button type="button" id="caller-next">Siguiente</button></div>
    </tb-data-table>
  `,
})
class FooterHost {
  columns = COLUMNS;
  rows: Row[] = makeRows(20);
  rowKey = (r: Row) => r.id;
  state: 'loading' | 'ready' | 'error' | 'offline' | 'forbidden' = 'ready';
  itemLabel = { one: 'producto', other: 'productos' };
  texts = TEXTS;
}

function renderFooterHost(patch: Partial<Pick<FooterHost, 'rows' | 'state'>> = {}) {
  const fixture = TestBed.createComponent(FooterHost);
  Object.assign(fixture.componentInstance, patch);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('[EP00-TBR-003-CA3] G2 TbDataTable footer with projected content ([tbFooter])', () => {
  it('[EP00-TBR-003-CA3] the [tbFooter] content is rendered inside the table footer', () => {
    const { el } = renderFooterHost();
    const own = el.querySelector('#caller-footer') as HTMLElement | null;
    expect(own).not.toBeNull();
    const foot = own!.closest('footer');
    expect(foot).not.toBeNull();
    expect(foot!.closest('tb-data-table')).not.toBeNull();
  });

  it('[EP00-TBR-003-CA3] the [tbFooter] content is not in the card header nor in the tools slot', () => {
    const { el } = renderFooterHost();
    const own = el.querySelector('#caller-footer') as HTMLElement | null;
    expect(own).not.toBeNull();
    expect(own!.closest('.tb-sec')).toBeNull();
    expect(own!.closest('.tools')).toBeNull();
  });

  it('[EP00-TBR-003-CA3] the projected footer buttons are reachable with Tab after the sortable headers', () => {
    const { el } = renderFooterHost();
    const order = tabbables(el);
    const next = el.querySelector('#caller-next') as HTMLElement | null;
    expect(next).not.toBeNull();
    expect(order).toContain(next);
    expect(order.indexOf(headerControl(header(el, 'Precio')))).toBeLessThan(order.indexOf(next!));
  });

  for (const state of ['error', 'offline', 'forbidden'] as const) {
    it(`[EP00-TBR-003-CA2] state ${state} shows no [tbFooter] content (approved UI: error states have no list footer)`, () => {
      const { el } = renderFooterHost({ state, rows: [] });
      expect(emptyState(el)).not.toBeNull();
      expect(el.querySelector('#caller-footer')).toBeNull();
    });
  }

  it('[EP00-TBR-003-CA3] ready with zero rows (empty state) shows no [tbFooter] content (approved UI, «vacio»)', () => {
    const { el } = renderFooterHost({ rows: [] });
    expect(emptyState(el)).not.toBeNull();
    expect(el.querySelector('#caller-footer')).toBeNull();
  });

  it('[EP00-TBR-003-CA3] without projected content the footer is the 004 one: count and note, no buttons', () => {
    const { el } = render({ rows: makeRows(41), note: 'Precios sin impuestos' });
    const foot = el.querySelector('footer') as HTMLElement | null;
    expect(foot).not.toBeNull();
    const t = (foot!.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(t).toContain('41 productos');
    expect(t).toContain('Precios sin impuestos');
    expect(foot!.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('[EP00-TBR-003-CA3] G2 TbDataTable footer while loading (fake timers)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('[EP00-TBR-003-CA3] with the skeleton on screen there is no [tbFooter] content (approved UI, «cargando»)', () => {
    const { el, fixture } = renderFooterHost({ state: 'loading', rows: [] });
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(skeleton(el)).not.toBeNull();
    expect(el.querySelector('#caller-footer')).toBeNull();
  });
});

// Texts of the VALIDATION error of the approved UI (propuesta.md §3, question 12).
const VALIDATION_TEXTS = {
  ...TEXTS,
  error: {
    heading: 'No pudimos pedir esa página',
    message: 'Reintenta; si sigue igual, avisa al equipo técnico.',
    secondaryActionLabel: 'Ir a la primera página',
  },
};

const emptyLabels = (el: HTMLElement) =>
  Array.from(emptyState(el)?.querySelectorAll('button') ?? []).map((b) => b.textContent?.trim());

describe('[EP00-TBR-003-CA2] G3 TbDataTable secondary action in the error state', () => {
  it('[EP00-TBR-003-CA2] error with secondaryActionLabel shows «Reintentar» and then «Ir a la primera página» (ghost)', () => {
    const { el } = render({ state: 'error', rows: [], texts: VALIDATION_TEXTS });
    const es = emptyState(el)!;
    expect(roleOf(es)).toBe('alert');
    expect(es.textContent).toContain('No pudimos pedir esa página');
    expect(emptyLabels(el)).toEqual(['Reintentar', 'Ir a la primera página']);
    expect(buttonByText(es, 'Ir a la primera página')!.classList.contains('ghost')).toBe(true);
    expect(buttonByText(es, 'Reintentar')!.classList.contains('ghost')).toBe(false);
  });

  it('[EP00-TBR-003-CA2] the secondary action emits secondaryAction("error") and not retry', () => {
    const { fixture, el, out, sync } = render({ state: 'error', rows: [], texts: VALIDATION_TEXTS });
    const secondary = outputOf<unknown>(fixture.componentInstance, 'secondaryAction');
    expect(secondary).toBeDefined();
    const seen: unknown[] = [];
    secondary!.subscribe((v) => seen.push(v));
    const button = buttonByText(emptyState(el)!, 'Ir a la primera página');
    expect(button).toBeDefined();
    button!.click();
    sync();
    expect(seen).toEqual(['error']);
    expect(out.retry).toBe(0);
  });

  it('[EP00-TBR-003-CA2] with a secondary action, «Reintentar» still emits retry only', () => {
    const { fixture, el, out, sync } = render({ state: 'error', rows: [], texts: VALIDATION_TEXTS });
    const seen: unknown[] = [];
    outputOf<unknown>(fixture.componentInstance, 'secondaryAction')?.subscribe((v) => seen.push(v));
    expect(buttonByText(emptyState(el)!, 'Ir a la primera página')).toBeDefined();
    buttonByText(emptyState(el)!, 'Reintentar')!.click();
    sync();
    expect(out.retry).toBe(1);
    expect(seen).toEqual([]);
  });

  it('[EP00-TBR-003-CA2] without secondaryActionLabel the error state has only «Reintentar», as in 004', () => {
    const { el } = render({ state: 'error', rows: [] });
    expect(emptyLabels(el)).toEqual(['Reintentar']);
  });

  it('[EP00-TBR-003-CA2] INVALID_CURSOR: the error action label is replaced by «Ir a la primera página», a single action', () => {
    const texts = {
      ...TEXTS,
      error: {
        heading: 'Esa página ya no está disponible',
        message: 'Vuelve a la primera página.',
        actionLabel: 'Ir a la primera página',
      },
    };
    const { el, out, sync } = render({ state: 'error', rows: [], texts });
    expect(emptyLabels(el)).toEqual(['Ir a la primera página']);
    buttonByText(emptyState(el)!, 'Ir a la primera página')!.click();
    sync();
    expect(out.retry).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// [EP00-TBR-003-CA2][EP00-TBR-003-CA3] T4 contract, round 2 (decisions of the dev and the orchestrator, 2026-11-11):
//   1. TbTableText gains an optional actionVariant ('default' | 'primary'); the table forwards it to its EmptyState.
//      Without it everything stays as in 004. In the approved UI «Reintentar» (error) and «Ir a la primera página»
//      (invalid cursor) are primary; the secondary is always ghost.
//   2. Single count in the footer: with content projected in [tbFooter] the table does not paint its own count; the
//      footer shows only what the projected content brings. Without projection the footer is the 004 one.
//   3. A secondary action without a primary action is not painted.
// Texts are passed untyped through setInput so this file keeps compiling before T4 adds actionVariant to TbTableText.
// ---------------------------------------------------------------------------------------------------------------------
const lookOf = (b: HTMLElement | undefined) => ({
  btn: !!b?.classList.contains('tb-btn'),
  primary: !!b?.classList.contains('primary'),
  ghost: !!b?.classList.contains('ghost'),
});
const DEFAULT_LOOK = { btn: true, primary: false, ghost: false };
const PRIMARY_LOOK = { btn: true, primary: true, ghost: false };
const GHOST_LOOK = { btn: true, primary: false, ghost: true };

describe('[EP00-TBR-003-CA2] TbDataTable forwards actionVariant to its EmptyState', () => {
  it('[EP00-TBR-003-CA2] without actionVariant «Reintentar» is the 004 tb-btn (not primary, not ghost)', () => {
    const { el } = render({ state: 'error', rows: [] });
    expect(lookOf(buttonByText(emptyState(el)!, 'Reintentar'))).toEqual(DEFAULT_LOOK);
  });

  it('[EP00-TBR-003-CA2] error with actionVariant "primary": «Reintentar» is tb-btn primary (approved UI)', () => {
    const texts = { ...TEXTS, error: { ...TEXTS.error, actionVariant: 'primary' } };
    const { el, out, sync } = render({ state: 'error', rows: [], texts });
    const retry = buttonByText(emptyState(el)!, 'Reintentar');
    expect(lookOf(retry)).toEqual(PRIMARY_LOOK);
    retry!.click();
    sync();
    expect(out.retry).toBe(1);
  });

  it('[EP00-TBR-003-CA2] VALIDATION error with actionVariant "primary": «Reintentar» primary, «Ir a la primera página» ghost', () => {
    const texts = { ...VALIDATION_TEXTS, error: { ...VALIDATION_TEXTS.error, actionVariant: 'primary' } };
    const { el } = render({ state: 'error', rows: [], texts });
    expect(emptyLabels(el)).toEqual(['Reintentar', 'Ir a la primera página']);
    expect(lookOf(buttonByText(emptyState(el)!, 'Reintentar'))).toEqual(PRIMARY_LOOK);
    expect(lookOf(buttonByText(emptyState(el)!, 'Ir a la primera página'))).toEqual(GHOST_LOOK);
  });

  it('[EP00-TBR-003-CA2] INVALID_CURSOR with actionVariant "primary": «Ir a la primera página» is tb-btn primary', () => {
    const texts = {
      ...TEXTS,
      error: {
        heading: 'Esa página ya no está disponible',
        message: 'Vuelve a la primera página.',
        actionLabel: 'Ir a la primera página',
        actionVariant: 'primary',
      },
    };
    const { el } = render({ state: 'error', rows: [], texts });
    expect(emptyLabels(el)).toEqual(['Ir a la primera página']);
    expect(lookOf(buttonByText(emptyState(el)!, 'Ir a la primera página'))).toEqual(PRIMARY_LOOK);
  });

  it('[EP00-TBR-003-CA2] actionVariant "default" looks exactly like no actionVariant', () => {
    const texts = { ...TEXTS, error: { ...TEXTS.error, actionVariant: 'default' } };
    const plain = buttonByText(emptyState(render({ state: 'error', rows: [] }).el)!, 'Reintentar')!;
    const explicit = buttonByText(emptyState(render({ state: 'error', rows: [], texts }).el)!, 'Reintentar')!;
    expect(lookOf(explicit)).toEqual(DEFAULT_LOOK);
    expect(explicit.className).toBe(plain.className);
  });

  it('[EP00-TBR-003-CA2] actionVariant is per variant: primary on error does not change offline', () => {
    const texts = { ...TEXTS, error: { ...TEXTS.error, actionVariant: 'primary' } };
    const { el, set } = render({ state: 'error', rows: [], texts });
    expect(lookOf(buttonByText(emptyState(el)!, 'Reintentar'))).toEqual(PRIMARY_LOOK);
    set({ state: 'offline' });
    expect(lookOf(buttonByText(emptyState(el)!, 'Reintentar'))).toEqual(DEFAULT_LOOK);
  });

  it('[EP00-TBR-003-CA2] actionVariant "primary" on the empty variant applies to its own action label', () => {
    const texts = { ...TEXTS, empty: { ...TEXTS.empty, actionVariant: 'primary' } };
    const { el } = render({ state: 'ready', rows: [], texts });
    expect(lookOf(buttonByText(emptyState(el)!, 'Crear producto'))).toEqual(PRIMARY_LOOK);
  });
});

describe('[EP00-TBR-003-CA2] TbDataTable secondary action without primary action', () => {
  it('[EP00-TBR-003-CA2] forbidden with only secondaryActionLabel paints no button in the EmptyState', () => {
    const texts = { ...TEXTS, forbidden: { ...TEXTS.forbidden, secondaryActionLabel: 'Ir a la primera página' } };
    const { el } = render({ state: 'forbidden', rows: [], texts });
    expect(emptyState(el)).not.toBeNull();
    expect(emptyLabels(el)).toEqual([]);
  });

  it('[EP00-TBR-003-CA2] offline (default action «Reintentar») with secondaryActionLabel paints both, the secondary ghost', () => {
    const texts = { ...TEXTS, offline: { ...TEXTS.offline, secondaryActionLabel: 'Ir a la primera página' } };
    const { el } = render({ state: 'offline', rows: [], texts });
    expect(emptyLabels(el)).toEqual(['Reintentar', 'Ir a la primera página']);
    expect(lookOf(buttonByText(emptyState(el)!, 'Ir a la primera página'))).toEqual(GHOST_LOOK);
  });
});

const flat = (node: Element | null) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

@Component({
  selector: 'tb-data-table-count-footer-host',
  imports: [TbDataTable],
  template: `
    <tb-data-table
      title="Productos"
      [columns]="columns"
      [rows]="rows"
      [rowKey]="rowKey"
      state="ready"
      searchLabel="Buscar productos"
      [itemLabel]="itemLabel"
      loadingLabel="Cargando productos"
      [texts]="texts"
    >
      <div tbFooter id="caller-count"><span>Página 1 · 20 productos</span></div>
    </tb-data-table>
  `,
})
class CountFooterHost {
  columns = COLUMNS;
  rows: Row[] = makeRows(20);
  rowKey = (r: Row) => r.id;
  itemLabel = { one: 'producto', other: 'productos' };
  texts = TEXTS;
}

describe('[EP00-TBR-003-CA3] G2 TbDataTable single count in the footer (hallazgo 1)', () => {
  it('[EP00-TBR-003-CA3] with [tbFooter] content the table does not paint its own count', () => {
    const { el } = renderFooterHost();
    const foot = el.querySelector('footer');
    expect(foot).not.toBeNull();
    expect(foot!.querySelector('#caller-footer')).not.toBeNull();
    expect(flat(foot)).not.toContain('20 productos');
    expect(flat(foot)).toBe('Siguiente');
  });

  it('[EP00-TBR-003-CA3] with [tbFooter] content the footer shows the projected count once («Página 1 · 20 productos»)', () => {
    const fixture = TestBed.createComponent(CountFooterHost);
    fixture.detectChanges();
    const foot = (fixture.nativeElement as HTMLElement).querySelector('footer');
    expect(foot).not.toBeNull();
    expect(foot!.querySelector('#caller-count')).not.toBeNull();
    expect(flat(foot)).toBe('Página 1 · 20 productos');
    expect(flat(foot).match(/20 productos/g)).toHaveLength(1);
  });

  it('[EP00-TBR-003-CA3] without [tbFooter] content the footer keeps the 004 count', () => {
    const { el } = render({ rows: makeRows(20) });
    expect(flat(el.querySelector('footer'))).toBe('20 productos');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// [EP00-TBR-003-CA2][EP00-TBR-003-CA3] T4 contract, round 3 (option a approved by the dev, 2026-11-11; kit v6
// referencia.html «Tablas», approved UI docs/ui/EP00-TBR-003/index.html):
//   G5. TbTableText.actionLabel: null is forwarded to the EmptyState: no action, not even in error or offline.
//   G6. TbTableText.message is a text or a list of texts (one <p> each) and TbTableText.reference?: string paints the
//       last <p> «Referencia: <id>» with the id in .tb-num.
//   G7. stickyColumns: 0 | 1 | 2 (0 by default). 1 puts the kit class stick1 on .tb-hscroll; 2 puts stick1 and stick2.
//       With 2, the inline custom property --stick2 of .tb-hscroll is the first column track plus the column gap,
//       as the kit computes it (tpl[0] + columnGap); the gap of .tb-row is var(--spacing-3) = 12px, so a 104px track
//       gives 116px (the prototype value) and a 56px track gives 68px (the kit sample). If the first track is not in
//       px there is no inline --stick2 and the kit fallback var(--stick2, 68px) applies.
//   G8. density: 'default' | 'dense' ('default' by default, rows of var(--size-row) = 56px). 'dense' puts the kit class
//       dense on .tb-list (rows of 44px, padding 6px).
//   Without any of the new inputs the DOM is the 004 one (and rounds 1 and 2).
// New inputs and text fields are reached through setInput, untyped, so this file keeps compiling before T4.
// ---------------------------------------------------------------------------------------------------------------------
const SPACING_3_PX = 12;
const hscroll = (el: HTMLElement) => el.querySelector('.tb-hscroll') as HTMLElement | null;
const list = (el: HTMLElement) => el.querySelector('.tb-list') as HTMLElement | null;
const headRow = (el: HTMLElement) => el.querySelector('.tb-head-row') as HTMLElement;
const firstRow = (el: HTMLElement) => dataRows(el)[0];
const withFirstTrack = (track: string | undefined): TbColumn<Row>[] =>
  COLUMNS.map((c, i) => (i === 0 ? { ...c, track } : { ...c, track: c.track ?? '120px' }));

// --stick2 as px: accepts a px length or calc(<px> + var(--spacing-3)), the two forms of «track plus column gap».
function stick2Px(host: HTMLElement | null): number | null {
  const raw = normalize(host?.style.getPropertyValue('--stick2') ?? '');
  if (!raw) return null;
  const px = raw.match(/^(\d+(?:\.\d+)?)px$/);
  if (px) return Number(px[1]);
  const sum = raw.match(/^calc\((\d+(?:\.\d+)?)px \+ var\(--spacing-3\)\)$/);
  if (sum) return Number(sum[1]) + SPACING_3_PX;
  return Number.NaN;
}

describe('[EP00-TBR-003-CA3] G7 TbDataTable fixed columns (stickyColumns)', () => {
  it('[EP00-TBR-003-CA3] without stickyColumns .tb-hscroll has no stick class nor --stick2, as in 004', () => {
    const { el } = render({ rows: makeRows(3), columns: withFirstTrack('104px') });
    expect(Array.from(hscroll(el)!.classList)).toEqual(['tb-hscroll']);
    expect(hscroll(el)!.style.getPropertyValue('--stick2')).toBe('');
  });

  it('[EP00-TBR-003-CA3] stickyColumns 0 is the same as no stickyColumns', () => {
    const { el } = render({ rows: makeRows(3), columns: withFirstTrack('104px'), stickyColumns: 0 });
    expect(Array.from(hscroll(el)!.classList)).toEqual(['tb-hscroll']);
    expect(hscroll(el)!.style.getPropertyValue('--stick2')).toBe('');
  });

  it('[EP00-TBR-003-CA3] stickyColumns 1 puts stick1 on .tb-hscroll and not stick2', () => {
    const { el } = render({ rows: makeRows(3), columns: withFirstTrack('104px'), stickyColumns: 1 });
    expect(hscroll(el)!.classList.contains('stick1')).toBe(true);
    expect(hscroll(el)!.classList.contains('stick2')).toBe(false);
  });

  it('[EP00-TBR-003-CA3] stickyColumns 2 puts stick1 and stick2 on .tb-hscroll (approved UI)', () => {
    const { el } = render({ rows: makeRows(3), columns: withFirstTrack('104px'), stickyColumns: 2 });
    expect(hscroll(el)!.classList.contains('stick1')).toBe(true);
    expect(hscroll(el)!.classList.contains('stick2')).toBe(true);
  });

  it('[EP00-TBR-003-CA3] stickyColumns 2 with a 104px first track sets --stick2 to 116px (prototype value)', () => {
    const { el } = render({ rows: makeRows(3), columns: withFirstTrack('104px'), stickyColumns: 2 });
    expect(stick2Px(hscroll(el))).toBe(116);
  });

  it('[EP00-TBR-003-CA3] stickyColumns 2 with a 56px first track sets --stick2 to 68px (kit sample)', () => {
    const { el } = render({ rows: makeRows(3), columns: withFirstTrack('56px'), stickyColumns: 2 });
    expect(stick2Px(hscroll(el))).toBe(68);
  });

  it('[EP00-TBR-003-CA3] stickyColumns 2 with a first track not in px sets no --stick2 (kit fallback 68px)', () => {
    for (const track of [undefined, 'minmax(190px,1.3fr)']) {
      const { el } = render({ rows: makeRows(3), columns: withFirstTrack(track), stickyColumns: 2 });
      expect(hscroll(el)!.classList.contains('stick2')).toBe(true);
      expect(hscroll(el)!.style.getPropertyValue('--stick2')).toBe('');
    }
  });

  it('[EP00-TBR-003-CA3] stick1 makes the first header and row cells sticky at left 0 on the surface', () => {
    const { el } = render({ rows: makeRows(3), columns: withFirstTrack('104px'), stickyColumns: 1 });
    const rules = componentRules(TbIcon, TbDataTable);
    for (const cell of [headRow(el).children[0], firstRow(el).children[0]]) {
      expect(declared(cell, 'position', rules)).toBe('sticky');
      expect(declared(cell, 'left', rules)).toBe('0');
      expect(declared(cell, 'z-index', rules)).toBe('2');
      expect(declared(cell, 'background', rules)).toBe('var(--color-surface)');
      expect(declared(cell, 'box-shadow', rules)).toBe('1px 0 0 var(--color-line)');
    }
    expect(declared(firstRow(el).children[1], 'position', rules)).not.toBe('sticky');
  });

  it('[EP00-TBR-003-CA3] stick2 makes the second cells sticky at var(--stick2, 68px) with the divider on the second', () => {
    const { el } = render({ rows: makeRows(3), columns: withFirstTrack('104px'), stickyColumns: 2 });
    const rules = componentRules(TbIcon, TbDataTable);
    for (const row of [headRow(el), firstRow(el)]) {
      const [first, second] = [row.children[0], row.children[1]];
      expect(declared(first, 'position', rules)).toBe('sticky');
      expect(declared(first, 'left', rules)).toBe('0');
      expect(declared(first, 'box-shadow', rules)).toBeNull();
      expect(declared(second, 'position', rules)).toBe('sticky');
      expect(declared(second, 'left', rules)).toBe('var(--stick2, 68px)');
      expect(declared(second, 'z-index', rules)).toBe('2');
      expect(declared(second, 'background', rules)).toBe('var(--color-surface)');
      expect(declared(second, 'box-shadow', rules)).toBe('1px 0 0 var(--color-line)');
    }
    expect(declared(firstRow(el).children[2], 'position', rules)).not.toBe('sticky');
  });

  it('[EP00-TBR-003-CA3] without stickyColumns no cell is sticky, as in 004', () => {
    const { el } = render({ rows: makeRows(3), columns: withFirstTrack('104px') });
    const rules = componentRules(TbIcon, TbDataTable);
    for (const cell of [headRow(el).children[0], firstRow(el).children[0], firstRow(el).children[1]]) {
      expect(declared(cell, 'position', rules)).not.toBe('sticky');
    }
  });

  it('[EP00-TBR-003-CA3] stickyColumns can be switched at runtime: 2, 0', () => {
    const { el, set } = render({ rows: makeRows(3), columns: withFirstTrack('104px'), stickyColumns: 2 });
    expect(stick2Px(hscroll(el))).toBe(116);
    set({ stickyColumns: 0 });
    expect(Array.from(hscroll(el)!.classList)).toEqual(['tb-hscroll']);
    expect(hscroll(el)!.style.getPropertyValue('--stick2')).toBe('');
  });

  it('[EP00-TBR-003-CA3] stickyColumns does not change roles, row count nor cell texts', () => {
    const plain = render({ rows: makeRows(3), columns: withFirstTrack('104px') }).el;
    const fixed = render({ rows: makeRows(3), columns: withFirstTrack('104px'), stickyColumns: 2 }).el;
    expect(hscroll(fixed)!.classList.contains('stick2')).toBe(true);
    expect(dataRows(fixed)).toHaveLength(3);
    expect(headers(fixed).map((h) => h.textContent?.trim())).toEqual(headers(plain).map((h) => h.textContent?.trim()));
    expect(dataRows(fixed).map((r) => flat(r))).toEqual(dataRows(plain).map((r) => flat(r)));
  });
});

describe('[EP00-TBR-003-CA3] G8 TbDataTable compact rows (density)', () => {
  it('[EP00-TBR-003-CA3] without density .tb-list has no dense class and rows of var(--size-row), as in 004', () => {
    const { el } = render({ rows: makeRows(3) });
    const rules = componentRules(TbIcon, TbDataTable);
    expect(list(el)!.classList.contains('dense')).toBe(false);
    expect(declared(firstRow(el), 'min-height', rules)).toBe('var(--size-row)');
    expect(declared(firstRow(el), 'padding-top', rules)).toBe('10px');
  });

  it('[EP00-TBR-003-CA3] density "default" is the same as no density', () => {
    const { el } = render({ rows: makeRows(3), density: 'default' });
    const rules = componentRules(TbIcon, TbDataTable);
    expect(list(el)!.classList.contains('dense')).toBe(false);
    expect(declared(firstRow(el), 'min-height', rules)).toBe('var(--size-row)');
  });

  it('[EP00-TBR-003-CA3] density "dense" puts the kit class dense on .tb-list (approved UI)', () => {
    const { el } = render({ rows: makeRows(3), density: 'dense' });
    expect(list(el)!.classList.contains('dense')).toBe(true);
    expect(list(el)!.getAttribute('role')).toBe('table');
  });

  it('[EP00-TBR-003-CA3] dense rows declare the kit 44px min-height and 6px vertical padding', () => {
    const { el } = render({ rows: makeRows(3), density: 'dense' });
    const rules = componentRules(TbIcon, TbDataTable);
    for (const row of dataRows(el)) {
      expect(declared(row, 'min-height', rules)).toBe('44px');
      expect(declared(row, 'padding-top', rules)).toBe('6px');
      expect(declared(row, 'padding-bottom', rules)).toBe('6px');
    }
  });

  it('[EP00-TBR-003-CA3] density can be switched at runtime: dense, default', () => {
    const { el, set } = render({ rows: makeRows(3), density: 'dense' });
    expect(list(el)!.classList.contains('dense')).toBe(true);
    set({ density: 'default' });
    expect(list(el)!.classList.contains('dense')).toBe(false);
  });

  it('[EP00-TBR-003-CA3] dense and stickyColumns 2 together, as in the approved UI', () => {
    const { el } = render({ rows: makeRows(3), columns: withFirstTrack('104px'), stickyColumns: 2, density: 'dense' });
    expect(hscroll(el)!.classList.contains('stick1')).toBe(true);
    expect(hscroll(el)!.classList.contains('stick2')).toBe(true);
    expect(stick2Px(hscroll(el))).toBe(116);
    expect(list(el)!.classList.contains('dense')).toBe(true);
    expect(dataRows(el)).toHaveLength(3);
  });
});

describe('[EP00-TBR-003-CA3] round 3 compatibility: without the new inputs the DOM is the 004 one', () => {
  it('[EP00-TBR-003-CA3] stickyColumns 0 and density "default" give the same DOM as no new input', () => {
    const plain = render({ rows: makeRows(3), columns: withFirstTrack('104px') }).el;
    const explicit = render({ rows: makeRows(3), columns: withFirstTrack('104px'), stickyColumns: 0, density: 'default' }).el;
    expect(explicit.innerHTML).toBe(plain.innerHTML);
  });

  it('[EP00-TBR-003-CA3] .tb-hscroll and .tb-list keep exactly their 004 classes', () => {
    const { el } = render({ rows: makeRows(3) });
    expect(Array.from(hscroll(el)!.classList)).toEqual(['tb-hscroll']);
    expect(Array.from(list(el)!.classList)).toEqual(['tb-list']);
  });
});

const NOT_FOUND_TEXTS = {
  ...TEXTS,
  error: {
    heading: 'No encontramos el catálogo',
    message: ['No existe el recurso pedido.', 'Vuelve a abrirlo desde el menú.'],
    reference: 'c-demo-0003',
    actionLabel: null,
  },
};
const emptyParagraphs = (el: HTMLElement) =>
  Array.from(emptyState(el)?.querySelectorAll('p') ?? []).map((p) => flat(p));

describe('[EP00-TBR-003-CA2] G5 TbDataTable forwards actionLabel null to its EmptyState', () => {
  it('[EP00-TBR-003-CA2] error with actionLabel null shows the EmptyState with role="alert" and no button', () => {
    const texts = { ...TEXTS, error: { ...TEXTS.error, actionLabel: null } };
    const { el } = render({ state: 'error', rows: [], texts });
    const es = emptyState(el)!;
    expect(es).not.toBeNull();
    expect(roleOf(es)).toBe('alert');
    expect(es.textContent).toContain(TEXTS.error.heading);
    expect(emptyLabels(el)).toEqual([]);
    expect(es.querySelector('.acts')).toBeNull();
  });

  it('[EP00-TBR-003-CA2] offline with actionLabel null shows no button', () => {
    const texts = { ...TEXTS, offline: { ...TEXTS.offline, actionLabel: null } };
    const { el } = render({ state: 'offline', rows: [], texts });
    expect(emptyState(el)).not.toBeNull();
    expect(emptyLabels(el)).toEqual([]);
  });

  it('[EP00-TBR-003-CA2] actionLabel null with secondaryActionLabel shows no button either', () => {
    const texts = { ...TEXTS, error: { ...VALIDATION_TEXTS.error, actionLabel: null } };
    const { el } = render({ state: 'error', rows: [], texts });
    expect(emptyState(el)).not.toBeNull();
    expect(emptyLabels(el)).toEqual([]);
  });

  it('[EP00-TBR-003-CA2] without actionLabel the error keeps «Reintentar», as in 004', () => {
    const { el } = render({ state: 'error', rows: [] });
    expect(emptyLabels(el)).toEqual(['Reintentar']);
  });
});

describe('[EP00-TBR-003-CA2] G6 TbDataTable forwards several paragraphs and the reference', () => {
  it('[EP00-TBR-003-CA2] NOT_FOUND of the approved UI: two paragraphs, «Referencia: c-demo-0003» and no action', () => {
    const { el } = render({ state: 'error', rows: [], texts: NOT_FOUND_TEXTS });
    expect(roleOf(emptyState(el)!)).toBe('alert');
    expect(emptyParagraphs(el)).toEqual([
      'No existe el recurso pedido.',
      'Vuelve a abrirlo desde el menú.',
      'Referencia: c-demo-0003',
    ]);
    expect(emptyState(el)!.querySelector('p:last-of-type .tb-num')?.textContent?.trim()).toBe('c-demo-0003');
    expect(emptyLabels(el)).toEqual([]);
  });

  it('[EP00-TBR-003-CA2] UNAVAILABLE of the approved UI: two paragraphs, reference and «Reintentar» primary', () => {
    const texts = {
      ...TEXTS,
      error: {
        heading: 'No pudimos cargar el catálogo',
        message: ['El servicio no está disponible por ahora.', 'Reintenta; si sigue igual, avisa al equipo técnico.'],
        reference: 'c-demo-0001',
        actionVariant: 'primary',
      },
    };
    const { el, out, sync } = render({ state: 'error', rows: [], texts });
    expect(emptyParagraphs(el)).toEqual([
      'El servicio no está disponible por ahora.',
      'Reintenta; si sigue igual, avisa al equipo técnico.',
      'Referencia: c-demo-0001',
    ]);
    expect(lookOf(buttonByText(emptyState(el)!, 'Reintentar'))).toEqual(PRIMARY_LOOK);
    buttonByText(emptyState(el)!, 'Reintentar')!.click();
    sync();
    expect(out.retry).toBe(1);
  });

  it('[EP00-TBR-003-CA2] forbidden with a reference keeps role="status" (approved UI, sin-permisos)', () => {
    const texts = {
      ...TEXTS,
      forbidden: {
        heading: 'Tu perfil no puede ver el catálogo',
        message: ['No tienes permiso para esta consulta.', 'Pide acceso a quien administra tu perfil.'],
        reference: 'c-demo-0004',
      },
    };
    const { el } = render({ state: 'forbidden', rows: [], texts });
    expect(roleOf(emptyState(el)!)).toBe('status');
    expect(emptyParagraphs(el)).toEqual([
      'No tienes permiso para esta consulta.',
      'Pide acceso a quien administra tu perfil.',
      'Referencia: c-demo-0004',
    ]);
  });

  it('[EP00-TBR-003-CA2] a text message without reference stays a single paragraph, as in 004', () => {
    const { el } = render({ state: 'error', rows: [] });
    expect(emptyParagraphs(el)).toEqual([TEXTS.error.message]);
    expect(emptyState(el)!.querySelector('.tb-num')).toBeNull();
  });
});

// [EP00-TBR-003-CA1] Mono columns (approved by Elkin, option a): TbColumn gains mono?: boolean. With true, the cells of
// that column (not its header) carry the kit class tb-num (font-family var(--font-mono), tabular-nums); the value is
// shown as it comes, as text and without number format. Without mono the DOM is the 004 one. The .tb-num rule must be
// declared by tb-data-table itself, not borrowed from another component. Synthetic codes only.
// The columns are cast so this file still compiles before mono exists in TbColumn: the tests then fail on the DOM.
interface CodeRow {
  id: string;
  code: string | null;
  name: string;
}

const CODE_ROWS: CodeRow[] = [
  { id: 'c-1', code: '0001234567890', name: 'Producto sintético 1' },
  { id: 'c-2', code: 'SYN-000042', name: 'Producto sintético 2' },
];

const codeColumns = (mono?: boolean): TbColumn<CodeRow>[] => [
  {
    id: 'code',
    header: 'Código',
    type: 'text',
    value: (r: CodeRow) => r.code,
    ...(mono === undefined ? {} : { mono }),
  } as TbColumn<CodeRow>,
  { id: 'name', header: 'Nombre', type: 'text', value: (r: CodeRow) => r.name },
];

const renderCodes = (mono?: boolean, rows: CodeRow[] = CODE_ROWS) =>
  render({ rows, columns: codeColumns(mono), rowKey: (r: CodeRow) => r.id });

// The tb-num element of a cell: the cell itself or an element inside it.
const monoOf = (cell: HTMLElement) =>
  cell.classList.contains('tb-num') ? cell : (cell.querySelector<HTMLElement>('.tb-num') ?? null);

describe('[EP00-TBR-003-CA1] TbDataTable mono columns (tb-num)', () => {
  it('[EP00-TBR-003-CA1] mono: true puts tb-num on every cell of that column', () => {
    const { el } = renderCodes(true);
    const rows = dataRows(el);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(monoOf(cellsOf(row)[0])).not.toBeNull();
  });

  it('[EP00-TBR-003-CA1] mono: true does not put tb-num on the header nor on the other columns', () => {
    const { el } = renderCodes(true);
    const head = header(el, 'Código');
    expect(head.classList.contains('tb-num') || !!head.querySelector('.tb-num')).toBe(false);
    for (const row of dataRows(el)) expect(monoOf(cellsOf(row)[1])).toBeNull();
  });

  it('[EP00-TBR-003-CA1] a mono cell shows the value as it comes, as text and without number format', () => {
    const { el } = renderCodes(true);
    const cells = dataRows(el).map((r) => cellsOf(r)[0]);
    expect(monoOf(cells[0])?.textContent?.trim()).toBe('0001234567890');
    expect(cells[0].textContent?.trim()).toBe('0001234567890');
    expect(cells[1].textContent?.trim()).toBe('SYN-000042');
    expect(isNum(cells[0])).toBe(false);
  });

  it('[EP00-TBR-003-CA1] an empty value in a mono column shows «—» without throwing, and the other rows keep tb-num', () => {
    const rows = [{ ...CODE_ROWS[0], code: null }, CODE_ROWS[1]];
    let el!: HTMLElement;
    expect(() => (el = renderCodes(true, rows).el)).not.toThrow();
    expect(cellsOf(dataRows(el)[0])[0].textContent?.trim()).toBe(DASH);
    expect(monoOf(cellsOf(dataRows(el)[1])[0])).not.toBeNull();
  });

  it('[EP00-TBR-003-CA1] tb-data-table declares its own .tb-num rule with the mono font and tabular figures', () => {
    const { el } = renderCodes(true);
    const rules = componentRules(TbDataTable);
    expect(rules.some((r) => r.selectors.some((s) => /\.tb-num\b/.test(s)))).toBe(true);
    const mono = monoOf(cellsOf(dataRows(el)[0])[0]);
    expect(mono).not.toBeNull();
    expect(declared(mono!, 'font-family', rules)).toBe('var(--font-mono)');
    expect(declared(mono!, 'font-variant-numeric', rules)).toBe('tabular-nums');
  });

  it('[EP00-TBR-003-CA1] without mono there is no tb-num in the table (004 compatibility)', () => {
    expect(renderCodes().el.querySelector('.tb-num')).toBeNull();
    expect(render({ rows: makeRows(3) }).el.querySelector('.tb-num')).toBeNull();
  });

  it('[EP00-TBR-003-CA1] mono: false paints the same DOM as no mono (004 compatibility)', () => {
    expect(renderCodes(false).el.innerHTML).toBe(renderCodes().el.innerHTML);
  });

  it('[EP00-TBR-003-CA1] mono: true only adds tb-num: the text of every cell is the same as without mono', () => {
    const texts = (host: HTMLElement) =>
      dataRows(host).map((r) => cellsOf(r).map((c) => c.textContent?.trim()));
    expect(texts(renderCodes(true).el)).toEqual(texts(renderCodes().el));
  });
});
