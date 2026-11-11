import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input } from '@angular/core';

export type TbSkeletonShape = 'rows' | 'line' | 'title' | 'block' | 'chip';

const MIN_ROWS = 4;
const MAX_ROWS = 6;
const DEFAULT_ROWS = 5;
// Width of the first line of each row, as in the v6 demo.
const LINE_WIDTHS: readonly number[] = [70, 55, 80, 62];

/**
 * Skeleton. Replicates v6 "c-Skeleton".
 *
 * Inputs: shape ('rows' | 'line' | 'title' | 'block' | 'chip'), rows (only for 'rows'; clamped to 4..6, 5 by default).
 * A row is 56 px tall and has a thumbnail, two lines and a label.
 * It is decorative (aria-hidden). aria-busy, aria-label and the final announcement belong to the container, not to it.
 * The shimmer stops with reduced motion and leaves a fixed block.
 * The 300 ms and 10 s timing lives in createLoadingPhase (loading-phase.ts), not in this component.
 */
@Component({
  selector: 'tb-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { 'aria-hidden': 'true', style: 'display: block;' },
  template: `
    @switch (shape()) {
      @case ('rows') {
        <div class="tb-skel-rows">
          @for (row of rowList(); track row) {
            <div>
              <span class="tb-skel thumb"></span>
              <span class="tb-skel line" [style.width.%]="lineWidths[row % lineWidths.length]"></span>
              <span class="tb-skel line"></span>
              <span class="tb-skel chip"></span>
            </div>
          }
        </div>
      }
      @case ('title') {
        <span class="tb-skel title"></span>
      }
      @case ('block') {
        <span class="tb-skel block"></span>
      }
      @case ('chip') {
        <span class="tb-skel chip"></span>
      }
      @default {
        <span class="tb-skel line"></span>
      }
    }
  `,
  styles: `
    .tb-skel { display: block; border-radius: var(--radius-sm); background: linear-gradient(90deg, var(--color-surface-hover) 25%, var(--color-surface-selected) 50%, var(--color-surface-hover) 75%); background-size: 200% 100%; animation: tb-shim 1.4s ease-in-out infinite; }
    .tb-skel.line { height: 12px; }
    .tb-skel.title { height: 20px; width: 38%; }
    .tb-skel.block { height: 72px; border-radius: var(--radius-md); }
    .tb-skel.chip { height: 22px; width: 72px; }
    .tb-skel.thumb { width: 36px; height: 36px; border-radius: var(--radius-md); }
    .tb-skel-rows { display: flex; flex-direction: column; }
    .tb-skel-rows > div { display: grid; grid-template-columns: 36px minmax(0, 1fr) 90px 70px; gap: var(--spacing-4); align-items: center; height: var(--size-row); padding: 0 var(--spacing-5); border-top: 1px solid var(--color-line); }
    .tb-skel-rows > div:first-child { border-top: 0; }
    @keyframes tb-shim { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) { .tb-skel { animation: none; } }
  `,
})
export class TbSkeleton {
  protected readonly lineWidths = LINE_WIDTHS;
  readonly shape = input<TbSkeletonShape>('rows');
  readonly rows = input<number>(DEFAULT_ROWS);
  protected readonly rowList = computed(() => {
    const n = Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.trunc(this.rows()) || DEFAULT_ROWS));
    return Array.from({ length: n }, (_, i) => i);
  });
}
