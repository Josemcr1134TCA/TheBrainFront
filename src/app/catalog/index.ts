import { Routes } from '@angular/router';
import { provideCatalogData } from './data/catalog-data.providers';

// Public API of the catalog module (DEC-0014).
export const routes: Routes = [
  {
    path: '',
    providers: [provideCatalogData()],
    loadComponent: () => import('./pages/product-list.page').then((m) => m.ProductListPage),
  },
];
