// [EP00-TBR-004-CA3] Button (v6 c-Buttons; design docs/diseno/EP00-TBR-004.md §3.1, §4, §6).
// jsdom does not move focus with Tab: tabbables() models the browser tab order (DOM order, tabindex >= 0, not disabled).
// The focus ring itself is checked statically in scripts/validate-ui.test.mjs (jsdom cannot evaluate :focus-visible).
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TbButton } from './button';

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

@Component({
  selector: 'tb-button-host',
  imports: [TbButton],
  template: `
    <button tb-button id="plain" (click)="clicks = clicks + 1">Guardar</button>
    <button tb-button id="primary" variant="primary" size="lg" [block]="true">
      Crear producto
    </button>
    <button tb-button id="submit" type="submit">Enviar</button>
    <button tb-button id="busy" [busy]="busy" (click)="busyClicks = busyClicks + 1">
      Guardando
    </button>
    <button tb-button id="disabled" [disabled]="true" disabledReason="Sin permiso para editar">
      Editar
    </button>
    <button tb-button id="enabled-with-reason" disabledReason="Sin permiso para editar">
      Revisar
    </button>
    <a tb-button id="link" href="#detalle" [busy]="linkBusy">Ver detalle</a>
  `,
})
class ButtonHost {
  clicks = 0;
  busy = true;
  busyClicks = 0;
  linkBusy = true;
}

function render() {
  const fixture = TestBed.createComponent(ButtonHost);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(id: string) => root.querySelector(`#${id}`) as T;
  return { fixture, root, q, host: fixture.componentInstance };
}

for (const theme of THEMES) {
  describe(`[EP00-TBR-004-CA3] TbButton (data-theme="${theme}")`, () => {
    beforeEach(() => document.documentElement.setAttribute('data-theme', theme));
    afterEach(() => document.documentElement.removeAttribute('data-theme'));

    it('[EP00-TBR-004-CA3] the host is the native element and gets type="button" when type is missing', () => {
      const { q } = render();
      const plain = q<HTMLButtonElement>('plain');
      expect(plain.tagName).toBe('BUTTON');
      expect(plain.getAttribute('type')).toBe('button');
      expect(q<HTMLButtonElement>('primary').getAttribute('type')).toBe('button');
    });

    it('[EP00-TBR-004-CA3] keeps an explicit type and does not add type to a link', () => {
      const { q } = render();
      expect(q<HTMLButtonElement>('submit').getAttribute('type')).toBe('submit');
      const link = q<HTMLAnchorElement>('link');
      expect(link.tagName).toBe('A');
      expect(link.hasAttribute('type')).toBe(false);
    });

    it('[EP00-TBR-004-CA3] keeps its text: a button with text has its accessible name', () => {
      const { q } = render();
      expect(q('plain').textContent?.trim()).toBe('Guardar');
      expect(q('primary').textContent?.trim()).toBe('Crear producto');
    });

    it('[EP00-TBR-004-CA3] the native click reaches the caller when it is not busy', () => {
      const { q, host } = render();
      q<HTMLButtonElement>('plain').click();
      expect(host.clicks).toBe(1);
    });

    it('[EP00-TBR-004-CA3] busy sets aria-busy="true" and cancels the click (keyboard activation included)', () => {
      const { q, host } = render();
      const busy = q<HTMLButtonElement>('busy');
      expect(busy.getAttribute('aria-busy')).toBe('true');
      // Enter and Space on a native button end in a click event: cancelling the click blocks the keyboard too.
      busy.click();
      busy.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(host.busyClicks).toBe(0);
    });

    it('[EP00-TBR-004-CA3] a busy link does not navigate (the click is cancelled)', () => {
      const { q } = render();
      const link = q<HTMLAnchorElement>('link');
      expect(link.getAttribute('aria-busy')).toBe('true');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it('[EP00-TBR-004-CA3] busy goes away when the work ends', () => {
      const { fixture, q, host } = render();
      host.busy = false;
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      const busy = q<HTMLButtonElement>('busy');
      expect(busy.getAttribute('aria-busy')).not.toBe('true');
      busy.click();
      expect(host.busyClicks).toBe(1);
    });

    it('[EP00-TBR-004-CA3] a disabled button is out of the Tab order and says why in title', () => {
      const { root, q } = render();
      const disabled = q<HTMLButtonElement>('disabled');
      expect(disabled.disabled).toBe(true);
      expect(tabbables(root)).not.toContain(disabled);
      expect(disabled.getAttribute('title')).toBe('Sin permiso para editar');
    });

    it('[EP00-TBR-004-CA3] disabledReason is not shown while the button is enabled', () => {
      const { q } = render();
      expect(q('enabled-with-reason').getAttribute('title')).not.toBe('Sin permiso para editar');
    });

    it('[EP00-TBR-004-CA3] every enabled button and the link are reachable with Tab, in DOM order', () => {
      const { root } = render();
      const ids = tabbables(root).map((el) => el.id);
      expect(ids).toEqual(['plain', 'primary', 'submit', 'busy', 'enabled-with-reason', 'link']);
    });

    it('[EP00-TBR-004-CA3] renders no hand-written color (nothing depends on the theme)', () => {
      const { root } = render();
      expect(root.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    });
  });
}
