import { Observable } from 'rxjs';
import { Page, PageRequest } from './page';

/** Base port of a paged list. Errors travel through the error channel of the Observable, always as ApiError. */
export abstract class PagedListPort<T, R extends PageRequest = PageRequest> {
  abstract list(request?: R): Observable<Page<T>>;
}
