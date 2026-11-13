import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { DATA_MODE } from '../data/data-mode';

/** S8: the demonstration selector exists only in memory mode. */
export const demoModeGuard: CanMatchFn = () => inject(DATA_MODE, { optional: true }) === 'memory';
