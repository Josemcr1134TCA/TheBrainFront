import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input, output } from '@angular/core';
import { formatQuantity } from '../../format/format';
import { TbButton } from '../button/button';
import { TbItemLabel } from '../filter-select/filter-select';
import { TbIcon } from '../icon/icon';

/**
 * CursorPager (PZ-23, D-053). Pager for a list paged by an opaque cursor: it shows the page number and the items on the
 * page, never a total nor a page jump. Replicates the footer of the approved EP00-TBR-003 UI (tb-list-foot).
 *
 * Inputs: page (below 1 is treated as 1), hasNext, count (items on this page), itemLabel ({ one, other }).
 * Outputs: first, previous, next. It does not know cursors: the caller keeps them (DEC-0012).
 * Anatomy: nav aria-label="Paginación"; on the left "Página n · N productos"; on the right "Primera página" and "Anterior"
 * (ghost, only from page 2) and "Siguiente" (tb-btn with chevron-right after the text, aria-label "Página siguiente").
 * Without hasNext "Siguiente" is disabled with the title "No hay más productos".
 * Inside tb-data-table it goes projected with the tbFooter attribute.
 */
@Component({
  selector: 'tb-cursor-pager',
  imports: [TbButton, TbIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'tb-cursor-pager' },
  template: `
    <nav aria-label="Paginación">
      <span>Página {{ current() }} · {{ countText() }}</span>
      <span class="tb-pager-acts">
        @if (current() > 1) {
          <button tb-button variant="ghost" (click)="first.emit()">Primera página</button>
          <button tb-button variant="ghost" (click)="previous.emit()">Anterior</button>
        }
        <button
          tb-button
          aria-label="Página siguiente"
          [disabled]="!hasNext()"
          disabledReason="No hay más productos"
          (click)="next.emit()"
        >Siguiente<tb-icon name="chevron-right" /></button>
      </span>
    </nav>
  `,
  styles: `
    .tb-cursor-pager { display: flex; flex: 1; min-width: 0; }
    .tb-cursor-pager nav { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-4); flex: 1; min-width: 0; }
    .tb-pager-acts { display: flex; align-items: center; gap: var(--spacing-2); flex-wrap: wrap; }
  `,
})
export class TbCursorPager {
  readonly page = input.required<number>();
  readonly hasNext = input.required<boolean>();
  readonly count = input.required<number>();
  readonly itemLabel = input.required<TbItemLabel>();

  readonly first = output<void>();
  readonly previous = output<void>();
  readonly next = output<void>();

  protected readonly current = computed(() => {
    const page = Math.floor(this.page());
    return Number.isFinite(page) && page >= 1 ? page : 1;
  });
  protected readonly countText = computed(() => {
    const count = this.count();
    return `${formatQuantity(count)} ${count === 1 ? this.itemLabel().one : this.itemLabel().other}`;
  });
}
