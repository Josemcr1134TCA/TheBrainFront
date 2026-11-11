import { Provider } from '@angular/core';
import { providePort } from '../../core/data/data-mode';
import { InMemoryProductAdapter } from './in-memory-product.adapter';
import { ProductPort } from './product.port';

/** Registers the catalog ports; the adapter is chosen by the configured data mode. */
export function provideCatalogData(): Provider[] {
  return providePort(ProductPort, { memory: InMemoryProductAdapter });
}
