import { Injector, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, filter, map, of, take } from 'rxjs';
import { AccessStore } from '../data/access.store';

/** Emits once the store has finished restoring the session (immediately when it already has). */
export function awaitRestore(): Observable<AccessStore> {
  const store = inject(AccessStore);
  if (store.status() !== 'restoring') return of(store);
  return toObservable(store.status, { injector: inject(Injector) }).pipe(
    filter((status) => status !== 'restoring'),
    take(1),
    map(() => store),
  );
}
