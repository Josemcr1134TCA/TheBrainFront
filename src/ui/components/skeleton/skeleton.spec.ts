// [EP00-TBR-004-CA4] Skeleton (v6 c-Skeleton; design docs/diseno/EP00-TBR-004.md §3.8, §6).
// The skeleton is decorative (aria-hidden); aria-busy, aria-label and the final announcement belong to its container
// (see data-table.spec.ts for the 300 ms / 10 s phases and AJ-7). Rows follow the v6 anatomy (.tb-skel-rows > row).
// Reduced motion is checked statically in scripts/validate-ui.test.mjs.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createLoadingPhase } from './loading-phase';
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

// [EP00-TBR-004-CA1] H1: fidelity with the v6 anatomy of c-Skeleton (src/ui/docs/components.css .tb-skel and the
// «Tabla» demo of the reference: thumbnail 36 px with radius-md, first line at 70 %, 55 % and 80 %, chip of 72 px).
// jsdom does not lay out, so these tests read the CSS the piece declares (its styles: metadata) and resolve it for an
// element with a small cascade: inline style first, then the matching rule with the highest specificity.
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

// The compiled styles carry a %NS% placeholder inside custom property names (var(--%NS%radius-sm)); it is removed.
const normalize = (v: string) => v.replace(/%ns%/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();

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

describe('[EP00-TBR-004-CA1] TbSkeleton follows the v6 anatomy (H1)', () => {
  const rowsOf = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('.tb-skel-rows > *'));
  const thumbOf = (row: HTMLElement) => row.children[0] as HTMLElement;
  const firstLineOf = (row: HTMLElement) => row.querySelector('.tb-skel.line') as HTMLElement;
  const chipOf = (row: HTMLElement) => row.querySelector('.tb-skel.chip') as HTMLElement;

  it('[EP00-TBR-004-CA1] each row starts with a 36 px thumbnail with radius-md', () => {
    const rules = componentRules(TbSkeleton);
    for (const row of rowsOf(render({ shape: 'rows' }))) {
      const thumb = thumbOf(row);
      expect(thumb.classList.contains('tb-skel')).toBe(true);
      expect(declared(thumb, 'width', rules)).toBe('36px');
      expect(declared(thumb, 'height', rules)).toBe('36px');
      expect(declared(thumb, 'border-radius', rules)).toBe('var(--radius-md)');
    }
  });

  it('[EP00-TBR-004-CA1] the chip of a row measures 72 px, like the chip shape', () => {
    const rules = componentRules(TbSkeleton);
    for (const row of rowsOf(render({ shape: 'rows' }))) expect(declared(chipOf(row), 'width', rules)).toBe('72px');
    const chip = render({ shape: 'chip' }).querySelector('.tb-skel.chip') as HTMLElement;
    expect(declared(chip, 'width', rules)).toBe('72px');
    expect(declared(chip, 'height', rules)).toBe('22px');
  });

  // H8: the «Tabla» demo of the v6 (reference.src.html, previews) has exactly 4 rows, at 70, 55, 80 and 62 %. The 90 %
  // and 75 % of the reference belong to the «Ficha» demo (two lines of a card), not to table rows. Neither the v6 nor the
  // design (§3.8) says the width of rows 5 and 6, so they are not fixed here (open question for the PO).
  it('[EP00-TBR-004-CA1] the first line of the first four rows varies its width as in the v6 demo: 70 %, 55 %, 80 % and 62 %', () => {
    const rules = componentRules(TbSkeleton);
    for (const rows of [4, 5, 6]) {
      const widths = rowsOf(render({ shape: 'rows', rows })).map((row) => declared(firstLineOf(row), 'width', rules));
      expect(widths.slice(0, 4)).toEqual(['70%', '55%', '80%', '62%']);
    }
  });
});

// [EP00-TBR-004-CA4] createLoadingPhase (design docs/diseno/EP00-TBR-004.md §3 states and §6 edge cases 1-3; AJ-7).
// Black box over the phase signal with Vitest fake timers: nothing before 300 ms, the skeleton from 300 ms to 10 s,
// the error at 10 s (onTimeout once), and a single phase at a time so old rows never mix with the skeleton.
@Component({ selector: 'tb-loading-phase-host', template: '' })
class LoadingPhaseHost {
  loading = signal(false);
  timeouts = 0;
  phase = createLoadingPhase(() => this.loading(), { onTimeout: () => this.timeouts++ });
}

describe('[EP00-TBR-004-CA4] createLoadingPhase', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function start(loading: boolean) {
    const fixture = TestBed.createComponent(LoadingPhaseHost);
    const host = fixture.componentInstance;
    host.loading.set(loading);
    fixture.detectChanges();
    const setLoading = (value: boolean) => {
      host.loading.set(value);
      fixture.detectChanges();
    };
    const wait = (ms: number) => {
      vi.advanceTimersByTime(ms);
      fixture.detectChanges();
    };
    return { fixture, host, setLoading, wait };
  }

  it('[EP00-TBR-004-CA4] is idle while nothing is loading', () => {
    const { host, wait } = start(false);
    expect(host.phase()).toBe('idle');
    wait(20_000);
    expect(host.phase()).toBe('idle');
    expect(host.timeouts).toBe(0);
  });

  it('[EP00-TBR-004-CA4] draws nothing before 300 ms and the skeleton at 300 ms', () => {
    const { host, wait } = start(true);
    expect(host.phase()).toBe('waiting');
    wait(299);
    expect(host.phase()).toBe('waiting');
    wait(1);
    expect(host.phase()).toBe('skeleton');
  });

  it('[EP00-TBR-004-CA4] keeps the skeleton until 10 s, then turns to error and calls onTimeout once', () => {
    const { host, wait } = start(true);
    wait(9_999);
    expect(host.phase()).toBe('skeleton');
    expect(host.timeouts).toBe(0);
    wait(1);
    expect(host.phase()).toBe('timeout');
    expect(host.timeouts).toBe(1);
    wait(30_000);
    expect(host.phase()).toBe('timeout');
    expect(host.timeouts).toBe(1);
  });

  it('[EP00-TBR-004-CA4] edge case 1: data before 300 ms means the skeleton never appears', () => {
    const { host, setLoading, wait } = start(true);
    wait(200);
    setLoading(false);
    expect(host.phase()).toBe('idle');
    wait(20_000);
    expect(host.phase()).toBe('idle');
    expect(host.timeouts).toBe(0);
  });

  it('[EP00-TBR-004-CA4] edge case 2: data after 10 s is shown (back to idle)', () => {
    const { host, setLoading, wait } = start(true);
    wait(10_000);
    expect(host.phase()).toBe('timeout');
    setLoading(false);
    expect(host.phase()).toBe('idle');
  });

  it('[EP00-TBR-004-CA4] edge case 3 (AJ-7): a reload keeps what was visible for 300 ms, then only the skeleton', () => {
    const { host, setLoading, wait } = start(false);
    setLoading(true);
    // 'waiting' tells the container to keep the previous rows; it is never 'skeleton' at the same time.
    expect(host.phase()).toBe('waiting');
    wait(299);
    expect(host.phase()).toBe('waiting');
    wait(1);
    // A single phase: from here the container replaces the old rows with the skeleton, without mixing them.
    expect(host.phase()).toBe('skeleton');
  });

  it('[EP00-TBR-004-CA4] a new load restarts the 300 ms and 10 s counts and times out once per load', () => {
    const { host, setLoading, wait } = start(true);
    wait(9_000);
    setLoading(false);
    setLoading(true);
    expect(host.phase()).toBe('waiting');
    wait(299);
    expect(host.phase()).toBe('waiting');
    wait(1);
    expect(host.phase()).toBe('skeleton');
    wait(9_699);
    expect(host.timeouts).toBe(0);
    wait(1);
    expect(host.phase()).toBe('timeout');
    expect(host.timeouts).toBe(1);
    setLoading(false);
    setLoading(true);
    wait(10_000);
    expect(host.timeouts).toBe(2);
  });

  it('[EP00-TBR-004-CA4] pending timers stop when the owner is destroyed', () => {
    const { fixture, host } = start(true);
    fixture.destroy();
    vi.advanceTimersByTime(20_000);
    expect(host.timeouts).toBe(0);
    expect(host.phase()).toBe('waiting');
  });
});
