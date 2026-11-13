import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideDataMode } from './core/data/data-mode';
import { provideIdentityData } from './core/data/identity-data.providers';
import { provideIdentityRouting } from './core/routing/identity-routing.providers';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideDataMode('memory'),
    provideIdentityData(),
    provideIdentityRouting()
  ]
};
