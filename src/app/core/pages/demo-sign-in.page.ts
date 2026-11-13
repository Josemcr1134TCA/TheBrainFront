import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { TbBanner, TbSkeleton } from '../../../ui';
import { AccessStore } from '../data/access.store';
import { DemoProfilesPort } from '../data/demo-profiles.port';
import { Profile } from '../model/profile';
import { safeReturnUrl } from '../routing/return-url';

const IDENTITY_ERROR = 'La identidad no está disponible por ahora. Elige un perfil otra vez.';

/** Avatar mark: the trailing number of the name («Perfil de demostración 4» -> «4»), else its first letter. */
function initialOf(name: string): string {
  const digits = /(\d+)\s*$/.exec(name);
  return digits ? digits[1] : name.trim().charAt(0).toUpperCase();
}

/**
 * Demo entry (route /entrada, EP00-TBR-005-CA3, CA4, CA6): profile selector, with or without a session open (P-2).
 * Choosing signs in (or switches) and goes to safeReturnUrl(returnUrl). Choosing the active profile only goes back (PA-5).
 */
@Component({
  selector: 'app-demo-sign-in-page',
  imports: [TbBanner, TbSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './demo-sign-in.page.html',
  styleUrl: './demo-sign-in.page.css',
})
export class DemoSignInPage {
  private readonly store = inject(AccessStore);
  private readonly profilesPort = inject(DemoProfilesPort);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** null while the list loads. */
  protected readonly profiles = signal<readonly Profile[] | null>(null);
  /** Profile being confirmed (PA-4): its row says «Entrando…» or «Cambiando…» and every row is disabled. */
  protected readonly pendingId = signal<string | null>(null);
  /** Where the error comes from: loading the list (CA6 text) or trying to sign in or switch (D3 text). */
  protected readonly failed = signal<'load' | 'attempt' | null>(null);

  protected readonly activeId = computed(() => this.store.session()?.profile.id ?? null);
  protected readonly busyText = computed(() => (this.store.session() ? 'Cambiando…' : 'Entrando…'));
  protected readonly errorText = computed(() => {
    const failure = this.failed();
    if (failure === null) return null;
    if (failure === 'load') return IDENTITY_ERROR;
    const active = this.store.session()?.profile.name;
    return active ? `No pudimos cambiar de perfil. Sigues con ${active}.` : IDENTITY_ERROR;
  });

  constructor() {
    this.profilesPort
      .list()
      .pipe(
        catchError(() => {
          this.failed.set('load');
          return of<readonly Profile[]>([]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((list) => this.profiles.set(list));
  }

  protected initial(profile: Profile): string {
    return initialOf(profile.name);
  }

  protected choose(profile: Profile): void {
    if (this.pendingId() !== null) return;
    this.failed.set(null);
    this.pendingId.set(profile.id);
    const request = this.store.session()
      ? this.store.switchProfile(profile.id)
      : this.store.signIn({ kind: 'demo', profileId: profile.id });
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.pendingId.set(null);
        void this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')));
      },
      error: () => {
        this.pendingId.set(null);
        this.failed.set('attempt');
      },
      complete: () => this.pendingId.set(null),
    });
  }
}
