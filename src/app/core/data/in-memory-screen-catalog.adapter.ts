import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Screen } from '../model/screen';
import { ScreenCatalogPort } from './screen-catalog.port';
import { SAMPLE_SCREENS } from './screen-catalog.fixture';

/** Sample catalog behind ScreenCatalogPort. It never fails on its own: the failure is simulated on the identity adapter. */
@Injectable()
export class InMemoryScreenCatalogAdapter extends ScreenCatalogPort {
  screens(): Observable<readonly Screen[]> {
    return of(SAMPLE_SCREENS);
  }
}
