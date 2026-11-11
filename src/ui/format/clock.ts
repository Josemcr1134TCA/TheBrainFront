import { InjectionToken } from '@angular/core';

/** Source of "now" for the date format. Tests replace it: `{ provide: TB_CLOCK, useValue: () => new Date('2026-11-11T18:00:00Z') }`. */
export const TB_CLOCK = new InjectionToken<() => Date>('TB_CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date(),
});
