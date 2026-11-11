import { Routes } from '@angular/router';
import { provideCatalogData } from './data/catalog-data.providers';

// Public API of the catalog module (DEC-0014). The screen route (loadComponent) is added with the screen.
export const routes: Routes = [{ path: '', providers: [provideCatalogData()] }];
