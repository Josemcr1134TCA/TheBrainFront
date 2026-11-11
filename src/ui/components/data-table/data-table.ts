import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  ViewEncapsulation,
  booleanAttribute,
  computed,
  contentChildren,
  inject,
  input,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TB_CLOCK } from '../../format/clock';
import { NULL_DISPLAY, formatDate, formatMoney, formatPercent, formatQuantity } from '../../format/format';
import { TbButton } from '../button/button';
import { TbEmptyActionVariant, TbEmptyState, TbEmptyVariant } from '../empty-state/empty-state';
import { TbIcon } from '../icon/icon';
import { TbItemLabel } from '../filter-select/filter-select';
import { createLoadingPhase } from '../skeleton/loading-phase';
import { TbSkeleton } from '../skeleton/skeleton';
import { TbStatus, TbStatusValue } from '../status-badge/status-badge';

export type TbColumnType = 'text' | 'money' | 'quantity' | 'percent' | 'date' | 'status';
export type TbTableState = 'loading' | 'ready' | 'error' | 'offline' | 'forbidden';

export interface TbSort {
  readonly columnId: string;
  readonly direction: 'asc' | 'desc';
}

// The row type belongs to the caller; the default keeps the pieces usable without declaring it.
export interface TbColumn<T = any> {
  readonly id: string;
  readonly header: string;
  readonly type: TbColumnType;
  /** Reads the cell value from the row. null, undefined or an empty text show the empty mark. */
  readonly value: (row: T) => unknown;
  /** Money only: shows two decimals. */
  readonly cents?: boolean;
  /** The header emits sortChange; the table does not reorder the rows. */
  readonly sortable?: boolean;
  /** Track of the grid for this column. By default minmax(0,1fr). */
  readonly track?: string;
}

/** Heading, message and optional action label of one EmptyState variant. */
export interface TbTableText {
  readonly heading: string;
  /** A text or a list of texts, one paragraph each. */
  readonly message: string | readonly string[];
  /** Identifier painted last as "Referencia: id". */
  readonly reference?: string;
  /** null: no action and no secondary, not even in error or offline. */
  readonly actionLabel?: string | null;
  /** 'primary' paints the action as tb-btn primary; by default it is the 004 button. */
  readonly actionVariant?: TbEmptyActionVariant;
  /** Ghost action after the primary one; it emits secondaryAction with the variant. */
  readonly secondaryActionLabel?: string;
}

/** One entry per EmptyState variant the table can show. */
export type TbTableTexts = Record<TbEmptyVariant, TbTableText>;

/**
 * Context of the ng-template tbCell: $implicit is the row; value is the raw value of the column (column.value(row)).
 * Example: <ng-template tbCell="code" let-row let-value="value">...</ng-template>
 */
export interface TbCellContext {
  readonly $implicit: any;
  readonly value: unknown;
}

/** Own cell for a column: <ng-template tbCell="columnId" let-row>...</ng-template> inside tb-data-table. */
@Directive({ selector: 'ng-template[tbCell]' })
export class TbCellDef {
  readonly columnId = input.required<string>({ alias: 'tbCell' });
  readonly template = inject<TemplateRef<TbCellContext>>(TemplateRef);
}

interface CellView {
  readonly id: string;
  readonly text: string;
  readonly status: TbStatusValue | null;
  readonly mute: boolean;
  readonly num: boolean;
  readonly mono: boolean;
  readonly value: unknown;
}

interface RowView<T> {
  readonly key: string;
  readonly row: T;
  readonly cells: readonly CellView[];
}

type Mode = 'grid' | 'skeleton' | TbEmptyVariant;

const NUMERIC: readonly string[] = ['money', 'quantity', 'percent'];

// Complete by construction: the compiler fails if a status is missing here.
const STATUS_VALUES: Record<TbStatusValue, true> = {
  DRAFT: true,
  IN_CAPTURE: true,
  PENDING: true,
  ACTIVE: true,
  APPLIED: true,
  WITH_ERROR: true,
  EXPIRED: true,
};

/**
 * DataTable with its search box. Replicates v6 "c-DataTable" and "Tablas" (grid of tb-head-row and tb-row, search tb-find).
 *
 * Anatomy: card header (title and a slot for the caller's actions: [tbActions]), filter bar (the projected
 * tb-filter-select, "Limpiar filtros" and the search box), sortable header, rows of 56 px, footer (count and note) and
 * states.
 * Inputs: title, columns, rows, rowKey, state ('loading' | 'ready' | 'error' | 'offline' | 'forbidden'), sort,
 * searchTerm, searchLabel, searchPlaceholder, filtersActive, itemLabel, count (by default rows.length; the caller
 * decides with cursor pagination), note, loadingLabel, texts (one entry per EmptyState variant), rowsActivatable.
 * Outputs: sortChange, searchChange, clearFilters, retry, loadTimeout, rowActivate, emptyAction, secondaryAction.
 * searchable (true by default): with false there is no filter bar nor search box and searchLabel is not needed (D-052).
 * Footer: content with [tbFooter] (e.g. tb-cursor-pager) replaces the table count and note, so the count shows once.
 * texts[variant].actionVariant and .secondaryActionLabel go to the EmptyState.
 * Own cell: ng-template tbCell="columnId" (see TbCellDef).
 * Loading: aria-busy from the first instant; for 300 ms it keeps what was there, then the skeleton replaces it all
 * (never mixed with old rows); at 10 s it becomes the error EmptyState with "Reintentar" and emits loadTimeout once.
 * Zero rows is "no-results" with active filters or a search term, and "empty" otherwise.
 * ARIA: role="table" labelled by the title, with row, columnheader and cell; aria-sort only on the active header; an
 * invisible role="status" region announces the count when rows are shown.
 * The action of an EmptyState emits retry (error and offline), clearFilters (no-results) or emptyAction (the others).
 *
 * It does NOT sort, filter, paginate or fetch: it emits and the caller decides (DEC-0012). stickyColumns (0, 1 or 2) fixes the first columns on
 * the left; density ('default' | 'dense') compacts the rows; texts[variant].actionLabel null shows no action and message
 * accepts a list of paragraphs plus reference (D-054). No column menu, CSV, selection or pagination (PQ-2).
 */
@Component({
  selector: 'tb-data-table',
  imports: [NgTemplateOutlet, TbButton, TbEmptyState, TbIcon, TbSkeleton, TbStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'tb-card tb-dt' },
  template: `
    @if (title()) {
      <header class="tb-sec">
        <h2>{{ title() }}</h2>
        <div class="tools"><ng-content select="[tbActions]" /></div>
      </header>
    }
    @if (searchable() && state() !== 'forbidden') {
      <div class="tb-filterbar">
        <div class="tb-filters">
          <ng-content select="tb-filter-select" />
          @if (filtersActive()) {
            <button tb-button variant="ghost" size="sm" (click)="clearFilters.emit()">Limpiar filtros</button>
          }
        </div>
        <label class="tb-find">
          <tb-icon name="search" />
          <input
            type="text"
            [attr.aria-label]="searchLabel()"
            [attr.placeholder]="searchPlaceholder() ?? null"
            [value]="searchTerm()"
            (input)="onSearch($event)"
          />
        </label>
      </div>
    }
    <div
      class="tb-dt-body"
      [attr.aria-busy]="busy() ? 'true' : null"
      [attr.aria-label]="busy() ? loadingLabel() : null"
    >
      @switch (mode()) {
        @case ('grid') {
          <ng-container *ngTemplateOutlet="grid" />
        }
        @case ('skeleton') {
          <ng-container *ngTemplateOutlet="grid" />
        }
        @default {
          @if (emptyText(); as text) {
            <tb-empty-state
              [variant]="emptyVariant()"
              [heading]="text.heading"
              [message]="text.message"
              [reference]="text.reference"
              [actionLabel]="text.actionLabel"
              [actionVariant]="text.actionVariant ?? 'default'"
              [secondaryActionLabel]="text.secondaryActionLabel"
              (action)="onEmptyAction()"
              (secondaryAction)="secondaryAction.emit(emptyVariant())"
            />
          }
        }
      }
    </div>
    @if (showFooter()) {
      <footer class="tb-dt-foot">
        <ng-content select="[tbFooter]">
          &ngsp;<span>{{ countText() }}</span>
          @if (note()) {
            <span class="tb-dt-note">{{ note() }}</span>
          }
        </ng-content>
      </footer>
    }
    <div class="tb-sr" role="status">{{ announcement() }}</div>

    <ng-template #grid>
      <div class="tb-hscroll" [class.stick1]="stickyColumns() >= 1" [class.stick2]="stickyColumns() === 2" [style.--stick2]="stick2()">
        <div role="table" class="tb-list" [class.dense]="density() === 'dense'" [attr.aria-label]="title() || null">
          <div role="row" class="tb-head-row" [style.--cols]="cols()">
            @for (column of columns(); track column.id) {
              <div
                role="columnheader"
                [class.num]="isNumeric(column)"
                [class.r]="isNumeric(column)"
                [attr.aria-sort]="ariaSort(column)"
              >
                @if (column.sortable) {
                  <button type="button" class="th" [class.r]="isNumeric(column)" (click)="onSort(column)">
                    {{ column.header }}
                    <tb-icon [name]="sortIcon(column)" [size]="14" />
                  </button>
                } @else {
                  {{ column.header }}
                }
              </div>
            }
          </div>
          @if (mode() === 'skeleton') {
            <tb-skeleton shape="rows" />
          } @else {
            @for (item of view(); track item.key) {
              <div
                role="row"
                class="tb-row"
                [class.act]="rowsActivatable()"
                [style.--cols]="cols()"
                [attr.tabindex]="rowsActivatable() ? 0 : null"
                (click)="onRowActivate(item.row, $event)"
                (keydown.enter)="onRowKey(item.row, $event)"
                (keydown.space)="onRowKey(item.row, $event)"
              >
                @for (cell of item.cells; track cell.id) {
                  <div role="cell" class="cellt" [class.num]="cell.num" [class.r]="cell.num" [class.m]="cell.mono" [class.mute]="cell.mute">
                    @if (customCell(cell.id); as def) {
                      <ng-container *ngTemplateOutlet="def.template; context: { $implicit: item.row, value: cell.value }" />
                    } @else if (cell.status) {
                      <tb-status [value]="cell.status" />
                    } @else {
                      {{ cell.text }}
                    }
                  </div>
                }
              </div>
            }
          }
        </div>
      </div>
    </ng-template>
  `,
  styles: `
    .tb-dt { display: block; }
    .tb-sec { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-3); padding: var(--spacing-3) var(--spacing-4); border-bottom: 1px solid var(--color-line); flex-wrap: wrap; }
    .tb-sec h2 { margin: 0; display: flex; align-items: center; gap: 8px; font: 600 14px/20px var(--font-sans); color: var(--color-ink); }
    .tb-sec .tools { display: flex; align-items: center; gap: var(--spacing-2); margin-left: auto; min-width: 0; }
    .tb-filterbar { display: flex; align-items: center; gap: var(--spacing-2); flex-wrap: wrap; padding: var(--spacing-3) var(--spacing-4); border-bottom: 1px solid var(--color-line); }
    .tb-filters { display: flex; flex-wrap: wrap; gap: var(--spacing-2); align-items: center; flex: 1; min-width: 0; }
    .tb-find { display: flex; align-items: center; gap: 8px; height: var(--size-control-md); padding: 0 10px; border: 1px solid var(--color-line); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-ink-muted); min-width: 0; width: 240px; margin-left: auto; }
    .tb-find:focus-within { outline: 2px solid var(--color-focus); outline-offset: 2px; }
    .tb-find input { all: unset; flex: 1; min-width: 0; font: 400 13px/1 var(--font-sans); color: var(--color-ink); }
    .tb-find input::placeholder { color: var(--color-ink-muted); }
    .tb-hscroll { overflow-x: auto; }
    .tb-hscroll.stick1 > div, .tb-hscroll.stick2 > div { min-width: max-content; }
    .tb-hscroll .tb-head-row { position: static; }
    .tb-hscroll.stick1 .tb-row > :nth-child(1), .tb-hscroll.stick1 .tb-head-row > :nth-child(1) { position: sticky; left: 0; z-index: 2; background: var(--color-surface); }
    .tb-hscroll.stick2 .tb-row > :nth-child(2), .tb-hscroll.stick2 .tb-head-row > :nth-child(2) { position: sticky; left: var(--stick2, 68px); z-index: 2; background: var(--color-surface); box-shadow: 1px 0 0 var(--color-line); }
    .tb-hscroll.stick1:not(.stick2) .tb-row > :nth-child(1), .tb-hscroll.stick1:not(.stick2) .tb-head-row > :nth-child(1) { box-shadow: 1px 0 0 var(--color-line); }
    .tb-hscroll.stick1 .tb-row:hover > :nth-child(1), .tb-hscroll.stick2 .tb-row:hover > :nth-child(2) { background: var(--color-surface-hover); }
    @media (max-width: 760px) { .tb-hscroll .tb-row > :nth-child(1), .tb-hscroll .tb-row > :nth-child(2), .tb-hscroll .tb-head-row > :nth-child(1), .tb-hscroll .tb-head-row > :nth-child(2) { position: static; box-shadow: none; } }
    .tb-head-row, .tb-row { display: grid; grid-template-columns: var(--cols); align-items: center; column-gap: var(--spacing-3); padding: 0 var(--spacing-4); }
    .tb-head-row { height: 36px; font: 500 12px/16px var(--font-sans); color: var(--color-ink-muted); border-bottom: 1px solid var(--color-line); }
    .tb-head-row > * { position: relative; min-width: 0; white-space: nowrap; }
    .tb-head-row .r, .tb-head-row .num { text-align: right; }
    .tb-head-row .th { all: unset; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; color: var(--color-ink-muted); font: 500 12px/16px var(--font-sans); border-radius: var(--radius-sm); }
    .tb-head-row .th:hover { color: var(--color-ink); }
    .tb-head-row .th:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
    .tb-head-row .th .tb-ico { width: 12px; height: 12px; opacity: 0; }
    .tb-head-row .th:hover .tb-ico, .tb-head-row [aria-sort] .tb-ico { opacity: 1; }
    .tb-head-row [aria-sort] .th { color: var(--color-ink); }
    .tb-head-row .th.r { justify-content: flex-end; }
    .tb-row { position: relative; min-height: var(--size-row); padding-top: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--color-line); outline: none; transition: background-color var(--motion-duration-fast) ease; }
    .tb-list.dense .tb-row { min-height: 44px; padding-top: 6px; padding-bottom: 6px; }
    .tb-list > .tb-row:last-child { border-bottom: 0; }
    .tb-row.act { cursor: pointer; }
    .tb-row.act:hover { background: var(--color-surface-hover); }
    .tb-row.act:focus-visible::before { content: ""; position: absolute; left: 0; top: 6px; bottom: 6px; width: 2px; border-radius: 2px; background: var(--color-focus); }
    .cellt { font: 400 13px/18px var(--font-sans); color: var(--color-ink-2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cellt.m { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
    .cellt.r { text-align: right; }
    .cellt.mute { color: var(--color-ink-muted); }
    .tb-dt-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-4); padding: 10px var(--spacing-4); border-top: 1px solid var(--color-line); font: 400 12px/16px var(--font-sans); color: var(--color-ink-muted); }
    .tb-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
    @media (max-width: 860px) { .tb-find { width: 100%; margin-left: 0; flex: 1 0 100%; } }
  `,
})
export class TbDataTable<T = any> {
  private readonly clock = inject(TB_CLOCK);

  readonly title = input<string | undefined>(undefined);
  readonly columns = input.required<readonly TbColumn<T>[]>();
  readonly rows = input<readonly T[]>([]);
  readonly rowKey = input.required<(row: T) => string>();
  readonly state = input<TbTableState>('ready');
  readonly sort = input<TbSort | null>(null);
  readonly searchTerm = input('');
  readonly searchable = input(true, { transform: booleanAttribute });
  readonly searchLabel = input<string | undefined>(undefined);
  readonly searchPlaceholder = input<string | undefined>(undefined);
  readonly filtersActive = input(false, { transform: booleanAttribute });
  readonly itemLabel = input.required<TbItemLabel>();
  readonly count = input<number | undefined>(undefined);
  readonly note = input<string | undefined>(undefined);
  readonly loadingLabel = input.required<string>();
  readonly texts = input.required<TbTableTexts>();
  readonly rowsActivatable = input(false, { transform: booleanAttribute });
  readonly stickyColumns = input<0 | 1 | 2>(0);
  readonly density = input<'default' | 'dense'>('default');

  readonly sortChange = output<TbSort>();
  readonly searchChange = output<string>();
  readonly clearFilters = output<void>();
  readonly retry = output<void>();
  readonly loadTimeout = output<void>();
  readonly rowActivate = output<T>();
  readonly emptyAction = output<TbEmptyVariant>();
  readonly secondaryAction = output<TbEmptyVariant>();

  private readonly cellDefs = contentChildren(TbCellDef);
  private readonly phase = createLoadingPhase(() => this.state() === 'loading', {
    onTimeout: () => this.loadTimeout.emit(),
  });

  /** What the body shows: the grid (with the old rows while waiting), the skeleton or an EmptyState variant. */
  protected readonly mode = computed<Mode>(() => {
    switch (this.state()) {
      case 'loading':
        if (this.phase() === 'skeleton') return 'skeleton';
        if (this.phase() === 'timeout') return 'error';
        return 'grid';
      case 'error':
      case 'offline':
        return this.state() as TbEmptyVariant;
      case 'forbidden':
        return 'forbidden';
      default:
        if (this.rows().length > 0) return 'grid';
        return this.filtersActive() || this.searchTerm().trim() !== '' ? 'no-results' : 'empty';
    }
  });

  protected readonly emptyVariant = computed(() => this.mode() as TbEmptyVariant);
  protected readonly emptyText = computed(() => {
    const mode = this.mode();
    return mode === 'grid' || mode === 'skeleton' ? null : this.texts()[mode];
  });

  protected readonly busy = computed(() => this.state() === 'loading' && this.phase() !== 'timeout');
  protected readonly cols = computed(() =>
    this.columns()
      .map((c) => c.track ?? 'minmax(0,1fr)')
      .join(' '),
  );

  /** With two fixed columns: width of the first (when it is in px) plus the column gap; otherwise the kit fallback applies. */
  protected readonly stick2 = computed(() => {
    if (this.stickyColumns() !== 2) return null;
    const track = this.columns()[0]?.track?.trim() ?? '';
    return /^\d+(\.\d+)?px$/.test(track) ? `calc(${track} + var(--spacing-3))` : null;
  });

  protected readonly view = computed<readonly RowView<T>[]>(() => {
    const columns = this.columns();
    return this.rows().map((row) => ({
      key: this.rowKey()(row),
      row,
      cells: columns.map((column) => this.cellOf(column, row)),
    }));
  });

  protected readonly showFooter = computed(() => this.mode() === 'grid' && this.total() > 0);
  private readonly total = computed(() => this.count() ?? this.rows().length);
  protected readonly countText = computed(() => {
    const total = this.total();
    return `${formatQuantity(total)} ${total === 1 ? this.itemLabel().one : this.itemLabel().other}`;
  });
  /** Announced only when rows are shown: an EmptyState already has its own role. */
  protected readonly announcement = computed(() =>
    this.state() === 'ready' && this.mode() === 'grid' && this.rows().length > 0 ? this.countText() : '',
  );

  protected isNumeric(column: TbColumn<T>): boolean {
    return NUMERIC.includes(column.type);
  }

  private readonly cellMap = computed(() => new Map(this.cellDefs().map((def) => [def.columnId(), def])));

  protected customCell(id: string): TbCellDef | undefined {
    return this.cellMap().get(id);
  }

  protected ariaSort(column: TbColumn<T>): 'ascending' | 'descending' | null {
    const sort = this.sort();
    if (!column.sortable || sort?.columnId !== column.id) return null;
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortIcon(column: TbColumn<T>): 'sort' | 'chevron-up' | 'chevron-down' {
    const sort = this.sort();
    if (sort?.columnId !== column.id) return 'sort';
    return sort.direction === 'asc' ? 'chevron-up' : 'chevron-down';
  }

  /** First click asc; on the active column it alternates desc and asc. One column at a time. */
  protected onSort(column: TbColumn<T>): void {
    const sort = this.sort();
    const direction = sort?.columnId === column.id && sort.direction === 'asc' ? 'desc' : 'asc';
    this.sortChange.emit({ columnId: column.id, direction });
  }

  protected onSearch(event: Event): void {
    this.searchChange.emit((event.target as HTMLInputElement).value);
  }

  protected onRowActivate(row: T, event: Event): void {
    if (!this.rowsActivatable()) return;
    if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea')) return;
    this.rowActivate.emit(row);
  }

  protected onRowKey(row: T, event: Event): void {
    if (!this.rowsActivatable() || event.target !== event.currentTarget) return;
    event.preventDefault();
    this.rowActivate.emit(row);
  }

  protected onEmptyAction(): void {
    const variant = this.emptyVariant();
    if (variant === 'error' || variant === 'offline') this.retry.emit();
    else if (variant === 'no-results') this.clearFilters.emit();
    else this.emptyAction.emit(variant);
  }

  private cellOf(column: TbColumn<T>, row: T): CellView {
    const value = column.value(row);
    const num = this.isNumeric(column);
    const base = { id: column.id, value, num, mono: num, status: null, mute: false };
    if (value === null || value === undefined || value === '') {
      return { ...base, text: NULL_DISPLAY, mute: true };
    }
    switch (column.type) {
      case 'money':
        return { ...base, text: formatMoney(this.asNumber(value), { cents: column.cents }), mute: this.asNumber(value) === null };
      case 'quantity':
        return { ...base, text: formatQuantity(this.asNumber(value)), mute: this.asNumber(value) === null };
      case 'percent':
        return { ...base, text: formatPercent(this.asNumber(value)), mute: this.asNumber(value) === null };
      case 'date':
        return typeof value === 'string'
          ? { ...base, text: formatDate(value, this.clock()) }
          : { ...base, text: NULL_DISPLAY, mute: true };
      case 'status':
        return typeof value === 'string' && Object.hasOwn(STATUS_VALUES, value)
          ? { ...base, text: '', status: value as TbStatusValue }
          : { ...base, text: NULL_DISPLAY, mute: true };
      default:
        return { ...base, text: String(value) };
    }
  }

  private asNumber(value: unknown): number | null {
    return typeof value === 'number' ? value : null;
  }
}
