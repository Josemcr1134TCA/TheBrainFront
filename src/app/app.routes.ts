import { Routes } from '@angular/router';
import { demoModeGuard } from './core/routing/demo-mode.guard';
import { requireScreen } from './core/routing/require-screen';
import { sessionGuard } from './core/routing/session.guard';

export const routes: Routes = [
  // CA4, CA6, CA3: the demo selector, with or without a session; it exists only in memory mode (S8).
  {
    path: 'entrada',
    canMatch: [demoModeGuard],
    loadComponent: () => import('./core/pages/demo-sign-in.page').then((m) => m.DemoSignInPage),
  },
  // CA5: internal target of the screen guard (PA-2).
  {
    path: 'sin-permiso',
    canMatch: [sessionGuard],
    loadComponent: () => import('./core/pages/access-denied.page').then((m) => m.AccessDeniedPage),
  },
  // Protected block: a session is required and it is re-evaluated whenever the session changes (CA3, CA4).
  {
    path: '',
    canMatch: [sessionGuard],
    runGuardsAndResolvers: 'always',
    children: [
      {
        path: 'catalogo',
        ...requireScreen('sample.catalog.01'),
        loadChildren: () => import('./catalog').then((m) => m.routes),
      },
    ],
  },
];
