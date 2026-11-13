import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, BaseRouteReuseStrategy } from '@angular/router';
import { AccessStore } from '../data/access.store';

/**
 * CA3: a route activated under another session epoch is not reused, so its components (and the data they loaded) are
 * destroyed and the URL is recognized again, running the guards with the new profile.
 */
@Injectable()
export class SessionAwareRouteReuseStrategy extends BaseRouteReuseStrategy {
  private readonly access = inject(AccessStore);
  private readonly epochs = new WeakMap<ActivatedRouteSnapshot, number>();

  override shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    const epoch = this.access.epoch();
    const sameEpoch = (this.epochs.get(curr) ?? epoch) === epoch;
    this.epochs.set(future, epoch);
    // The root has no route config: it is always reused.
    return super.shouldReuseRoute(future, curr) && (future.routeConfig === null || sameEpoch);
  }
}
