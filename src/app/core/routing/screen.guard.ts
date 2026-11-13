import { inject } from '@angular/core';
import { CanMatchFn, RedirectCommand, Router } from '@angular/router';
import { map } from 'rxjs';
import { Actions } from '../model/action';
import { awaitRestore } from './await-restore';

/**
 * CA5: runs before the screen is loaded (canMatch). Without "view" it shows /sin-permiso keeping the requested URL in
 * the address bar. A route without a declared screen is denied (fails closed).
 */
export const screenGuard: CanMatchFn = (route, segments) => {
  const router = inject(Router);
  const requestedUrl =
    router.currentNavigation()?.extractedUrl.toString() ?? '/' + segments.map((segment) => segment.path).join('/');
  const screen: unknown = route.data?.['screen'];
  return awaitRestore().pipe(
    map((store) =>
      typeof screen === 'string' && store.can(screen, Actions.VIEW)
        ? true
        : new RedirectCommand(router.createUrlTree(['/sin-permiso']), { browserUrl: requestedUrl }),
    ),
  );
};
