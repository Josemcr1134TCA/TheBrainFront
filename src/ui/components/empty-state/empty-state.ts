import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  afterRenderEffect,
  booleanAttribute,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TbButton } from '../button/button';
import { TbIcon, TbIconName } from '../icon/icon';

export type TbEmptyVariant = 'empty' | 'no-results' | 'forbidden' | 'offline' | 'error';
export type TbEmptyActionVariant = 'default' | 'primary';

const VARIANTS: Record<
  TbEmptyVariant,
  { icon: TbIconName; role: 'status' | 'alert'; defaultAction: string | null }
> = {
  empty: { icon: 'inbox', role: 'status', defaultAction: null },
  'no-results': { icon: 'search', role: 'status', defaultAction: 'Limpiar filtros' },
  forbidden: { icon: 'lock', role: 'status', defaultAction: null },
  offline: { icon: 'wifi-off', role: 'alert', defaultAction: 'Reintentar' },
  error: { icon: 'alert', role: 'alert', defaultAction: 'Reintentar' },
};

/**
 * EmptyState. Replicates v6 "c-EmptyState" (tb-empty): what a list, table or record shows when there is nothing to
 * show, it cannot be seen or it failed to load.
 *
 * Inputs: variant (empty, no-results, forbidden, offline, error), heading, message, actionLabel,
 * focusActionOnShow (the action takes the focus when it appears; only when the person just triggered the load).
 * actionLabel null: no action and no secondary (D-054). message: a text or a list of texts, one <p> each. reference: last
 * <p> "Referencia: id" with the id in .tb-num; not painted when empty (D-054).
 * Default action: no-results -> "Limpiar filtros", offline and error -> "Reintentar", the others none.
 * actionVariant: 'default' (tb-btn, as in 004) or 'primary' (tb-btn primary). secondaryActionLabel: a ghost tb-btn after the
 * primary in the same .acts row; it is not painted without a primary action (D-052).
 * One primary action and at most one secondary. Outputs: action(), secondaryAction().
 * ARIA: role="alert" for error and offline; role="status" for empty, no-results and forbidden (PQ-5, the v6 does not
 * define forbidden). The icon is decorative (aria-hidden).
 * It does not retry, clear or navigate: the caller handles action().
 */
@Component({
  selector: 'tb-empty-state',
  imports: [TbButton, TbIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'tb-empty',
    '[class.err]': "variant() === 'error'",
    '[class.lock]': "variant() === 'forbidden'",
    '[class.off]': "variant() === 'offline'",
    '[attr.role]': 'role()',
  },
  template: `
    <span class="ico"><tb-icon [name]="icon()" [size]="20" /></span>
    <b>{{ heading() }}</b>
    @for (paragraph of paragraphs(); track $index) {
      <p>{{ paragraph }}</p>
    }
    @if (reference(); as id) {
      <p>Referencia: <span class="tb-num">{{ id }}</span></p>
    }
    @if (label(); as text) {
      <div class="acts">
        <button tb-button #actionButton [variant]="actionVariant() === 'primary' ? 'primary' : 'secondary'" (click)="action.emit()">{{ text }}</button>
        @if (secondaryActionLabel(); as secondaryText) {
          <button tb-button variant="ghost" (click)="secondaryAction.emit()">{{ secondaryText }}</button>
        }
      </div>
    }
  `,
  styles: `
    .tb-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--spacing-2); padding: var(--spacing-8) var(--spacing-5); color: var(--color-ink-muted); }
    .tb-empty .ico { width: 40px; height: 40px; border-radius: var(--radius-lg); display: grid; place-items: center; background: var(--color-surface-hover); color: var(--color-ink-muted); margin-bottom: var(--spacing-1); }
    .tb-empty b { font: 600 14px/20px var(--font-sans); color: var(--color-ink); }
    .tb-empty p { margin: 0; max-width: 44ch; font: 400 13px/19px var(--font-sans); }
    .tb-empty .tb-num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
    .tb-empty .acts { margin-top: var(--spacing-3); display: flex; gap: var(--spacing-2); flex-wrap: wrap; justify-content: center; }
    .tb-empty.err .ico { background: var(--color-bad-soft); color: var(--color-bad); }
    .tb-empty.lock .ico, .tb-empty.off .ico { background: var(--color-corr-soft); color: var(--color-corr); }
  `,
})
export class TbEmptyState {
  readonly variant = input.required<TbEmptyVariant>();
  readonly heading = input.required<string>();
  readonly message = input.required<string | readonly string[]>();
  readonly reference = input<string | undefined>(undefined);
  readonly actionLabel = input<string | null | undefined>(undefined);
  readonly actionVariant = input<TbEmptyActionVariant>('default');
  readonly secondaryActionLabel = input<string | undefined>(undefined);
  readonly focusActionOnShow = input(false, { transform: booleanAttribute });
  readonly action = output<void>();
  readonly secondaryAction = output<void>();

  private readonly actionButton = viewChild('actionButton', { read: ElementRef });

  protected readonly icon = computed(() => VARIANTS[this.variant()].icon);
  protected readonly role = computed(() => VARIANTS[this.variant()].role);
  protected readonly paragraphs = computed<readonly string[]>(() => {
    const message = this.message();
    return typeof message === 'string' ? [message] : message;
  });
  /** null means no action; undefined or an empty text means the default action of the variant. */
  protected readonly label = computed(() => {
    const label = this.actionLabel();
    return label === null ? null : label || VARIANTS[this.variant()].defaultAction;
  });

  constructor() {
    afterRenderEffect(() => {
      const button = this.actionButton();
      if (button && this.focusActionOnShow()) (button.nativeElement as HTMLElement).focus();
    });
  }
}
