// [EP00-TBR-004-CA4][EP00-TBR-004-CA3] EmptyState with its 5 variants (v6 c-EmptyState; story v3; PQ-5;
// design docs/diseno/EP00-TBR-004.md §3.6, §6).
// Roles: the v6 gives role="alert" to "error de servicio" and "sin conexión" and role="status" to "vacío" and
// "sin resultados"; PQ-5 gives role="status" to "sin permisos".
import { TestBed } from '@angular/core/testing';
import { TbEmptyState } from './empty-state';

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

// The role of the empty state: on its host or on its first element with a role.
function roleOf(host: HTMLElement): string | null {
  return host.getAttribute('role') ?? host.querySelector('[role]')?.getAttribute('role') ?? null;
}

const TEXTS: Record<string, [string, string]> = {
  empty: ['Aún no hay productos', 'Cuando des de alta un producto aparecerá aquí.'],
  'no-results': ['Sin resultados', 'Ningún producto coincide con los filtros.'],
  forbidden: ['Sin permisos', 'Tu perfil no puede ver esta lista.'],
  offline: ['Sin conexión', 'Revisa tu red e inténtalo de nuevo.'],
  error: ['No se pudo cargar', 'El servicio no respondió.'],
};

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(TbEmptyState);
  const variant = inputs['variant'] as string;
  fixture.componentRef.setInput('heading', TEXTS[variant][0]);
  fixture.componentRef.setInput('message', TEXTS[variant][1]);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  let actions = 0;
  fixture.componentInstance.action.subscribe(() => actions++);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, actions: () => actions };
}

const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll('button'));

for (const theme of THEMES) {
  describe(`[EP00-TBR-004-CA4] TbEmptyState (data-theme="${theme}")`, () => {
    beforeEach(() => document.documentElement.setAttribute('data-theme', theme));
    afterEach(() => document.documentElement.removeAttribute('data-theme'));

    for (const variant of Object.keys(TEXTS)) {
      it(`[EP00-TBR-004-CA4] ${variant} shows its heading and message, with a decorative icon`, () => {
        const { el } = render({ variant });
        const text = (el.textContent ?? '').replace(/\s+/g, ' ');
        expect(text).toContain(TEXTS[variant][0]);
        expect(text).toContain(TEXTS[variant][1]);
        for (const svg of Array.from(el.querySelectorAll('svg'))) {
          expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
        }
      });
    }

    it('[EP00-TBR-004-CA4] error has role="alert"', () => {
      expect(roleOf(render({ variant: 'error' }).el)).toBe('alert');
    });

    it('[EP00-TBR-004-CA4] offline has role="alert" (v6 c-EmptyState, Accesibilidad)', () => {
      expect(roleOf(render({ variant: 'offline' }).el)).toBe('alert');
    });

    for (const variant of ['empty', 'no-results']) {
      it(`[EP00-TBR-004-CA4] ${variant} has role="status"`, () => {
        expect(roleOf(render({ variant }).el)).toBe('status');
      });
    }

    it('[EP00-TBR-004-CA4] forbidden has role="status" (PQ-5)', () => {
      expect(roleOf(render({ variant: 'forbidden' }).el)).toBe('status');
    });

    it('[EP00-TBR-004-CA4] carries a single live role (no nested alert/status)', () => {
      for (const variant of Object.keys(TEXTS)) {
        const { el } = render({ variant });
        const roles = [el, ...Array.from(el.querySelectorAll<HTMLElement>('[role]'))]
          .map((n) => n.getAttribute('role'))
          .filter((r) => r === 'alert' || r === 'status');
        expect(roles).toHaveLength(1);
      }
    });

    it('[EP00-TBR-004-CA4] default actions: no-results -> «Limpiar filtros», offline and error -> «Reintentar»', () => {
      expect(
        buttons(render({ variant: 'no-results' }).el).map((b) => b.textContent?.trim()),
      ).toEqual(['Limpiar filtros']);
      expect(buttons(render({ variant: 'offline' }).el).map((b) => b.textContent?.trim())).toEqual([
        'Reintentar',
      ]);
      expect(buttons(render({ variant: 'error' }).el).map((b) => b.textContent?.trim())).toEqual([
        'Reintentar',
      ]);
    });

    it('[EP00-TBR-004-CA4] forbidden and empty have no action by default', () => {
      expect(buttons(render({ variant: 'forbidden' }).el)).toHaveLength(0);
      expect(buttons(render({ variant: 'empty' }).el)).toHaveLength(0);
    });

    it('[EP00-TBR-004-CA4] actionLabel replaces the default text and there is at most one action', () => {
      const { el } = render({ variant: 'empty', actionLabel: 'Crear producto' });
      expect(buttons(el).map((b) => b.textContent?.trim())).toEqual(['Crear producto']);
      const retry = render({ variant: 'error', actionLabel: 'Volver a cargar' }).el;
      expect(buttons(retry).map((b) => b.textContent?.trim())).toEqual(['Volver a cargar']);
    });

    it('[EP00-TBR-004-CA3] the action is reachable with Tab and emits action on click', () => {
      const { el, fixture, actions } = render({ variant: 'error' });
      const [retry] = buttons(el);
      expect(tabbables(el)).toEqual([retry]);
      retry.click();
      fixture.detectChanges();
      expect(actions()).toBe(1);
    });

    it('[EP00-TBR-004-CA3] focusActionOnShow moves the focus to the action when it appears', async () => {
      const { el, fixture } = render({ variant: 'error', focusActionOnShow: true });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(document.activeElement).toBe(buttons(el)[0]);
    });

    it('[EP00-TBR-004-CA3] without focusActionOnShow the focus does not move', async () => {
      const before = document.activeElement;
      const { el, fixture } = render({ variant: 'error' });
      await fixture.whenStable();
      expect(document.activeElement).not.toBe(buttons(el)[0]);
      expect(document.activeElement).toBe(before);
    });

    it('[EP00-TBR-004-CA4] renders no hand-written color', () => {
      const { el } = render({ variant: 'error' });
      expect(el.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// [EP00-TBR-003-CA2] G3 secondary action (task T3, black box, before T4). Source: docs/ui/EP00-TBR-003/index.html, state
// error-validation, and propuesta.md §3 (question 12): «Reintentar» (primary) and «Ir a la primera página» (tb-btn ghost)
// in the same .acts row, the secondary after the primary.
// API proposed for the T4 contract: input secondaryActionLabel (string | undefined), output secondaryAction (void).
// The new output does not exist before T4: it is reached through outputOf() so this file keeps compiling and the 004
// tests above keep running; the new tests fail at runtime for the missing API.
// ---------------------------------------------------------------------------------------------------------------------
interface OutputLike {
  subscribe(fn: () => void): unknown;
}

function outputOf(component: unknown, name: string): OutputLike | undefined {
  const candidate = (component as Record<string, unknown>)[name] as OutputLike | undefined;
  return candidate && typeof candidate.subscribe === 'function' ? candidate : undefined;
}

const VALIDATION: Record<string, unknown> = {
  variant: 'error',
  heading: 'No pudimos pedir esa página',
  message: 'Reintenta; si sigue igual, avisa al equipo técnico.',
  secondaryActionLabel: 'Ir a la primera página',
};

function renderWithSecondary(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(TbEmptyState);
  for (const [k, v] of Object.entries({ ...VALIDATION, ...inputs })) fixture.componentRef.setInput(k, v);
  let primary = 0;
  let secondary = 0;
  fixture.componentInstance.action.subscribe(() => primary++);
  const out = outputOf(fixture.componentInstance, 'secondaryAction');
  out?.subscribe(() => secondary++);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, out, primary: () => primary, secondary: () => secondary };
}

const labelsOf = (el: HTMLElement) => buttons(el).map((b) => b.textContent?.trim());
const byLabel = (el: HTMLElement, text: string) => buttons(el).find((b) => b.textContent?.trim() === text);

for (const theme of THEMES) {
  describe(`[EP00-TBR-003-CA2] TbEmptyState secondary action G3 (data-theme="${theme}")`, () => {
    beforeEach(() => document.documentElement.setAttribute('data-theme', theme));
    afterEach(() => document.documentElement.removeAttribute('data-theme'));

    it('[EP00-TBR-003-CA2] shows «Reintentar» and then «Ir a la primera página», in the same actions row', () => {
      const { el } = renderWithSecondary();
      expect(labelsOf(el)).toEqual(['Reintentar', 'Ir a la primera página']);
      const [primary, secondary] = buttons(el);
      expect(primary.parentElement).toBe(secondary.parentElement);
      expect(primary.parentElement!.classList.contains('acts')).toBe(true);
    });

    it('[EP00-TBR-003-CA2] the secondary action is a ghost tb-btn of type="button"', () => {
      const { el } = renderWithSecondary();
      const secondary = byLabel(el, 'Ir a la primera página');
      expect(secondary).toBeDefined();
      expect(secondary!.classList.contains('tb-btn')).toBe(true);
      expect(secondary!.classList.contains('ghost')).toBe(true);
      expect(secondary!.classList.contains('primary')).toBe(false);
      expect(secondary!.getAttribute('type')).toBe('button');
    });

    it('[EP00-TBR-003-CA2] the primary action keeps the same look as without a secondary action', () => {
      const alone = buttons(render({ variant: 'error' }).el)[0];
      const withSecondary = renderWithSecondary().el;
      expect(byLabel(withSecondary, 'Ir a la primera página')).toBeDefined();
      expect(byLabel(withSecondary, 'Reintentar')!.className).toBe(alone.className);
    });

    it('[EP00-TBR-003-CA2] the secondary click emits secondaryAction once and not action', () => {
      const { el, out, primary, secondary, fixture } = renderWithSecondary();
      expect(out).toBeDefined();
      byLabel(el, 'Ir a la primera página')!.click();
      fixture.detectChanges();
      expect(secondary()).toBe(1);
      expect(primary()).toBe(0);
    });

    it('[EP00-TBR-003-CA2] the primary click still emits action and not secondaryAction', () => {
      const { el, primary, secondary, fixture } = renderWithSecondary();
      expect(byLabel(el, 'Ir a la primera página')).toBeDefined();
      byLabel(el, 'Reintentar')!.click();
      fixture.detectChanges();
      expect(primary()).toBe(1);
      expect(secondary()).toBe(0);
    });

    it('[EP00-TBR-003-CA2] Tab order is primary then secondary', () => {
      const { el } = renderWithSecondary();
      expect(tabbables(el).map((b) => b.textContent?.trim())).toEqual(['Reintentar', 'Ir a la primera página']);
    });

    it('[EP00-TBR-003-CA2] focusActionOnShow focuses the primary, not the secondary', async () => {
      const { el, fixture } = renderWithSecondary({ focusActionOnShow: true });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(byLabel(el, 'Ir a la primera página')).toBeDefined();
      expect(document.activeElement).toBe(byLabel(el, 'Reintentar'));
    });

    it('[EP00-TBR-003-CA2] keeps a single live role (alert) with two actions', () => {
      const { el } = renderWithSecondary();
      expect(buttons(el)).toHaveLength(2);
      const roles = [el, ...Array.from(el.querySelectorAll<HTMLElement>('[role]'))]
        .map((n) => n.getAttribute('role'))
        .filter((r) => r === 'alert' || r === 'status');
      expect(roles).toEqual(['alert']);
    });

    it('[EP00-TBR-003-CA2] an explicit actionLabel and a secondary action live together', () => {
      const { el } = renderWithSecondary({ actionLabel: 'Volver a cargar' });
      expect(labelsOf(el)).toEqual(['Volver a cargar', 'Ir a la primera página']);
    });

    it('[EP00-TBR-003-CA2] without secondaryActionLabel there is a single action, as in 004', () => {
      expect(labelsOf(render({ variant: 'error' }).el)).toEqual(['Reintentar']);
      expect(buttons(render({ variant: 'empty' }).el)).toHaveLength(0);
    });

    it('[EP00-TBR-003-CA2] renders no hand-written color with two actions', () => {
      const { el } = renderWithSecondary();
      expect(buttons(el)).toHaveLength(2);
      expect(el.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// [EP00-TBR-003-CA2] T4 contract, round 2 (decisions of the dev and the orchestrator, 2026-11-11):
//   1. New input actionVariant: 'default' | 'primary', 'default' by default. With 'default' the primary action is the
//      004 one (tb-btn, neither primary nor ghost). With 'primary' it is tb-btn primary. The secondary is always
//      tb-btn ghost. In the approved UI «Reintentar» (error) and «Ir a la primera página» (invalid cursor) are primary.
//   3. A secondary action without a primary action is not painted.
// Some of these tests are regression guards of the 004 look and pass before T4; the ones that need the new API fail at
// runtime because actionVariant or secondaryActionLabel does not exist yet.
// ---------------------------------------------------------------------------------------------------------------------
const lookOf = (b: HTMLElement | undefined) => ({
  btn: !!b?.classList.contains('tb-btn'),
  primary: !!b?.classList.contains('primary'),
  ghost: !!b?.classList.contains('ghost'),
});

const DEFAULT_LOOK = { btn: true, primary: false, ghost: false };
const PRIMARY_LOOK = { btn: true, primary: true, ghost: false };
const GHOST_LOOK = { btn: true, primary: false, ghost: true };

const textsOf = (variant: string) => ({ variant, heading: TEXTS[variant][0], message: TEXTS[variant][1] });

for (const theme of THEMES) {
  describe(`[EP00-TBR-003-CA2] TbEmptyState actionVariant (data-theme="${theme}")`, () => {
    beforeEach(() => document.documentElement.setAttribute('data-theme', theme));
    afterEach(() => document.documentElement.removeAttribute('data-theme'));

    it('[EP00-TBR-003-CA2] without actionVariant the primary action is the 004 tb-btn (not primary, not ghost)', () => {
      for (const variant of ['error', 'offline', 'no-results']) {
        const { el } = render({ variant });
        expect(buttons(el)).toHaveLength(1);
        expect(lookOf(buttons(el)[0])).toEqual(DEFAULT_LOOK);
      }
    });

    it('[EP00-TBR-003-CA2] actionVariant="default" looks exactly like no actionVariant', () => {
      const alone = buttons(render({ variant: 'error' }).el)[0];
      const explicit = buttons(render({ variant: 'error', actionVariant: 'default' }).el)[0];
      expect(lookOf(explicit)).toEqual(DEFAULT_LOOK);
      expect(explicit.className).toBe(alone.className);
    });

    it('[EP00-TBR-003-CA2] actionVariant="primary" makes «Reintentar» a tb-btn primary (approved UI, error)', () => {
      const { el } = render({ variant: 'error', actionVariant: 'primary' });
      expect(labelsOf(el)).toEqual(['Reintentar']);
      expect(lookOf(byLabel(el, 'Reintentar'))).toEqual(PRIMARY_LOOK);
    });

    it('[EP00-TBR-003-CA2] actionVariant="primary" applies to an explicit actionLabel (approved UI, invalid cursor)', () => {
      const { el } = render({ variant: 'error', actionLabel: 'Ir a la primera página', actionVariant: 'primary' });
      expect(labelsOf(el)).toEqual(['Ir a la primera página']);
      expect(lookOf(byLabel(el, 'Ir a la primera página'))).toEqual(PRIMARY_LOOK);
    });

    it('[EP00-TBR-003-CA2] actionVariant="primary" with a secondary: primary is tb-btn primary, secondary stays ghost', () => {
      const { el } = renderWithSecondary({ actionVariant: 'primary' });
      expect(labelsOf(el)).toEqual(['Reintentar', 'Ir a la primera página']);
      expect(lookOf(byLabel(el, 'Reintentar'))).toEqual(PRIMARY_LOOK);
      expect(lookOf(byLabel(el, 'Ir a la primera página'))).toEqual(GHOST_LOOK);
    });

    it('[EP00-TBR-003-CA2] actionVariant="default" with a secondary: primary is the 004 tb-btn, secondary ghost', () => {
      const { el } = renderWithSecondary({ actionVariant: 'default' });
      expect(labelsOf(el)).toEqual(['Reintentar', 'Ir a la primera página']);
      expect(lookOf(byLabel(el, 'Reintentar'))).toEqual(DEFAULT_LOOK);
      expect(lookOf(byLabel(el, 'Ir a la primera página'))).toEqual(GHOST_LOOK);
    });

    it('[EP00-TBR-003-CA2] actionVariant does not change the role nor the emitted outputs', () => {
      const { el, fixture, primary, secondary } = renderWithSecondary({ actionVariant: 'primary' });
      expect(lookOf(byLabel(el, 'Reintentar'))).toEqual(PRIMARY_LOOK);
      expect(roleOf(el)).toBe('alert');
      byLabel(el, 'Reintentar')!.click();
      fixture.detectChanges();
      expect(primary()).toBe(1);
      expect(secondary()).toBe(0);
    });

    it('[EP00-TBR-003-CA2] actionVariant can be switched at runtime: default -> primary -> default', () => {
      const { el, fixture } = render({ variant: 'error' });
      fixture.componentRef.setInput('actionVariant', 'primary');
      fixture.detectChanges();
      expect(lookOf(buttons(el)[0])).toEqual(PRIMARY_LOOK);
      fixture.componentRef.setInput('actionVariant', 'default');
      fixture.detectChanges();
      expect(lookOf(buttons(el)[0])).toEqual(DEFAULT_LOOK);
    });

    it('[EP00-TBR-003-CA2] focusActionOnShow still focuses the primary action when it is primary', async () => {
      const { el, fixture } = render({ variant: 'error', actionVariant: 'primary', focusActionOnShow: true });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(lookOf(byLabel(el, 'Reintentar'))).toEqual(PRIMARY_LOOK);
      expect(document.activeElement).toBe(byLabel(el, 'Reintentar'));
    });

    it('[EP00-TBR-003-CA2] renders no hand-written color with actionVariant="primary"', () => {
      const { el } = renderWithSecondary({ actionVariant: 'primary' });
      expect(lookOf(byLabel(el, 'Reintentar'))).toEqual(PRIMARY_LOOK);
      expect(el.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    });
  });

  describe(`[EP00-TBR-003-CA2] TbEmptyState secondary without primary (data-theme="${theme}")`, () => {
    beforeEach(() => document.documentElement.setAttribute('data-theme', theme));
    afterEach(() => document.documentElement.removeAttribute('data-theme'));

    for (const variant of ['empty', 'forbidden']) {
      it(`[EP00-TBR-003-CA2] ${variant} (no default action) with only secondaryActionLabel paints no button nor .acts row`, () => {
        const { el } = renderWithSecondary(textsOf(variant));
        expect(buttons(el)).toHaveLength(0);
        expect(el.querySelector('.acts')).toBeNull();
      });
    }

    it('[EP00-TBR-003-CA2] the secondary appears as soon as there is a primary, and goes away with it', () => {
      const { el, fixture } = renderWithSecondary(textsOf('empty'));
      expect(buttons(el)).toHaveLength(0);
      fixture.componentRef.setInput('actionLabel', 'Crear producto');
      fixture.detectChanges();
      expect(labelsOf(el)).toEqual(['Crear producto', 'Ir a la primera página']);
      fixture.componentRef.setInput('actionLabel', undefined);
      fixture.detectChanges();
      expect(buttons(el)).toHaveLength(0);
    });

    it('[EP00-TBR-003-CA2] an empty actionLabel on a variant without default action also hides the secondary', () => {
      const { el, fixture } = renderWithSecondary({ ...textsOf('forbidden'), actionLabel: 'Pedir acceso' });
      expect(labelsOf(el)).toEqual(['Pedir acceso', 'Ir a la primera página']);
      fixture.componentRef.setInput('actionLabel', '');
      fixture.detectChanges();
      expect(buttons(el)).toHaveLength(0);
    });
  });
}
