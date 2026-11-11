import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  effect,
  input,
  linkedSignal,
  output,
  untracked,
  viewChildren,
} from '@angular/core';
import { formatQuantity } from '../../format/format';
import { TbBadge, TbBadgeTone } from '../status-badge/status-badge';

export interface TbTab {
  readonly id: string;
  readonly label: string;
  /** Count shown in mono next to the label, formatted with formatQuantity. */
  readonly count?: number;
  readonly badge?: { readonly count: number; readonly tone: TbBadgeTone };
}

let nextInstance = 0;

/**
 * Tabs. Replicates v6 "c-Tabs" (tb-tabs).
 *
 * Inputs: tabs, selected (works with [(selected)] or alone), label (aria-label of the tablist).
 * Output: selectedChange. The active tab's panel is the projected content, inside role="tabpanel".
 * ARIA: role="tablist"; each tab is a native button role="tab" with aria-selected, aria-controls and the stable id
 * tb-tab-<instance>-<id>; the panel has tabindex="0" and aria-labelledby to the active tab.
 * Keyboard: roving tabindex (only the selected tab is in the Tab order). ArrowLeft and ArrowRight move the focus and wrap
 * at the ends without selecting; Enter or Space select (manual activation); Tab goes on to the panel.
 * The focus stays on the tab that was activated. With an invalid selection the first tab is taken and the change is
 * emitted once.
 * It does not route: syncing the tab with the address is up to the page that uses it.
 */
@Component({
  selector: 'tb-tabs',
  imports: [TbBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="tb-tabs" role="tablist" [attr.aria-label]="label()">
      @for (tab of tabs(); track tab.id) {
        <button
          #tabButton
          type="button"
          role="tab"
          [id]="tabId(tab.id)"
          [attr.aria-selected]="tab.id === current() ? 'true' : 'false'"
          [attr.aria-controls]="panelId"
          [attr.tabindex]="tab.id === current() ? 0 : -1"
          (click)="select(tab.id, $event)"
          (keydown.arrowRight)="move($index, 1, $event)"
          (keydown.arrowLeft)="move($index, -1, $event)"
        >
          {{ tab.label }}
          @if (tab.count !== undefined) {
            <span class="n">{{ format(tab.count) }}</span>
          }
          @if (tab.badge; as badge) {
            <tb-badge [count]="badge.count" [tone]="badge.tone" />
          }
        </button>
      }
    </div>
    <div
      role="tabpanel"
      class="tb-tabpanel"
      tabindex="0"
      [id]="panelId"
      [attr.aria-labelledby]="current() ? tabId(current()) : null"
    >
      <ng-content />
    </div>
  `,
  styles: `
    .tb-tabs { display: flex; gap: var(--spacing-5); border-bottom: 1px solid var(--color-line); overflow-x: auto; }
    .tb-tabs [role=tab] { display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 2px; margin-bottom: -1px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--color-ink-muted); font: 500 13px/1 var(--font-sans); cursor: pointer; white-space: nowrap; }
    .tb-tabs [role=tab]:hover { color: var(--color-ink); }
    .tb-tabs [role=tab][aria-selected="true"] { color: var(--color-ink); border-bottom-color: var(--color-accent); }
    .tb-tabs [role=tab]:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; border-radius: var(--radius-sm); }
    .tb-tabs [role=tab] .n { font: 500 11px/1 var(--font-mono); color: var(--color-ink-muted); }
    .tb-tabpanel:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; border-radius: var(--radius-sm); }
  `,
})
export class TbTabs {
  private readonly instance = nextInstance++;
  protected readonly panelId = `tb-tabpanel-${this.instance}`;

  readonly tabs = input.required<readonly TbTab[]>();
  readonly selected = input<string>('');
  readonly selectedChange = output<string>();
  readonly label = input.required<string>();

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  // Own state: the caller may bind [(selected)] or only listen to selectedChange.
  private readonly local = linkedSignal(() => this.selected());

  /** The selected tab when it exists; if not, the first one (the effect below announces the correction once). */
  protected readonly current = computed(() => {
    const tabs = this.tabs();
    const id = this.local();
    return tabs.some((t) => t.id === id) ? id : (tabs[0]?.id ?? '');
  });

  constructor() {
    effect(() => {
      const current = this.current();
      const local = this.local();
      if (current && current !== local) {
        untracked(() => {
          this.local.set(current);
          this.selectedChange.emit(current);
        });
      }
    });
  }

  protected tabId(id: string): string {
    return `tb-tab-${this.instance}-${id}`;
  }

  protected format(count: number): string {
    return formatQuantity(count);
  }

  protected select(id: string, event: Event): void {
    if (id !== this.current()) {
      this.local.set(id);
      this.selectedChange.emit(id);
    }
    const button = event.currentTarget as HTMLButtonElement;
    button.focus();
    // Keeps the active tab visible in a narrow row. jsdom has no scrollIntoView.
    if (typeof button.scrollIntoView === 'function') {
      button.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }

  protected move(index: number, step: 1 | -1, event: Event): void {
    event.preventDefault();
    const buttons = this.buttons();
    if (buttons.length === 0) return;
    buttons[(index + step + buttons.length) % buttons.length].nativeElement.focus();
  }
}
