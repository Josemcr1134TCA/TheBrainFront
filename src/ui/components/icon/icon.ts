import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input } from '@angular/core';

/**
 * Internal icon of the design system. NOT exported from src/ui/index.ts (DA-5): only the pieces use it.
 * Source: v6 reference, section "Iconografía" (24x24 grid, stroke 1.75, round caps, currentColor).
 * Only the strokes the pieces use are copied here. A new stroke enters only when a piece needs it and the v6 has it.
 * Decorative by design: the svg is aria-hidden, the meaning always comes from the text next to it.
 */
export type TbIconName =
  | 'alert'
  | 'check-circle'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-up'
  | 'arrow-down'
  | 'sort'
  | 'info'
  | 'inbox'
  | 'lock'
  | 'search'
  | 'wifi-off'
  | 'x';

export type TbIconSize = 14 | 16 | 20;

interface Shape {
  readonly d?: string;
  readonly circle?: readonly [number, number, number];
}

const path = (d: string): Shape => ({ d });
const circle = (cx: number, cy: number, r: number): Shape => ({ circle: [cx, cy, r] });

const SHAPES: Record<TbIconName, readonly Shape[]> = {
  x: [path('M18 6 6 18'), path('m6 6 12 12')],
  'chevron-down': [path('m6 9 6 6 6-6')],
  'chevron-right': [path('m9 18 6-6-6-6')],
  'chevron-up': [path('m18 15-6-6-6 6')],
  sort: [path('m7 15 5 5 5-5'), path('m7 9 5-5 5 5')],
  'arrow-down': [path('M12 5v14'), path('m19 12-7 7-7-7')],
  search: [path('m21 21-4.34-4.34'), circle(11, 11, 8)],
  alert: [
    path('M12 9v4'),
    path('M12 17h.01'),
    path('M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'),
  ],
  info: [circle(12, 12, 9), path('M12 11v5'), path('M12 8h.01')],
  lock: [path('M7 11V8a5 5 0 0 1 10 0v3'), path('M5 11h14v10H5Z')],
  'wifi-off': [
    path('M2 2l20 20'),
    path('M8.5 16.5a5 5 0 0 1 7 0'),
    path('M2 8.8a15 15 0 0 1 4.2-2.6'),
    path('M10.7 5.1A15 15 0 0 1 22 8.8'),
    path('M5 12.9a10 10 0 0 1 5.2-2.7'),
    path('M13.9 10.4A10 10 0 0 1 19 12.9'),
    path('M12 20h.01'),
  ],
  'check-circle': [circle(12, 12, 9), path('m8 12 3 3 5-6')],
  inbox: [
    path('M22 12h-6l-2 3h-4l-2-3H2'),
    path(
      'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
    ),
  ],
};

@Component({
  selector: 'tb-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <svg class="tb-ico" [class.s14]="size() === 14" [class.s20]="size() === 20" viewBox="0 0 24 24" aria-hidden="true">
      @for (shape of shapes(); track $index) {
        @if (shape.circle; as c) {
          <circle [attr.cx]="c[0]" [attr.cy]="c[1]" [attr.r]="c[2]" />
        } @else {
          <path [attr.d]="shape.d" />
        }
      }
    </svg>
  `,
  styles: `
    tb-icon { display: flex; flex: none; }
    .tb-ico { width: 16px; height: 16px; flex: none; stroke: currentColor; fill: none; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; display: block; }
    .tb-ico.s20 { width: 20px; height: 20px; }
    .tb-ico.s14 { width: 14px; height: 14px; }
  `,
})
export class TbIcon {
  readonly name = input.required<TbIconName>();
  readonly size = input<TbIconSize>(16);
  protected readonly shapes = computed(() => SHAPES[this.name()]);
}
