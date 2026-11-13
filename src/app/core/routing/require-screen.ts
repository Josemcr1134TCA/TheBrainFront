import { Route } from '@angular/router';
import { screenGuard } from './screen.guard';

/** Declares the screen code a route needs: `{ path, ...requireScreen('code'), loadChildren }`. */
export function requireScreen(code: string): Pick<Route, 'canMatch' | 'data'> {
  return { canMatch: [screenGuard], data: { screen: code } };
}
