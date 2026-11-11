import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DoCheck,
  ElementRef,
  ViewEncapsulation,
  booleanAttribute,
  inject,
  input,
} from '@angular/core';

export type TbButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
export type TbButtonSize = 'sm' | 'md' | 'lg';

/**
 * Button. Replicates v6 "c-Buttons" (tb-btn). The host is the native element: <button tb-button> or <a tb-button>.
 *
 * Inputs: variant (secondary by default), size (md by default: sm 28 px, md 32 px, lg 40 px), block, busy,
 * disabledReason (goes to title only while the button is disabled; there is no Tooltip, PQ-4).
 * Output: the native click, not wrapped.
 * ARIA: busy sets aria-busy="true" and cancels the click (keyboard activation ends in a click, so it is blocked too).
 * A button without a type gets type="button"; a link never gets one.
 *
 * Out of scope (PQ-4): icon-only button and keyboard shortcut. A button with text carries no icon.
 * It does not decide anything: the caller handles the click.
 */
@Component({
  selector: 'button[tb-button], a[tb-button]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: '<ng-content />',
  host: {
    class: 'tb-btn',
    '[class.primary]': "variant() === 'primary'",
    '[class.ghost]': "variant() === 'ghost'",
    '[class.danger]': "variant() === 'danger' || variant() === 'danger-solid'",
    '[class.solid]': "variant() === 'danger-solid'",
    '[class.sm]': "size() === 'sm'",
    '[class.lg]': "size() === 'lg'",
    '[class.block]': 'block()',
    '[attr.aria-busy]': "busy() ? 'true' : null",
  },
  styles: `
    .tb-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: var(--size-control-md); padding: 0 var(--spacing-3); border-radius: var(--radius-md); border: 1px solid var(--color-line); background: var(--color-surface); color: var(--color-ink); font: 500 13px/1 var(--font-sans); cursor: pointer; white-space: nowrap; text-decoration: none; transition: background-color var(--motion-duration-fast) ease, border-color var(--motion-duration-fast) ease, transform var(--motion-duration-fast) ease; }
    .tb-btn:hover { background: var(--color-surface-hover); }
    .tb-btn:active { transform: scale(.98); }
    .tb-btn:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
    .tb-btn.primary { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-on-accent); }
    .tb-btn.primary:hover { background: var(--color-accent); filter: brightness(1.08); }
    .tb-btn.ghost { border-color: transparent; background: transparent; color: var(--color-ink-2); }
    .tb-btn.ghost:hover { background: var(--color-surface-hover); color: var(--color-ink); }
    .tb-btn.danger { color: var(--color-bad); }
    .tb-btn.danger:hover { background: var(--color-bad-soft); border-color: var(--color-bad); }
    .tb-btn.danger.solid { background: var(--color-bad); border-color: var(--color-bad); color: var(--color-surface); }
    .tb-btn.danger.solid:hover { background: var(--color-bad); filter: brightness(1.08); }
    .tb-btn.sm { height: var(--size-control-sm); padding: 0 var(--spacing-2); font-size: 12px; }
    .tb-btn.lg { height: 40px; padding: 0 var(--spacing-4); font-size: 14px; }
    .tb-btn.block { display: flex; width: 100%; }
    .tb-btn:disabled { opacity: .4; cursor: not-allowed; }
    .tb-btn[aria-busy="true"] { pointer-events: none; opacity: .75; }
    .tb-btn[aria-busy="true"]::before { content: ""; width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: tb-spin .7s linear infinite; }
    @keyframes tb-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .tb-btn[aria-busy="true"]::before { animation-duration: 2s; } }
  `,
})
export class TbButton implements DoCheck {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private titleFromReason = false;

  readonly variant = input<TbButtonVariant>('secondary');
  readonly size = input<TbButtonSize>('md');
  readonly block = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  readonly disabledReason = input<string>('');

  constructor() {
    if (this.el.tagName === 'BUTTON' && !this.el.hasAttribute('type')) {
      this.el.setAttribute('type', 'button');
    }
    // Capture phase on the target runs before the caller's (click) listener, so stopImmediatePropagation reaches it.
    const guard = (event: Event) => this.guardClick(event);
    this.el.addEventListener('click', guard, true);
    inject(DestroyRef).onDestroy(() => this.el.removeEventListener('click', guard, true));
  }

  // The native disabled state is set by the caller, so it is read on each check to show the reason in title.
  ngDoCheck(): void {
    const reason = this.disabledReason();
    const disabled = (this.el as HTMLButtonElement).disabled === true;
    if (reason && disabled) {
      this.el.setAttribute('title', reason);
      this.titleFromReason = true;
    } else if (this.titleFromReason) {
      this.el.removeAttribute('title');
      this.titleFromReason = false;
    }
  }

  protected guardClick(event: Event): void {
    if (!this.busy()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
