import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { TbButton } from '../button/button';
import { TbIcon, TbIconName } from '../icon/icon';

export type TbBannerLevel = 'info' | 'warn' | 'bad' | 'ok';

const LEVELS: Record<TbBannerLevel, { word: string; icon: TbIconName; role: 'status' | 'alert' }> = {
  info: { word: 'Información', icon: 'info', role: 'status' },
  warn: { word: 'Aviso', icon: 'alert', role: 'status' },
  bad: { word: 'Error', icon: 'alert', role: 'alert' },
  ok: { word: 'Listo', icon: 'check-circle', role: 'status' },
};

const toLevel = (value: string): TbBannerLevel => (value in LEVELS ? (value as TbBannerLevel) : 'info');

/**
 * Banner. Replicates v6 "c-Banner" (tb-banner): an inline message that stays on the screen.
 *
 * Inputs: level ('info' | 'warn' | 'bad' | 'ok'; each one starts with its bold word, so the color is never alone),
 * actionLabel (one action at most, a small button on the right), dismissible (only info and ok; warn and bad ignore it
 * while the problem lasts). The text is projected (one or two lines).
 * Outputs: action(), dismiss().
 * ARIA: role="alert" for 'bad', role="status" for the rest.
 * It does not decide when to show or hide itself: the caller does.
 */
@Component({
  selector: 'tb-banner',
  imports: [TbButton, TbIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'tb-banner',
    '[class.info]': "level() === 'info'",
    '[class.warn]': "level() === 'warn'",
    '[class.bad]': "level() === 'bad'",
    '[class.ok]': "level() === 'ok'",
    '[attr.role]': 'role()',
  },
  template: `
    <tb-icon [name]="icon()" />
    <div class="t"><b>{{ word() }}</b><ng-content /></div>
    @if (actionLabel() || canDismiss()) {
      <div class="acts">
        @if (actionLabel()) {
          <button tb-button size="sm" (click)="action.emit()">{{ actionLabel() }}</button>
        }
        @if (canDismiss()) {
          <button tb-button size="sm" variant="ghost" (click)="dismiss.emit()">Cerrar</button>
        }
      </div>
    }
  `,
  styles: `
    .tb-banner { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--color-line); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-ink-2); font: 400 13px/18px var(--font-sans); }
    .tb-banner > tb-icon { margin-top: 1px; }
    .tb-banner .t { flex: 1; min-width: 0; }
    .tb-banner .t b { font-weight: 600; color: var(--color-ink); margin-right: 4px; }
    .tb-banner .t b::after { content: "."; }
    .tb-banner .acts { display: flex; gap: var(--spacing-2); flex: none; align-items: center; }
    .tb-banner.info { background: var(--color-accent-soft); border-color: color-mix(in srgb, var(--color-accent) 30%, transparent); }
    .tb-banner.info > tb-icon { color: var(--color-accent); }
    .tb-banner.warn { background: var(--color-corr-soft); border-color: color-mix(in srgb, var(--color-corr) 35%, transparent); }
    .tb-banner.warn > tb-icon { color: var(--color-corr); }
    .tb-banner.bad { background: var(--color-bad-soft); border-color: color-mix(in srgb, var(--color-bad) 35%, transparent); }
    .tb-banner.bad > tb-icon { color: var(--color-bad); }
    .tb-banner.ok { background: var(--color-ok-soft); border-color: color-mix(in srgb, var(--color-ok) 35%, transparent); }
    .tb-banner.ok > tb-icon { color: var(--color-ok); }
    @media (max-width: 560px) { .tb-banner { flex-wrap: wrap; } .tb-banner .acts { margin-left: 28px; } }
  `,
})
export class TbBanner {
  // The transform accepts a plain string (a template binding of type string) and falls back to 'info' when unknown.
  readonly level = input<TbBannerLevel, string>('info', { transform: toLevel });
  readonly actionLabel = input<string | undefined>(undefined);
  readonly dismissible = input(false, { transform: booleanAttribute });
  readonly action = output<void>();
  readonly dismiss = output<void>();

  protected readonly word = computed(() => LEVELS[this.level()].word);
  protected readonly icon = computed(() => LEVELS[this.level()].icon);
  protected readonly role = computed(() => LEVELS[this.level()].role);
  protected readonly canDismiss = computed(
    () => this.dismissible() && (this.level() === 'info' || this.level() === 'ok'),
  );
}
