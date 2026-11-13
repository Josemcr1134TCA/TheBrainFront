import { effect, EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer, untracked } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouteReuseStrategy } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AccessStore } from '../data/access.store';
import { SessionAwareRouteReuseStrategy } from './session-aware-reuse.strategy';

const SIGN_IN_PATH = '/entrada';

/**
 * Registers the session-aware reuse strategy, the restore at startup (a failure leaves the store signed out and does not
 * break startup) and the reaction that reloads the visible URL when the session changes (CA3). On /entrada the page
 * drives its own navigation, so the reaction stays out.
 */
export function provideIdentityRouting(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: RouteReuseStrategy, useClass: SessionAwareRouteReuseStrategy },
    provideAppInitializer(() => {
      const store = inject(AccessStore);
      const router = inject(Router);
      const location = inject(Location);
      let last = store.epoch();
      effect(() => {
        const epoch = store.epoch();
        untracked(() => {
          if (epoch === last) return;
          last = epoch;
          // Before the first navigation there is nothing to reload.
          if (!router.navigated) return;
          if (router.url.split(/[?#;]/)[0] === SIGN_IN_PATH) return;
          void router.navigateByUrl(location.path(), { onSameUrlNavigation: 'reload' });
        });
      });
      return firstValueFrom(store.restore(), { defaultValue: null }).catch(() => null);
    }),
  ]);
}
