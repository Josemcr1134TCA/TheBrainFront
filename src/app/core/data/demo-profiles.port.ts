import { Observable } from 'rxjs';
import { Profile } from '../model/profile';

/** Demonstration profiles to pick from. Only the memory mode has an adapter (S8). */
export abstract class DemoProfilesPort {
  abstract list(): Observable<readonly Profile[]>;
}
