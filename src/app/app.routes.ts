import { Routes } from '@angular/router';

export const routes: Routes = [{ path: 'catalogo', loadChildren: () => import('./catalog').then((m) => m.routes) }];
