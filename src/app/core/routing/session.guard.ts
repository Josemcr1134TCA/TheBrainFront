import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { awaitRestore } from './await-restore';

/** CA4: without a session, send the user to /entrada keeping the requested URL to come back to. */
export const sessionGuard: CanMatchFn = (_route, segments) => {
  const router = inject(Router);
  const requested =
    router.currentNavigation()?.extractedUrl.toString() ?? '/' + segments.map((segment) => segment.path).join('/');
  return awaitRestore().pipe(
    map((store) =>
      store.session() ? true : router.createUrlTree(['/entrada'], { queryParams: { returnUrl: requested } }),
    ),
  );
};
