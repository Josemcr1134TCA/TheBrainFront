// [EP00-TBR-004-CA4] Skeleton (v6 c-Skeleton; design docs/diseno/EP00-TBR-004.md §3.8, §6).
// The skeleton is decorative (aria-hidden); aria-busy, aria-label and the final announcement belong to its container
// (see data-table.spec.ts for the 300 ms / 10 s phases and AJ-7). Rows follow the v6 anatomy (.tb-skel-rows > row).
// Reduced motion is checked statically in scripts/validate-ui.test.mjs.
import { TestBed } from '@angular/core/testing';
import { TbSkeleton } from './skeleton';

const THEMES = ['light', 'dark'] as const;

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(TbSkeleton);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const rowCount = (el: HTMLElement) => el.querySelectorAll('.tb-skel-rows > *').length;
// Hidden from assistive technology: the host, or its only root element, is aria-hidden="true".
function isHidden(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return true;
  const roots = Array.from(el.children) as HTMLElement[];
  return roots.length > 0 && roots.every((r) => r.getAttribute('aria-hidden') === 'true');
}

for (const theme of THEMES) {
  describe(`[EP00-TBR-004-CA4] TbSkeleton (data-theme="${theme}")`, () => {
    beforeEach(() => document.documentElement.setAttribute('data-theme', theme));
    afterEach(() => document.documentElement.removeAttribute('data-theme'));

    it('[EP00-TBR-004-CA4] rows shape draws 5 rows by default', () => {
      expect(rowCount(render({ shape: 'rows' }))).toBe(5);
    });

    it('[EP00-TBR-004-CA4] rows are clamped to 4..6', () => {
      expect(rowCount(render({ shape: 'rows', rows: 2 }))).toBe(4);
      expect(rowCount(render({ shape: 'rows', rows: 4 }))).toBe(4);
      expect(rowCount(render({ shape: 'rows', rows: 6 }))).toBe(6);
      expect(rowCount(render({ shape: 'rows', rows: 9 }))).toBe(6);
    });

    for (const shape of ['rows', 'line', 'title', 'block', 'chip']) {
      it(`[EP00-TBR-004-CA4] ${shape} is decorative: aria-hidden="true" and no text for screen readers`, () => {
        const el = render({ shape });
        expect(isHidden(el)).toBe(true);
        expect((el.textContent ?? '').trim()).toBe('');
        expect(el.querySelector('[role], [aria-busy], [aria-live]')).toBeNull();
      });
    }

    it('[EP00-TBR-004-CA4] does not set aria-busy itself (that belongs to the container)', () => {
      const el = render({ shape: 'rows' });
      expect(el.hasAttribute('aria-busy')).toBe(false);
    });

    it('[EP00-TBR-004-CA4] non-row shapes draw no rows', () => {
      for (const shape of ['line', 'title', 'block', 'chip']) {
        expect(rowCount(render({ shape }))).toBe(0);
      }
    });

    it('[EP00-TBR-004-CA4] has nothing focusable', () => {
      const el = render({ shape: 'rows' });
      expect(el.querySelector('a[href], button, input, select, textarea, [tabindex]')).toBeNull();
    });
  });
}
