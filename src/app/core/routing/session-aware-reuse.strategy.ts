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

  /**
   * The router calls this for every route it builds from scratch (no previous route to compare with, so
   * `shouldReuseRoute` never sees it). Annotating here makes every activated route carry the epoch it was created under.
   */
  override shouldAttach(route: ActivatedRouteSnapshot): boolean {
    this.epochs.set(route, this.access.epoch());
    return false;
  }

  override shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    const epoch = this.access.epoch();
    // Fail closed: a route with no annotated epoch is never reused.
    const sameEpoch = this.epochs.get(curr) === epoch;
    this.epochs.set(future, epoch);
    // The root has no route config: it is always reused.
    return super.shouldReuseRoute(future, curr) && (future.routeConfig === null || sameEpoch);
  }
}
