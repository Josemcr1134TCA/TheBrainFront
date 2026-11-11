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
import { TbCellDef, TbDataTable } from './data-table';

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

const COLUMNS = [
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
