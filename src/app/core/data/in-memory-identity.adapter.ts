import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { ApiError } from './api-error';
import { SignInRequest } from '../model/session';
import { DEMO_PROFILE_SEEDS, DemoProfileSeed } from './demo-profiles.fixture';
import { IdentityGrantDto, IdentityPort, IDENTITY_UNAVAILABLE_MESSAGE } from './identity.port';
import { IN_MEMORY_FAILURE } from './in-memory-failure';

/** Where the demo session is kept. Tests provide a double. */
export const DEMO_SESSION_STORAGE = new InjectionToken<Storage>('DEMO_SESSION_STORAGE', {
  providedIn: 'root',
  factory: () => sessionStorage,
});

const STORAGE_KEY = 'thebrain.demo.session';
const STORAGE_VERSION = 1;

function toGrant(seed: DemoProfileSeed): IdentityGrantDto {
  return {
    user: { id: `demo-user-${seed.profile.id}`, displayName: seed.profile.name },
    profile: { ...seed.profile },
    grants: seed.grants.map((g) => ({ screen: g.screen, actions: [...g.actions] })),
  };
}

/**
 * Demonstration identity (memory mode only). It keeps just {v, profileId} in sessionStorage and never the permissions:
 * they are recomputed from the fixture on every restore, so editing the storage cannot raise permissions.
 */
@Injectable()
export class InMemoryIdentityAdapter extends IdentityPort {
  private readonly storage = inject(DEMO_SESSION_STORAGE);
  private readonly failure = inject(IN_MEMORY_FAILURE, { optional: true });

  restore(): Observable<IdentityGrantDto | null> {
    if (this.failure) return throwError(() => this.failure);
    const seed = this.readSeed();
    return of(seed ? toGrant(seed) : null);
  }

  signIn(request: SignInRequest): Observable<IdentityGrantDto> {
    if (this.failure) return throwError(() => this.failure);
    const seed = DEMO_PROFILE_SEEDS.find((s) => s.profile.id === request.profileId);
    if (!seed) {
      return throwError(
        () => new ApiError({ code: 'VALIDATION', message: IDENTITY_UNAVAILABLE_MESSAGE, field: 'profileId' }),
      );
    }
    this.write(seed.profile.id);
    return of(toGrant(seed));
  }

  signOut(): Observable<void> {
    this.remove();
    return of(undefined);
  }

  private readSeed(): DemoProfileSeed | null {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      const value: unknown = JSON.parse(raw);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const { v, profileId } = value as { v?: unknown; profileId?: unknown };
        if (v === STORAGE_VERSION && typeof profileId === 'string') {
          const seed = DEMO_PROFILE_SEEDS.find((s) => s.profile.id === profileId);
          if (seed) return seed;
        }
      }
    } catch {
      // unreadable value: handled below
    }
    this.remove();
    return null;
  }

  private write(profileId: string): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, profileId }));
    } catch {
      // storage unavailable: the session still works, it just does not survive a reload
    }
  }

  private remove(): void {
    try {
      this.storage.removeItem(STORAGE_KEY);
    } catch {
      // nothing to clean
    }
  }
}
