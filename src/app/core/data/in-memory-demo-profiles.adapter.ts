import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Profile } from '../model/profile';
import { DemoProfilesPort } from './demo-profiles.port';
import { DEMO_PROFILE_SEEDS } from './demo-profiles.fixture';

/** Does not inject IN_MEMORY_FAILURE: the profile list is part of the sign-in screen (CA6). */
@Injectable()
export class InMemoryDemoProfilesAdapter extends DemoProfilesPort {
  list(): Observable<readonly Profile[]> {
    return of(DEMO_PROFILE_SEEDS.map((seed) => seed.profile));
  }
}
