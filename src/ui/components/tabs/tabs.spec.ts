// [EP00-TBR-004-CA3] Tabs (v6 c-Tabs; design docs/diseno/EP00-TBR-004.md §3.3, §6, edge case 7).
// Roving tabindex, arrows move the focus and wrap, Enter or Space activate (manual activation), Tab leaves to the panel.
// jsdom does not turn Enter/Space on a native button into a click: activate() dispatches the key and, like a browser,
// the click when the key was not cancelled.
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TbTabs } from './tabs';

const THEMES = ['light', 'dark'] as const;

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

function activate(el: HTMLElement, k: 'Enter' | ' ') {
  const event = key(el, k);
  if (!event.defaultPrevented && el instanceof HTMLButtonElement) el.click();
}

@Component({
  selector: 'tb-tabs-host',
  imports: [TbTabs],
  template: `
    <tb-tabs id="main" [tabs]="tabs" [(selected)]="selected" label="Secciones del producto">
      <p id="panel-content">Contenido de {{ selected }}</p>
    </tb-tabs>
    <tb-tabs id="other" [tabs]="tabs" [(selected)]="otherSelected" label="Otra sección">
      <p>Otra</p>
    </tb-tabs>
  `,
})
class TabsHost {
  tabs = [
    { id: 'general', label: 'General' },
    { id: 'prices', label: 'Precios', count: 1234 },
    { id: 'history', label: 'Historial', badge: { count: 3, tone: 'accent' } },
  ];
  selected = 'general';
  otherSelected = 'general';
  changes: string[] = [];
}

function render(selected = 'general') {
  const fixture = TestBed.createComponent(TabsHost);
  fixture.componentInstance.selected = selected;
  fixture.detectChanges();
  const root = (fixture.nativeElement as HTMLElement).querySelector('#main') as HTMLElement;
  const tablist = () => root.querySelector('[role="tablist"]') as HTMLElement;
  const tabs = () => Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const tab = (label: string) =>
    tabs().find((t) => t.textContent?.includes(label)) as HTMLButtonElement;
  const panel = () => root.querySelector('[role="tabpanel"]') as HTMLElement;
  const sync = () => fixture.detectChanges();
  return { fixture, root, tablist, tabs, tab, panel, sync, host: fixture.componentInstance };
}

for (const theme of THEMES) {
  describe(`[EP00-TBR-004-CA3] TbTabs (data-theme="${theme}")`, () => {
    beforeEach(() => document.documentElement.setAttribute('data-theme', theme));
    afterEach(() => document.documentElement.removeAttribute('data-theme'));

    it('[EP00-TBR-004-CA3] renders a labelled tablist of native tab buttons', () => {
      const { tablist, tabs } = render();
      expect(tablist().getAttribute('aria-label')).toBe('Secciones del producto');
      expect(tabs()).toHaveLength(3);
      for (const t of tabs()) expect(t.tagName).toBe('BUTTON');
    });

    it('[EP00-TBR-004-CA3] only the selected tab has aria-selected="true" and tabindex="0" (roving tabindex)', () => {
      const { tabs, tab } = render('prices');
      expect(tab('Precios').getAttribute('aria-selected')).toBe('true');
      expect(tab('Precios').getAttribute('tabindex')).toBe('0');
      for (const t of tabs().filter((x) => x !== tab('Precios'))) {
        expect(t.getAttribute('aria-selected')).toBe('false');
        expect(t.getAttribute('tabindex')).toBe('-1');
      }
    });

    it('[EP00-TBR-004-CA3] tab ids are stable (tb-tab-<instance>-<id>) and unique between instances', () => {
      const { fixture, tab } = render();
      expect(tab('General').id).toMatch(/^tb-tab-.+-general$/);
      expect(tab('Precios').id).toMatch(/^tb-tab-.+-prices$/);
      const other = (fixture.nativeElement as HTMLElement).querySelector(
        '#other [role="tab"]',
      ) as HTMLElement;
      expect(other.id).toMatch(/^tb-tab-.+-general$/);
      expect(other.id).not.toBe(tab('General').id);
    });

    it('[EP00-TBR-004-CA3] aria-controls and aria-labelledby link the active tab and its panel', () => {
      const { tab, panel, tabs } = render('history');
      const active = tab('Historial');
      expect(panel()).not.toBeNull();
      expect(panel().id).not.toBe('');
      for (const t of tabs()) expect(t.getAttribute('aria-controls')).toBeTruthy();
      expect(active.getAttribute('aria-controls')).toBe(panel().id);
      expect(panel().getAttribute('aria-labelledby')).toBe(active.id);
      expect(panel().getAttribute('tabindex')).toBe('0');
      expect(panel().textContent).toContain('Contenido de history');
    });

    it('[EP00-TBR-004-CA3] ArrowRight and ArrowLeft move the focus without selecting, and wrap at the ends', () => {
      const { tab, sync, host } = render('general');
      tab('General').focus();
      key(tab('General'), 'ArrowRight');
      sync();
      expect(document.activeElement).toBe(tab('Precios'));
      expect(host.selected).toBe('general');
      key(tab('Precios'), 'ArrowRight');
      sync();
      expect(document.activeElement).toBe(tab('Historial'));
      key(tab('Historial'), 'ArrowRight');
      sync();
      expect(document.activeElement).toBe(tab('General'));
      key(tab('General'), 'ArrowLeft');
      sync();
      expect(document.activeElement).toBe(tab('Historial'));
      expect(host.selected).toBe('general');
    });

    it('[EP00-TBR-004-CA3] Enter activates the focused tab and the focus stays on it (edge case 7)', () => {
      const { tab, sync, host, panel } = render('general');
      tab('General').focus();
      key(tab('General'), 'ArrowRight');
      sync();
      activate(tab('Precios'), 'Enter');
      sync();
      expect(host.selected).toBe('prices');
      expect(tab('Precios').getAttribute('aria-selected')).toBe('true');
      expect(tab('Precios').getAttribute('tabindex')).toBe('0');
      expect(tab('General').getAttribute('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(tab('Precios'));
      expect(panel().getAttribute('aria-labelledby')).toBe(tab('Precios').id);
    });

    it('[EP00-TBR-004-CA3] Space also activates the focused tab', () => {
      const { tab, sync, host } = render('general');
      tab('General').focus();
      key(tab('General'), 'ArrowLeft');
      sync();
      activate(tab('Historial'), ' ');
      sync();
      expect(host.selected).toBe('history');
      expect(document.activeElement).toBe(tab('Historial'));
    });

    it('[EP00-TBR-004-CA3] a click selects the tab and keeps the focus on it', () => {
      const { tab, sync, host } = render('general');
      tab('Historial').focus();
      tab('Historial').click();
      sync();
      expect(host.selected).toBe('history');
      expect(document.activeElement).toBe(tab('Historial'));
    });

    it('[EP00-TBR-004-CA3] Tab from the active tab goes to its tabpanel, skipping the other tabs', () => {
      const { root, tab, panel } = render('prices');
      const order = tabbables(root);
      const at = order.indexOf(tab('Precios'));
      expect(at).toBeGreaterThanOrEqual(0);
      expect(order[at + 1]).toBe(panel());
      expect(order).not.toContain(tab('General'));
      expect(order).not.toContain(tab('Historial'));
    });

    it('[EP00-TBR-004-CA3] shows the count formatted (1,234) and the badge count', () => {
      const { tab } = render();
      expect(tab('Precios').textContent).toContain('1,234');
      expect(tab('Historial').textContent).toContain('3');
    });

    it('[EP00-TBR-004-CA3] the active tab is not told by color alone: aria-selected marks it', () => {
      const { tabs } = render('prices');
      expect(tabs().filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    });

    it('[EP00-TBR-004-CA3] renders no hand-written color', () => {
      const { root } = render();
      expect(root.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    });
  });
}

describe('[EP00-TBR-004-CA3] TbTabs with an invalid selection', () => {
  it('[EP00-TBR-004-CA3] takes the first tab and emits the change once', () => {
    const fixture = TestBed.createComponent(TbTabs);
    const emitted: string[] = [];
    fixture.componentInstance.selectedChange.subscribe((v: string) => emitted.push(v));
    fixture.componentRef.setInput('tabs', [
      { id: 'general', label: 'General' },
      { id: 'prices', label: 'Precios' },
    ]);
    fixture.componentRef.setInput('label', 'Secciones');
    fixture.componentRef.setInput('selected', 'nope');
    fixture.detectChanges();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const first = el.querySelector('[role="tab"]') as HTMLElement;
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(first.getAttribute('tabindex')).toBe('0');
    expect(emitted).toEqual(['general']);
  });
});
