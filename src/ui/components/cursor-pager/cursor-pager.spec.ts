// [EP00-TBR-003-CA3] PZ-23 TbCursorPager: cursor pager approved on 2026-11-11 (Mariana, delegated by the PO).
// Black-box tests written before the piece exists (task T3). Sources: docs/ui/EP00-TBR-003/index.html (footers of the
// states normal, pagina-2 and ultima-pagina) and propuesta.md §1, §2 (CA3), §4 and §5 (PZ-23).
// Approved shape: left «Página n · N productos»; right «Primera página» and «Anterior» (ghost, only from page 2) and
// «Siguiente» (tb-btn, as in the prototype, with chevron-right after the text and aria-label «Página siguiente»); on the
// last page «Siguiente» is disabled with title «No hay más productos» (D-044). «Anterior» has no icon (v6 has no
// chevron-left). The pager does not know cursors: it shows the page number the caller gives and emits first, previous
// and next (the view keeps the cursor stack, DEC-0012).
// API proposed for the T4 contract: inputs page (number >= 1), hasNext (boolean), count (items on this page),
// itemLabel (TbItemLabel); outputs first, previous, next. Exported from src/ui/index.ts.
// Synthetic data only.
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as publicApi from '../../index';
import { TbDataTable } from '../data-table/data-table';
import { TbCursorPager } from './cursor-pager';

const THEMES = ['light', 'dark'] as const;
const PRODUCTS = { one: 'producto', other: 'productos' };
// Stroke of chevron-right in the v6 icon vocabulary (docs/ui/EP00-TBR-003/index.html, icon table).
const CHEVRON_RIGHT = 'm9 18 6-6-6-6';
const CHEVRON_LEFT_LIKE = /m15 18-6-6 6-6/;

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

interface Emitted {
  first: number;
  previous: number;
  next: number;
}

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(TbCursorPager);
  const all = { page: 1, hasNext: true, count: 20, itemLabel: PRODUCTS, ...inputs };
  for (const [k, v] of Object.entries(all)) fixture.componentRef.setInput(k, v);
  const out: Emitted = { first: 0, previous: 0, next: 0 };
  const c = fixture.componentInstance;
  c.first.subscribe(() => out.first++);
  c.previous.subscribe(() => out.previous++);
  c.next.subscribe(() => out.next++);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const set = (patch: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(patch)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
  };
  return { fixture, el, out, set };
}

const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll('button'));
const labels = (el: HTMLElement) => buttons(el).map((b) => b.textContent?.replace(/\s+/g, ' ').trim());
const byText = (el: HTMLElement, text: string) =>
  buttons(el).find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === text) as
    | HTMLButtonElement
    | undefined;
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
// The nav may be the host itself or an element inside it.
const nav = (el: HTMLElement): HTMLElement | null =>
  el.tagName === 'NAV' ? el : el.querySelector<HTMLElement>('nav');

for (const theme of THEMES) {
  describe(`[EP00-TBR-003-CA3] TbCursorPager PZ-23 (data-theme="${theme}")`, () => {
    beforeEach(() => document.documentElement.setAttribute('data-theme', theme));
    afterEach(() => document.documentElement.removeAttribute('data-theme'));

    it('[EP00-TBR-003-CA3] is a nav landmark with a Spanish aria-label', () => {
      const { el } = render({ page: 1 });
      const landmark = nav(el);
      expect(landmark).not.toBeNull();
      const label = landmark!.getAttribute('aria-label') ?? '';
      expect(label.trim()).not.toBe('');
      expect(label).not.toMatch(/pagination|pager|page\b/i);
    });

    it('[EP00-TBR-003-CA3] page 1 shows «Página 1 · 20 productos» and only «Siguiente»', () => {
      const { el } = render({ page: 1, hasNext: true, count: 20 });
      expect(text(el)).toContain('Página 1 · 20 productos');
      expect(labels(el)).toEqual(['Siguiente']);
      expect(byText(el, 'Primera página')).toBeUndefined();
      expect(byText(el, 'Anterior')).toBeUndefined();
    });

    it('[EP00-TBR-003-CA3] from page 2 it shows «Primera página», «Anterior» and «Siguiente», in that order', () => {
      const { el } = render({ page: 2, hasNext: true, count: 20 });
      expect(text(el)).toContain('Página 2 · 20 productos');
      expect(labels(el)).toEqual(['Primera página', 'Anterior', 'Siguiente']);
    });

    it('[EP00-TBR-003-CA3] «Primera página» and «Anterior» are ghost buttons; «Siguiente» is a plain tb-btn as in the approved UI', () => {
      const { el } = render({ page: 2 });
      for (const label of ['Primera página', 'Anterior']) {
        const b = byText(el, label)!;
        expect(b.classList.contains('tb-btn')).toBe(true);
        expect(b.classList.contains('ghost')).toBe(true);
      }
      const next = byText(el, 'Siguiente')!;
      expect(next.classList.contains('tb-btn')).toBe(true);
      expect(next.classList.contains('ghost')).toBe(false);
      expect(next.classList.contains('primary')).toBe(false);
    });

    it('[EP00-TBR-003-CA3] every button is type="button" and carries its visible text', () => {
      const { el } = render({ page: 2 });
      for (const b of buttons(el)) {
        expect(b.getAttribute('type')).toBe('button');
        expect(b.textContent?.trim()).not.toBe('');
      }
    });

    it('[EP00-TBR-003-CA3] «Siguiente» has the chevron-right icon after its text, decorative, and aria-label «Página siguiente»', () => {
      const { el } = render({ page: 1 });
      const next = byText(el, 'Siguiente')!;
      const svg = next.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(Array.from(svg!.querySelectorAll('path')).map((p) => p.getAttribute('d'))).toContain(
        CHEVRON_RIGHT,
      );
      expect(next.innerHTML.indexOf('Siguiente')).toBeLessThan(next.innerHTML.indexOf('<svg'));
      expect(next.getAttribute('aria-label')).toBe('Página siguiente');
    });

    it('[EP00-TBR-003-CA3] «Anterior» and «Primera página» have no icon (there is no chevron-left in v6)', () => {
      const { el } = render({ page: 2 });
      for (const label of ['Primera página', 'Anterior']) {
        expect(byText(el, label)!.querySelector('svg')).toBeNull();
      }
      expect(el.innerHTML).not.toMatch(CHEVRON_LEFT_LIKE);
    });

    it('[EP00-TBR-003-CA3] with more pages «Siguiente» is enabled and has no title', () => {
      const { el } = render({ page: 2, hasNext: true });
      const next = byText(el, 'Siguiente')!;
      expect(next.disabled).toBe(false);
      expect(next.hasAttribute('title')).toBe(false);
    });

    it('[EP00-TBR-003-CA3] last page: «Página 3 · 5 productos», «Siguiente» disabled with title «No hay más productos» (D-044)', () => {
      const { el } = render({ page: 3, hasNext: false, count: 5 });
      expect(text(el)).toContain('Página 3 · 5 productos');
      expect(labels(el)).toEqual(['Primera página', 'Anterior', 'Siguiente']);
      const next = byText(el, 'Siguiente')!;
      expect(next.disabled).toBe(true);
      expect(next.getAttribute('title')).toBe('No hay más productos');
    });

    it('[EP00-TBR-003-CA3] a single page (page 1 without next) shows only «Siguiente», disabled', () => {
      const { el } = render({ page: 1, hasNext: false, count: 5 });
      expect(labels(el)).toEqual(['Siguiente']);
      expect(byText(el, 'Siguiente')!.disabled).toBe(true);
      expect(byText(el, 'Siguiente')!.getAttribute('title')).toBe('No hay más productos');
    });

    it('[EP00-TBR-003-CA3] the count uses the singular with 1 and the regional format with thousands', () => {
      expect(text(render({ page: 1, count: 1 }).el)).toMatch(/Página 1 · 1 producto(?!s)/);
      expect(text(render({ page: 2, count: 1234 }).el)).toContain('Página 2 · 1,234 productos');
    });

    it('[EP00-TBR-003-CA3] the item label comes from the caller (not fixed to «productos»)', () => {
      const { el } = render({ page: 4, count: 3, itemLabel: { one: 'artículo', other: 'artículos' } });
      expect(text(el)).toContain('Página 4 · 3 artículos');
      expect(text(el)).not.toContain('productos');
    });

    it('[EP00-TBR-003-CA3] clicks emit first, previous and next once each', () => {
      const { el, out } = render({ page: 2, hasNext: true });
      byText(el, 'Primera página')!.click();
      byText(el, 'Anterior')!.click();
      byText(el, 'Siguiente')!.click();
      expect(out).toEqual({ first: 1, previous: 1, next: 1 });
    });

    it('[EP00-TBR-003-CA3] the disabled «Siguiente» on the last page emits nothing', () => {
      const { el, out } = render({ page: 3, hasNext: false, count: 5 });
      byText(el, 'Siguiente')!.click();
      expect(out.next).toBe(0);
    });

    it('[EP00-TBR-003-CA3] Tab order is «Primera página», «Anterior», «Siguiente»; the disabled «Siguiente» is skipped', () => {
      const mid = render({ page: 2, hasNext: true }).el;
      expect(tabbables(mid).map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
        'Primera página',
        'Anterior',
        'Siguiente',
      ]);
      const last = render({ page: 3, hasNext: false, count: 5 }).el;
      expect(tabbables(last).map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
        'Primera página',
        'Anterior',
      ]);
    });

    it('[EP00-TBR-003-CA3] reacts to its inputs: page 1 -> 2 -> 3 (last) -> 1, like the approved flow', () => {
      const { el, set } = render({ page: 1, hasNext: true, count: 20 });
      expect(labels(el)).toEqual(['Siguiente']);
      set({ page: 2 });
      expect(text(el)).toContain('Página 2 · 20 productos');
      expect(labels(el)).toEqual(['Primera página', 'Anterior', 'Siguiente']);
      set({ page: 3, hasNext: false, count: 5 });
      expect(text(el)).toContain('Página 3 · 5 productos');
      expect(byText(el, 'Siguiente')!.disabled).toBe(true);
      set({ page: 1, hasNext: true, count: 20 });
      expect(labels(el)).toEqual(['Siguiente']);
      expect(byText(el, 'Siguiente')!.disabled).toBe(false);
      expect(byText(el, 'Siguiente')!.hasAttribute('title')).toBe(false);
    });

    it('[EP00-TBR-003-CA3] shows no total and no page jump (opaque cursor, C6)', () => {
      const { el } = render({ page: 2, count: 20 });
      expect(text(el)).not.toMatch(/\bde\s+\d/);
      expect(el.querySelectorAll('input, select')).toHaveLength(0);
      expect(labels(el)).not.toContain('Última página');
    });

    it('[EP00-TBR-003-CA3] renders no hand-written color', () => {
      const { el } = render({ page: 2, hasNext: false, count: 5 });
      expect(el.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    });
  });
}

// [EP00-TBR-003-CA3] G2 + G4 composed as the approved footer: the pager projected into the table footer with tbFooter.
// The approved footer reads «Página 1 · 20 productos» on the left and the buttons on the right, with the count once.
@Component({
  selector: 'tb-cursor-pager-in-table-host',
  imports: [TbDataTable, TbCursorPager],
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
      <tb-cursor-pager tbFooter [page]="1" [hasNext]="true" [count]="20" [itemLabel]="itemLabel" />
    </tb-data-table>
  `,
})
class PagerInTableHost {
  columns = [{ id: 'name', header: 'Nombre', type: 'text' as const, value: (r: { id: string }) => r.id }];
  rows = Array.from({ length: 20 }, (_, i) => ({ id: `DEMO${String(i + 1).padStart(4, '0')}` }));
  rowKey = (r: { id: string }) => r.id;
  itemLabel = PRODUCTS;
  texts = {
    empty: { heading: 'Aún no hay productos en el catálogo', message: 'Sin datos de demostración.' },
    'no-results': { heading: 'Sin resultados', message: 'Ningún producto coincide.' },
    forbidden: { heading: 'Tu perfil no puede ver el catálogo', message: 'Pide acceso a quien administra tu perfil.' },
    offline: { heading: 'Sin conexión', message: 'Revisa tu red e inténtalo de nuevo.' },
    error: { heading: 'No pudimos cargar el catálogo', message: 'Reintenta; si sigue igual, avisa al equipo técnico.' },
  };
}

describe('[EP00-TBR-003-CA3] TbCursorPager inside the TbDataTable footer (G2 + G4)', () => {
  it('[EP00-TBR-003-CA3] the pager lives in the table footer, not in the card header', () => {
    const fixture = TestBed.createComponent(PagerInTableHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const pager = el.querySelector('tb-cursor-pager') as HTMLElement | null;
    expect(pager).not.toBeNull();
    expect(pager!.closest('footer')).not.toBeNull();
    expect(pager!.closest('.tb-sec')).toBeNull();
  });

  it('[EP00-TBR-003-CA3] the composed footer shows the count once, as «Página 1 · 20 productos» (approved UI)', () => {
    const fixture = TestBed.createComponent(PagerInTableHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const footer = (el.querySelector('tb-cursor-pager') as HTMLElement).closest('footer') as HTMLElement;
    const footerText = (footer.textContent ?? '').replace(/\s+/g, ' ');
    expect(footerText).toContain('Página 1 · 20 productos');
    expect(footerText.match(/20 productos/g)).toHaveLength(1);
  });
});

describe('[EP00-TBR-003-CA3] design system public API exports PZ-23', () => {
  it('[EP00-TBR-003-CA3] src/ui/index.ts exports TbCursorPager', () => {
    expect(Object.keys(publicApi)).toContain('TbCursorPager');
  });
});

// [EP00-TBR-003-CA3] T4 contract, round 2 (decisions of the dev and the orchestrator, 2026-11-11):
//   3. Edge cases: a page below 1 is treated as page 1; count 0 reads «Página 1 · 0 productos» (plural itemLabel).
//   4. The nav has aria-label="Paginación", exactly.
describe('[EP00-TBR-003-CA3] TbCursorPager edge cases and exact label', () => {
  it('[EP00-TBR-003-CA3] the nav aria-label is exactly «Paginación»', () => {
    for (const page of [1, 2]) {
      const landmark = nav(render({ page }).el);
      expect(landmark).not.toBeNull();
      expect(landmark!.getAttribute('aria-label')).toBe('Paginación');
    }
  });

  for (const page of [0, -1, -42]) {
    it(`[EP00-TBR-003-CA3] page ${page} is treated as page 1: «Página 1 · 20 productos» and only «Siguiente»`, () => {
      const { el } = render({ page, hasNext: true, count: 20 });
      expect(text(el)).toContain('Página 1 · 20 productos');
      expect(text(el)).not.toContain(`Página ${page}`);
      expect(labels(el)).toEqual(['Siguiente']);
    });
  }

  it('[EP00-TBR-003-CA3] a page below 1 set at runtime falls back to page 1', () => {
    const { el, set } = render({ page: 2, hasNext: true, count: 20 });
    expect(labels(el)).toEqual(['Primera página', 'Anterior', 'Siguiente']);
    set({ page: 0 });
    expect(text(el)).toContain('Página 1 · 20 productos');
    expect(labels(el)).toEqual(['Siguiente']);
  });

  it('[EP00-TBR-003-CA3] count 0 reads «Página 1 · 0 productos» (plural itemLabel)', () => {
    const { el } = render({ page: 1, hasNext: false, count: 0 });
    expect(text(el)).toContain('Página 1 · 0 productos');
    expect(text(el)).not.toMatch(/0 producto(?!s)/);
  });

  it('[EP00-TBR-003-CA3] count 0 uses the caller plural itemLabel', () => {
    const { el } = render({ page: 1, hasNext: false, count: 0, itemLabel: { one: 'artículo', other: 'artículos' } });
    expect(text(el)).toContain('Página 1 · 0 artículos');
  });

  it('[EP00-TBR-003-CA3] page below 1 and count 0 together read «Página 1 · 0 productos»', () => {
    const { el } = render({ page: 0, hasNext: false, count: 0 });
    expect(text(el)).toContain('Página 1 · 0 productos');
    expect(labels(el)).toEqual(['Siguiente']);
  });
});
