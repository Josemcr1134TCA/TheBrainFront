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
