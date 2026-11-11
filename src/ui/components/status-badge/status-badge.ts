import { ChangeDetectionStrategy, Component, ViewEncapsulation, booleanAttribute, computed, input } from '@angular/core';
import { formatQuantity } from '../../format/format';

/** Official statuses of the v6 ("Estados oficiales"): a closed list, one word each. */
export type TbStatusValue =
  | 'DRAFT'
  | 'IN_CAPTURE'
  | 'PENDING'
  | 'ACTIVE'
  | 'APPLIED'
  | 'WITH_ERROR'
  | 'EXPIRED';

type StatusTone = 'neutral' | 'info' | 'ok' | 'warn' | 'bad';

const STATUSES: Record<TbStatusValue, { word: string; tone: StatusTone }> = {
  DRAFT: { word: 'Borrador', tone: 'neutral' },
  IN_CAPTURE: { word: 'En captura', tone: 'info' },
  PENDING: { word: 'Pendiente', tone: 'warn' },
  ACTIVE: { word: 'Vigente', tone: 'ok' },
  APPLIED: { word: 'Aplicada', tone: 'ok' },
  WITH_ERROR: { word: 'Con error', tone: 'bad' },
  EXPIRED: { word: 'Vencida', tone: 'neutral' },
};

/**
 * Status. Replicates v6 "c-StatusBadge" (tb-status).
 *
 * Input: value (closed list, no free text: a new status enters first in the v6).
 * Shows a colored dot and the word, so the color is never alone. It does not map domain states:
 * the module's data/ layer turns a domain state into a TbStatusValue.
 */
@Component({
  selector: 'tb-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: '{{ word() }}',
  host: {
    class: 'tb-status',
    '[class.info]': "tone() === 'info'",
    '[class.ok]': "tone() === 'ok'",
    '[class.warn]': "tone() === 'warn'",
    '[class.bad]': "tone() === 'bad'",
  },
  styles: `
    .tb-status { display: inline-flex; align-items: center; gap: 6px; font: 500 12px/16px var(--font-sans); color: var(--color-ink-2); white-space: nowrap; }
    .tb-status::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--color-line-strong); }
    .tb-status.info::before { background: var(--color-accent); }
    .tb-status.ok::before { background: var(--color-ok); }
    .tb-status.warn::before { background: var(--color-corr); }
    .tb-status.bad::before { background: var(--color-bad); }
  `,
})
export class TbStatus {
  readonly value = input.required<TbStatusValue>();
  protected readonly word = computed(() => STATUSES[this.value()].word);
  protected readonly tone = computed(() => STATUSES[this.value()].tone);
}

export type TbBadgeTone = 'accent' | 'mute' | 'bad';

/**
 * Badge. Replicates v6 "c-StatusBadge" (tb-badge): a counter.
 *
 * Inputs: count, tone (accent by default), showZero (false by default: the count disappears at zero).
 * The figure goes through formatQuantity. The accessible name (aria-label) is up to the caller.
 */
@Component({
  selector: 'tb-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: '{{ text() }}',
  host: {
    class: 'tb-badge',
    '[class.mute]': "tone() === 'mute'",
    '[class.bad]': "tone() === 'bad'",
    '[hidden]': '!visible()',
  },
  styles: `
    .tb-badge { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--radius-full); background: var(--color-accent); color: var(--color-on-accent); font: 600 11px/1 var(--font-mono); }
    .tb-badge[hidden] { display: none; }
    .tb-badge.mute { background: var(--color-surface-selected); color: var(--color-ink-2); }
    .tb-badge.bad { background: var(--color-bad); color: var(--color-surface); }
  `,
})
export class TbBadge {
  readonly count = input.required<number>();
  readonly tone = input<TbBadgeTone>('accent');
  readonly showZero = input(false, { transform: booleanAttribute });
  protected readonly visible = computed(() => this.count() !== 0 || this.showZero());
  protected readonly text = computed(() => (this.visible() ? formatQuantity(this.count()) : ''));
}
