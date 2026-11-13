import { Observable } from 'rxjs';
import { Screen } from '../model/screen';

/** Read-only reflection of the screen catalog owned by `administration` (R-0007). */
export abstract class ScreenCatalogPort {
  abstract screens(): Observable<readonly Screen[]>;
}
