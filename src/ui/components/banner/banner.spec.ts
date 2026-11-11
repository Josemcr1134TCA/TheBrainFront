// [EP00-TBR-004-CA3] Banner (v6 c-Banner; design docs/diseno/EP00-TBR-004.md §3.7, §6, edge cases 9 and 14).
// Each level starts with its word in bold, so the color is never alone. Role: bad -> alert, the rest -> status.
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TbBanner } from './banner';

const THEMES = ['light', 'dark'] as const;
const LEVELS = [
  ['info', 'Información', 'status'],
  ['warn', 'Aviso', 'status'],
  ['bad', 'Error', 'alert'],
  ['ok', 'Listo', 'status'],
] as const;

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

// The live-region role of the banner: on its host or on its first element with a role.
function roleOf(host: HTMLElement): string | null {
  return host.getAttribute('role') ?? host.querySelector('[role]')?.getAttribute('role') ?? null;
}

@Component({
  selector: 'tb-banner-host',
  imports: [TbBanner],
  template: `
    <tb-banner
      [level]="level"
      [actionLabel]="actionLabel"
      [dismissible]="dismissible"
      (action)="actions = actions + 1"
      (dismiss)="dismissals = dismissals + 1"
      >La lista de precios sintética vence en 3 días.</tb-banner
    >
  `,
})
class BannerHost {
  level: string = 'info';
  actionLabel: string | undefined = undefined;
  dismissible = false;
  actions = 0;
  dismissals = 0;
}

function render(inputs: Partial<Pick<BannerHost, 'level' | 'actionLabel' | 'dismissible'>>) {
  const fixture = TestBed.createComponent(BannerHost);
  Object.assign(fixture.componentInstance, inputs);
  fixture.detectChanges();
  const banner = (fixture.nativeElement as HTMLElement).querySelector('tb-banner') as HTMLElement;
  return { fixture, banner, host: fixture.componentInstance };
}

const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll('button'));
const byText = (el: HTMLElement, text: string) =>
  buttons(el).find((b) => b.textContent?.trim() === text);

for (const theme of THEMES) {
  describe(`[EP00-TBR-004-CA3] TbBanner (data-theme="${theme}")`, () => {
    beforeEach(() => document.documentElement.setAttribute('data-theme', theme));
    afterEach(() => document.documentElement.removeAttribute('data-theme'));

    for (const [level, word, role] of LEVELS) {
      it(`[EP00-TBR-004-CA3] ${level} starts with its bold word "${word}" and has role="${role}"`, () => {
        const { banner } = render({ level });
        const bold = banner.querySelector('b, strong');
        expect(bold?.textContent?.trim()).toBe(word);
        const text = (banner.textContent ?? '').replace(/\s+/g, ' ').trim();
        expect(text.startsWith(word)).toBe(true);
        expect(text).toContain('La lista de precios sintética vence en 3 días.');
        expect(roleOf(banner)).toBe(role);
      });
    }

    it('[EP00-TBR-004-CA3] has no button when there is no action and it is not dismissible', () => {
      const { banner } = render({ level: 'info' });
      expect(buttons(banner)).toHaveLength(0);
    });

    it('[EP00-TBR-004-CA3] its single action is reachable with Tab and emits action', () => {
      const { banner, fixture, host } = render({ level: 'warn', actionLabel: 'Revisar' });
      const action = byText(banner, 'Revisar');
      expect(action).toBeDefined();
      expect(tabbables(banner)).toContain(action);
      action!.click();
      fixture.detectChanges();
      expect(host.actions).toBe(1);
    });

    for (const level of ['info', 'ok']) {
      it(`[EP00-TBR-004-CA3] ${level} dismissible shows a close button with an accessible name that emits dismiss`, () => {
        const { banner, fixture, host } = render({ level, dismissible: true });
        const close = buttons(banner);
        expect(close).toHaveLength(1);
        const name = close[0].getAttribute('aria-label') ?? close[0].textContent ?? '';
        expect(name.trim()).not.toBe('');
        expect(tabbables(banner)).toContain(close[0]);
        close[0].click();
        fixture.detectChanges();
        expect(host.dismissals).toBe(1);
      });
    }

    for (const level of ['warn', 'bad']) {
      it(`[EP00-TBR-004-CA3] ${level} ignores dismissible: no close button while the problem lasts`, () => {
        const { banner } = render({ level, dismissible: true });
        expect(buttons(banner)).toHaveLength(0);
      });
    }

    it('[EP00-TBR-004-CA3] action and close button are both reachable on a dismissible info banner', () => {
      const { banner } = render({ level: 'info', actionLabel: 'Ver detalle', dismissible: true });
      const reachable = tabbables(banner);
      expect(reachable).toHaveLength(2);
      expect(reachable.map((b) => b.textContent?.trim())).toContain('Ver detalle');
    });

    it('[EP00-TBR-004-CA3] renders no hand-written color', () => {
      const { banner } = render({ level: 'bad', actionLabel: 'Reintentar' });
      expect(banner.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    });
  });
}
