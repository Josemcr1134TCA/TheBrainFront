import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TbEmptyState } from '../../../ui';

/**
 * «Sin permisos» (route /sin-permiso, EP00-TBR-005-CA5): internal target of the screen guard. Only the title, no action
 * (PA-1, PA-3). It reads neither the session nor the data mode.
 */
@Component({
  selector: 'app-access-denied-page',
  imports: [TbEmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-5">
      <div class="tb-card">
        <tb-empty-state variant="forbidden" heading="Tu perfil no puede ver esta pantalla" [message]="[]" [actionLabel]="null" />
      </div>
    </div>
  `,
  styles: `
    .tb-card { background: var(--color-surface); border: 1px solid var(--color-line); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
  `,
})
export class AccessDeniedPage {}
