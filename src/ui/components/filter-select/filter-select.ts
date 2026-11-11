import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NULL_DISPLAY, formatQuantity } from '../../format/format';
import { TbButton } from '../button/button';
import { TbIcon } from '../icon/icon';

export interface TbFilterOption {
  readonly value: string;
  readonly label: string;
  /** Count given by the caller. null shows the empty mark; undefined shows nothing. */
  readonly count?: number | null;
}

/** Singular and plural of the thing counted: { one: 'producto', other: 'productos' }. */
export interface TbItemLabel {
  readonly one: string;
  readonly other: string;
}

const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * FilterSelect. Replicates v6 "c-FilterSelect" (tb-filter).
 *
 * Inputs: label, options ({ value, label, count }), selected (works with [(selected)] or alone), total (results of the footer, in the accent
 * color), resultLabel ({ one, other }).
 * Output: selectedChange.
 * Multiple selection; empty means "Todos". The button says "Todos" with none, the full label with one and "N elegidos"
 * with two or more; with a value the border is accent and the X appears (it empties the filter without opening).
 * The panel has an inner search that filters only the panel options (ignoring case and accents), native checkboxes with
 * their count and a footer: "Todos" marks the visible options, "Limpiar" unmarks all (PQ-6); both only emit the change.
 * ARIA: the button has aria-haspopup="true" and aria-expanded; the panel is role="group" with aria-label.
 * Keyboard: opening moves the focus to the search; Esc closes and returns the focus to the button; a click or the focus
 * outside closes it, so only one panel is open at a time.
 * It does not count or query: counts and total come from the caller.
 */
@Component({
  selector: 'tb-filter-select',
  imports: [TbButton, TbIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'tb-filter',
    '(keydown.escape)': 'onEscape()',
    '(focusout)': 'onFocusOut($event)',
    '(document:pointerdown)': 'onOutside($event)',
  },
  template: `
    <button
      tb-button
      #trigger
      type="button"
      aria-haspopup="true"
      [attr.aria-expanded]="open() ? 'true' : 'false'"
      [class.on]="active()"
      (click)="toggleOpen()"
    >
      <span class="k">{{ label() }}</span>
      <span class="v">{{ summary() }}</span>
      <tb-icon name="chevron-down" [size]="14" />
    </button>
    @if (active()) {
      <button
        type="button"
        class="tb-clear"
        [attr.aria-label]="'Quitar el filtro de ' + lowerLabel()"
        (click)="clear($event)"
      >
        <tb-icon name="x" [size]="14" />
      </button>
    }
    @if (open()) {
      <div class="tb-filter-panel" role="group" [attr.aria-label]="label()">
        <div class="srch">
          <tb-icon name="search" />
          <input
            #search
            type="text"
            placeholder="Buscar"
            [attr.aria-label]="'Buscar ' + lowerLabel()"
            [value]="query()"
            (input)="onQuery($event)"
          />
        </div>
        <div class="opts">
          @for (option of visible(); track option.value) {
            <label class="tb-ck">
              <input type="checkbox" [checked]="isSelected(option.value)" (change)="toggle(option.value)" />
              <span class="t">{{ option.label }}</span>
              @if (option.count !== undefined) {
                <span class="c">{{ option.count === null ? nullMark : format(option.count) }}</span>
              }
            </label>
          }
        </div>
        <div class="foot">
          <span>
            <button type="button" (click)="selectVisible()">Todos</button>
            ·
            <button type="button" (click)="clearAll()">Limpiar</button>
          </span>
          @if (total() !== null && total() !== undefined) {
            &ngsp;<span class="res">{{ resultText() }}</span>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .tb-filter { position: relative; display: inline-flex; }
    .tb-filter > .tb-btn { gap: 6px; max-width: 100%; }
    .tb-filter > .tb-btn .k { color: var(--color-ink-muted); }
    .tb-filter > .tb-btn .v { font-weight: 500; max-width: 18ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tb-filter > .tb-btn.on { border-color: var(--color-accent); }
    .tb-filter > .tb-btn.on:has(+ .tb-clear) { border-top-right-radius: 0; border-bottom-right-radius: 0; border-right: 0; }
    .tb-clear { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; width: var(--size-control-md); height: var(--size-control-md); border: 1px solid var(--color-accent); border-left: 1px solid var(--color-line); border-radius: 0 var(--radius-md) var(--radius-md) 0; background: var(--color-surface); color: var(--color-ink-muted); cursor: pointer; transition: background-color var(--motion-duration-fast) ease, color var(--motion-duration-fast) ease; }
    .tb-clear:hover { background: var(--color-surface-hover); color: var(--color-ink); }
    .tb-clear:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
    .tb-filter-panel { position: absolute; left: 0; top: calc(100% + 6px); z-index: 40; width: 272px; max-width: calc(100vw - 32px); background: var(--color-surface); border: 1px solid var(--color-line); border-radius: var(--radius-md); box-shadow: var(--shadow-pop); display: flex; flex-direction: column; }
    .tb-filter-panel .srch { display: flex; align-items: center; gap: var(--spacing-2); margin: var(--spacing-2); height: var(--size-control-md); padding: 0 10px; border: 1px solid var(--color-line); border-radius: var(--radius-sm); color: var(--color-ink-muted); }
    .tb-filter-panel .srch:focus-within { outline: 2px solid var(--color-focus); outline-offset: 1px; }
    .tb-filter-panel .srch input { all: unset; flex: 1; min-width: 0; font: 400 13px/18px var(--font-sans); color: var(--color-ink); }
    .tb-filter-panel .srch input::placeholder { color: var(--color-ink-muted); }
    .tb-filter-panel .opts { padding: 6px; max-height: 240px; overflow: auto; display: flex; flex-direction: column; gap: 2px; border-top: 1px solid var(--color-line); }
    .tb-ck { display: flex; align-items: center; gap: 8px; height: var(--size-control-md); padding: 0 8px; border-radius: var(--radius-sm); font: 400 13px/18px var(--font-sans); color: var(--color-ink); cursor: pointer; box-sizing: border-box; }
    .tb-ck:hover { background: var(--color-surface-hover); }
    .tb-ck:has(input:focus-visible) { outline: 2px solid var(--color-focus); outline-offset: 2px; }
    .tb-ck input { accent-color: var(--color-accent); margin: 0; }
    .tb-ck .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tb-ck .c { font: 500 12px/16px var(--font-mono); color: var(--color-ink-muted); }
    .tb-filter-panel .foot { display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-2) var(--spacing-3); border-top: 1px solid var(--color-line); font: 500 12px/16px var(--font-sans); color: var(--color-ink-muted); }
    .tb-filter-panel .foot button { all: unset; cursor: pointer; color: var(--color-ink-muted); border-radius: var(--radius-sm); }
    .tb-filter-panel .foot button:hover { color: var(--color-ink); }
    .tb-filter-panel .foot button:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
    .tb-filter-panel .foot .res { color: var(--color-accent); }
    @media (max-width: 860px) { .tb-filter-panel { width: min(272px, calc(100vw - 48px)); } }
  `,
})
export class TbFilterSelect {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly label = input.required<string>();
  readonly options = input.required<readonly TbFilterOption[]>();
  readonly selected = input<readonly string[]>([]);
  readonly selectedChange = output<string[]>();
  readonly total = input<number | null | undefined>(undefined);
  readonly resultLabel = input.required<TbItemLabel>();

  protected readonly nullMark = NULL_DISPLAY;
  protected readonly open = signal(false);
  protected readonly query = signal('');

  private readonly trigger = viewChild('trigger', { read: ElementRef<HTMLButtonElement> });
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  // Own state: the caller may bind [(selected)] or only listen to selectedChange.
  private readonly local = linkedSignal<readonly string[]>(() => this.selected());

  protected readonly active = computed(() => this.local().length > 0);
  protected readonly lowerLabel = computed(() => this.label().toLowerCase());

  protected readonly summary = computed(() => {
    const values = this.local();
    if (values.length === 0) return 'Todos';
    if (values.length === 1) {
      return this.options().find((o) => o.value === values[0])?.label ?? values[0];
    }
    return `${formatQuantity(values.length)} elegidos`;
  });

  protected readonly visible = computed(() => {
    const needle = fold(this.query().trim());
    return needle ? this.options().filter((o) => fold(o.label).includes(needle)) : this.options();
  });

  protected readonly resultText = computed(() => {
    const total = this.total() ?? 0;
    const word = total === 1 ? this.resultLabel().one : this.resultLabel().other;
    return `${formatQuantity(total)} ${word}`;
  });

  constructor() {
    // Opening moves the focus to the search box.
    afterRenderEffect(() => {
      const box = this.search();
      if (box) box.nativeElement.focus();
    });
  }

  protected format(count: number): string {
    return formatQuantity(count);
  }

  protected isSelected(value: string): boolean {
    return this.local().includes(value);
  }

  protected toggleOpen(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.query.set('');
    this.open.set(true);
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected toggle(value: string): void {
    const current = this.local();
    this.commit(current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  }

  private commit(next: string[]): void {
    this.local.set(next);
    this.selectedChange.emit(next);
  }

  /** "Todos": marks the visible options and keeps the ones already marked (PQ-6). Only emits the change. */
  protected selectVisible(): void {
    const next = new Set(this.local());
    for (const option of this.visible()) next.add(option.value);
    this.commit([...next]);
  }

  /** "Limpiar": unmarks all (PQ-6). Only emits the change. */
  protected clearAll(): void {
    this.commit([]);
  }

  /** The X next to the button: empties the filter without opening the panel. */
  protected clear(event: Event): void {
    event.stopPropagation();
    this.commit([]);
    this.open.set(false);
  }

  protected onEscape(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.trigger()?.nativeElement.focus();
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (this.open() && next && !this.host.contains(next)) this.open.set(false);
  }

  protected onOutside(event: Event): void {
    if (this.open() && !this.host.contains(event.target as Node)) this.open.set(false);
  }
}
