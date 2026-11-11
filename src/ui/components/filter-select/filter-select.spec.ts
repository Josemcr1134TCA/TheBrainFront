// [EP00-TBR-004-CA3] FilterSelect (v6 c-FilterSelect; PQ-6; design docs/diseno/EP00-TBR-004.md §3.5, §6, edge cases 9, 11, 12).
// jsdom does not move focus with Tab nor turn Enter/Space on a native button into a click: tabbables() models the
// tab order and activate() dispatches the key and, like a browser, the click when the key was not cancelled.
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TbFilterSelect } from './filter-select';

const THEMES = ['light', 'dark'] as const;

// Synthetic options (no real brands or suppliers).
const OPTIONS = [
  { value: 'a', label: 'Fabricante Alfa', count: 1234 },
  { value: 'b', label: 'Fabricante Beta', count: 12 },
  { value: 'c', label: 'Distribuidora Ñandú', count: null },
];
const RESULT_LABEL = { one: 'resultado', other: 'resultados' };

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

function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(TbFilterSelect);
  const all: Record<string, unknown> = {
    label: 'Proveedor',
    options: OPTIONS,
    selected: [],
    resultLabel: RESULT_LABEL,
    ...inputs,
  };
  for (const [k, v] of Object.entries(all)) fixture.componentRef.setInput(k, v);
  const emitted: string[][] = [];
  fixture.componentInstance.selectedChange.subscribe((v: string[]) => emitted.push([...v]));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const trigger = () => el.querySelector('button[aria-haspopup]') as HTMLButtonElement;
  const panel = () => el.querySelector('[role="group"]') as HTMLElement | null;
  const clear = () =>
    el.querySelector(
      'button[aria-label="Quitar el filtro de proveedor"]',
    ) as HTMLButtonElement | null;
  const search = () =>
    panel()?.querySelector('input:not([type="checkbox"])') as HTMLInputElement | null;
  const boxes = () =>
    Array.from(panel()?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []);
  const footButton = (text: string) =>
    Array.from(panel()?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === text,
    ) as HTMLButtonElement | undefined;
  const open = () => {
    trigger().click();
    fixture.detectChanges();
  };
  const sync = () => fixture.detectChanges();
  return { fixture, el, trigger, panel, clear, search, boxes, footButton, open, sync, emitted };
}

const labelOf = (box: HTMLInputElement) =>
  ((box.labels && box.labels[0]?.textContent) || box.closest('label')?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
const typeIn = (input: HTMLInputElement, text: string) => {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

for (const theme of THEMES) {
  describe(`[EP00-TBR-004-CA3] TbFilterSelect (data-theme="${theme}")`, () => {
    beforeEach(() => document.documentElement.setAttribute('data-theme', theme));
    afterEach(() => document.documentElement.removeAttribute('data-theme'));

    it('[EP00-TBR-004-CA3] the trigger is reachable with Tab, has aria-haspopup="true" and starts collapsed', () => {
      const { el, trigger, panel } = render();
      expect(trigger()).not.toBeNull();
      expect(trigger().getAttribute('aria-haspopup')).toBe('true');
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
      expect(tabbables(el)[0]).toBe(trigger());
      expect(panel()).toBeNull();
    });

    it('[EP00-TBR-004-CA3] the button summarises the value: «Todos» with none selected', () => {
      const { trigger, clear } = render({ selected: [] });
      const text = trigger().textContent?.replace(/\s+/g, ' ') ?? '';
      expect(text).toContain('Proveedor');
      expect(text).toContain('Todos');
      expect(clear()).toBeNull();
    });

    it('[EP00-TBR-004-CA3] one value shows its full label and two or more show «N elegidos» (color is not alone)', () => {
      expect(render({ selected: ['a'] }).trigger().textContent).toContain('Fabricante Alfa');
      const two = render({ selected: ['a', 'b'] }).trigger().textContent ?? '';
      expect(two).toContain('2 elegidos');
      expect(two).not.toContain('Todos');
    });

    it('[EP00-TBR-004-CA3] with a value, the X is reachable, has its aria-label and empties the filter without opening', () => {
      const { el, clear, panel, trigger, emitted, sync } = render({ selected: ['a', 'b'] });
      const x = clear();
      expect(x).not.toBeNull();
      expect(tabbables(el)).toContain(x);
      x!.click();
      sync();
      expect(emitted.at(-1)).toEqual([]);
      expect(panel()).toBeNull();
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
    });

    it('[EP00-TBR-004-CA3] Enter on the trigger opens the panel and moves the focus to its search box', () => {
      const { trigger, panel, search, sync } = render();
      trigger().focus();
      activate(trigger(), 'Enter');
      sync();
      expect(trigger().getAttribute('aria-expanded')).toBe('true');
      expect(panel()).not.toBeNull();
      expect(panel()!.getAttribute('aria-label')?.trim()).toBeTruthy();
      expect(search()).not.toBeNull();
      expect(search()!.getAttribute('aria-label')?.trim()).toBeTruthy();
      expect(document.activeElement).toBe(search());
    });

    it('[EP00-TBR-004-CA3] Tab walks the search box, every checkbox and the «Todos · Limpiar» footer', () => {
      const { panel, search, boxes, footButton, open } = render();
      open();
      const order = tabbables(panel()!);
      expect(order[0]).toBe(search());
      for (const box of boxes()) expect(order).toContain(box);
      expect(order).toContain(footButton('Todos'));
      expect(order).toContain(footButton('Limpiar'));
      expect(order.indexOf(boxes()[0])).toBeLessThan(order.indexOf(footButton('Todos')!));
    });

    it('[EP00-TBR-004-CA3] native checkboxes have a label with the option and its formatted count', () => {
      const { boxes, open } = render();
      open();
      expect(boxes()).toHaveLength(3);
      expect(labelOf(boxes()[0])).toContain('Fabricante Alfa');
      expect(labelOf(boxes()[0])).toContain('1,234');
      expect(labelOf(boxes()[2])).toContain('Distribuidora Ñandú');
      expect(labelOf(boxes()[2])).not.toContain('null');
    });

    it('[EP00-TBR-004-CA3] Space on a checkbox marks it and emits the change at once, with no apply button', () => {
      const { boxes, panel, open, emitted, sync } = render();
      open();
      const box = boxes()[0];
      box.focus();
      box.click(); // Space on a native checkbox toggles it through a click.
      sync();
      expect(emitted.at(-1)).toEqual(['a']);
      boxes()[1].click();
      sync();
      expect([...(emitted.at(-1) ?? [])].sort()).toEqual(['a', 'b']);
      expect(panel()).not.toBeNull();
    });

    it('[EP00-TBR-004-CA3] Esc closes the panel and gives the focus back to the trigger', () => {
      const { trigger, panel, search, open, sync } = render();
      open();
      key(search()!, 'Escape');
      sync();
      expect(panel()).toBeNull();
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger());
    });

    it('[EP00-TBR-004-CA3] the inner search filters the panel options ignoring case and accents', () => {
      const { search, boxes, open, sync } = render();
      open();
      typeIn(search()!, 'NANDU');
      sync();
      expect(boxes().map(labelOf).join(' | ')).toContain('Distribuidora Ñandú');
      expect(boxes()).toHaveLength(1);
    });

    it('[EP00-TBR-004-CA3] a search with no match leaves the panel without options (edge case 11)', () => {
      const { search, boxes, panel, open, sync } = render();
      open();
      typeIn(search()!, 'zzz');
      sync();
      expect(boxes()).toHaveLength(0);
      expect(panel()).not.toBeNull();
    });

    it('[EP00-TBR-004-CA3] the inner search is emptied every time the panel opens', () => {
      const { search, boxes, open, trigger, sync } = render();
      open();
      typeIn(search()!, 'beta');
      sync();
      key(search()!, 'Escape');
      sync();
      trigger().click();
      sync();
      expect(search()!.value).toBe('');
      expect(boxes()).toHaveLength(3);
    });

    it('[EP00-TBR-004-CA3] «Todos» marks the visible options and only emits the change (PQ-6)', () => {
      const { search, footButton, panel, open, emitted, sync } = render();
      open();
      typeIn(search()!, 'fabricante');
      sync();
      footButton('Todos')!.click();
      sync();
      expect([...(emitted.at(-1) ?? [])].sort()).toEqual(['a', 'b']);
      expect(panel()).not.toBeNull();
    });

    it('[EP00-TBR-004-CA3] «Limpiar» unmarks everything and only emits the change (PQ-6)', () => {
      const { footButton, panel, open, emitted, sync } = render({ selected: ['a', 'c'] });
      open();
      footButton('Limpiar')!.click();
      sync();
      expect(emitted.at(-1)).toEqual([]);
      expect(panel()).not.toBeNull();
    });

    it('[EP00-TBR-004-CA3] the footer shows the total given by the caller: «6 resultados», «1 resultado»', () => {
      const six = render({ total: 6 });
      six.open();
      expect(six.panel()!.textContent).toContain('6 resultados');
      const one = render({ total: 1 });
      one.open();
      expect(one.panel()!.textContent).toMatch(/\b1 resultado(?!s)/);
    });

    it('[EP00-TBR-004-CA3] works with no options (edge case 11)', () => {
      const { boxes, panel, open } = render({ options: [] });
      open();
      expect(panel()).not.toBeNull();
      expect(boxes()).toHaveLength(0);
    });

    it('[EP00-TBR-004-CA3] renders no hand-written color', () => {
      const { el, open } = render({ selected: ['a'] });
      open();
      expect(el.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    });
  });
}

@Component({
  selector: 'tb-two-filters-host',
  imports: [TbFilterSelect],
  template: `
    <tb-filter-select
      id="first"
      label="Proveedor"
      [options]="options"
      [(selected)]="first"
      [resultLabel]="resultLabel"
    />
    <tb-filter-select
      id="second"
      label="Marca"
      [options]="options"
      [(selected)]="second"
      [resultLabel]="resultLabel"
    />
    <button id="outside" type="button">Fuera</button>
  `,
})
class TwoFiltersHost {
  options = OPTIONS;
  resultLabel = RESULT_LABEL;
  first: string[] = [];
  second: string[] = [];
}

describe('[EP00-TBR-004-CA3] TbFilterSelect, one open panel at a time (edge case 12)', () => {
  function render2() {
    const fixture = TestBed.createComponent(TwoFiltersHost);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const part = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
    const triggerOf = (id: string) =>
      part(id).querySelector('button[aria-haspopup]') as HTMLButtonElement;
    const isOpen = (id: string) => triggerOf(id).getAttribute('aria-expanded') === 'true';
    return { fixture, root, part, triggerOf, isOpen };
  }

  it('[EP00-TBR-004-CA3] moving the focus to a second FilterSelect closes the first', () => {
    const { fixture, triggerOf, isOpen } = render2();
    triggerOf('first').click();
    fixture.detectChanges();
    expect(isOpen('first')).toBe(true);
    triggerOf('second').focus();
    triggerOf('second').click();
    fixture.detectChanges();
    expect(isOpen('first')).toBe(false);
    expect(isOpen('second')).toBe(true);
  });

  it('[EP00-TBR-004-CA3] a click outside closes the open panel', () => {
    const { fixture, root, triggerOf, isOpen } = render2();
    triggerOf('first').click();
    fixture.detectChanges();
    const outside = root.querySelector('#outside') as HTMLButtonElement;
    for (const type of ['pointerdown', 'mousedown'])
      outside.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    outside.focus();
    outside.click();
    fixture.detectChanges();
    expect(isOpen('first')).toBe(false);
  });

  it('[EP00-TBR-004-CA3] two-way binding updates the caller with the new selection', () => {
    const { fixture, part, triggerOf } = render2();
    triggerOf('first').click();
    fixture.detectChanges();
    const box = part('first').querySelector('input[type="checkbox"]') as HTMLInputElement;
    box.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.first).toEqual(['a']);
    expect(triggerOf('first').textContent).toContain('Fabricante Alfa');
  });
});
