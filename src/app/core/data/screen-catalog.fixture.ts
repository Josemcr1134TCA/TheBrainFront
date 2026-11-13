import { screenCode, Screen } from '../model/screen';

/**
 * SAMPLE catalog (S6 still open, Q-0010): every code carries the visible prefix "sample." and none looks definitive.
 * The real catalog belongs to `administration` (R-0007); when it is known, only this content changes.
 */
export const SAMPLE_SCREENS: readonly Screen[] = [
  { code: screenCode('sample.catalog.01'), module: 'sample', name: 'Pantalla de muestra 1', active: true },
  { code: screenCode('sample.catalog.02'), module: 'sample', name: 'Pantalla de muestra 2', active: true },
  { code: screenCode('sample.replenishment.01'), module: 'sample', name: 'Pantalla de muestra 3', active: true },
  { code: screenCode('sample.purchasing.01'), module: 'sample', name: 'Pantalla de muestra 4', active: true },
  { code: screenCode('sample.inventory.01'), module: 'sample', name: 'Pantalla de muestra 5', active: true },
  { code: screenCode('sample.commercial.01'), module: 'sample', name: 'Pantalla de muestra 6', active: true },
  { code: screenCode('sample.commercial.02'), module: 'sample', name: 'Pantalla de muestra 7', active: false },
];
