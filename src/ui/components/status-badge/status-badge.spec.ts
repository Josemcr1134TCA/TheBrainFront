// [EP00-TBR-004-CA3] StatusBadge: Status and Badge, no Chip (v6 c-StatusBadge; PQ-3; design docs/diseno/EP00-TBR-004.md §3.2, §6).
// Color is never alone: each official status carries its word next to the dot.
import { TestBed } from '@angular/core/testing';
import * as statusBadge from './status-badge';
import { TbBadge, TbStatus } from './status-badge';

const THEMES = ['light', 'dark'] as const;

// "Estados oficiales" of the v6: closed list, one word each.
const OFFICIAL_STATUSES = [
  ['DRAFT', 'Borrador'],
  ['IN_CAPTURE', 'En captura'],
  ['PENDING', 'Pendiente'],
  ['ACTIVE', 'Vigente'],
  ['APPLIED', 'Aplicada'],
  ['WITH_ERROR', 'Con error'],
  ['EXPIRED', 'Vencida'],
] as const;

function renderStatus(value: string) {
  const fixture = TestBed.createComponent(TbStatus);
  fixture.componentRef.setInput('value', value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function renderBadge(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(TbBadge);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const isEmpty = (el: HTMLElement) => el.hidden || (el.textContent ?? '').trim() === '';

for (const theme of THEMES) {
  describe(`[EP00-TBR-004-CA3] TbStatus (data-theme="${theme}")`, () => {
    beforeEach(() => document.documentElement.setAttribute('data-theme', theme));
    afterEach(() => document.documentElement.removeAttribute('data-theme'));

    for (const [value, word] of OFFICIAL_STATUSES) {
      it(`[EP00-TBR-004-CA3] ${value} shows its word "${word}", so the color is never alone`, () => {
        const el = renderStatus(value);
        expect((el.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe(word);
      });
    }

    it('[EP00-TBR-004-CA3] each official status has a different word', () => {
      const words = OFFICIAL_STATUSES.map(([value]) =>
        (renderStatus(value).textContent ?? '').trim(),
      );
      expect(new Set(words).size).toBe(OFFICIAL_STATUSES.length);
    });

    it('[EP00-TBR-004-CA3] renders no hand-written color', () => {
      const el = renderStatus('ACTIVE');
      expect(el.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    });
  });

  describe(`[EP00-TBR-004-CA3] TbBadge (data-theme="${theme}")`, () => {
    beforeEach(() => document.documentElement.setAttribute('data-theme', theme));
    afterEach(() => document.documentElement.removeAttribute('data-theme'));

    it('[EP00-TBR-004-CA3] shows the count formatted with formatQuantity: 1234 -> 1,234', () => {
      const { el } = renderBadge({ count: 1234, tone: 'accent' });
      expect(el.textContent?.trim()).toBe('1,234');
    });

    it('[EP00-TBR-004-CA3] accepts the three tones of the v6 (accent, mute, bad)', () => {
      for (const tone of ['accent', 'mute', 'bad']) {
        const { el } = renderBadge({ count: 3, tone });
        expect(el.textContent?.trim()).toBe('3');
      }
    });

    it('[EP00-TBR-004-CA3] disappears at zero by default', () => {
      const { el } = renderBadge({ count: 0, tone: 'mute' });
      expect(isEmpty(el)).toBe(true);
    });

    it('[EP00-TBR-004-CA3] shows 0 when showZero is true', () => {
      const { el } = renderBadge({ count: 0, tone: 'mute', showZero: true });
      expect(isEmpty(el)).toBe(false);
      expect(el.textContent?.trim()).toBe('0');
    });
  });
}

describe('[EP00-TBR-004-CA3] StatusBadge scope', () => {
  it('[EP00-TBR-004-CA3] exports Status and Badge but no Chip (PQ-3)', () => {
    const names = Object.keys(statusBadge);
    expect(names).toContain('TbStatus');
    expect(names).toContain('TbBadge');
    expect(names.filter((n) => /chip/i.test(n))).toEqual([]);
  });
});
