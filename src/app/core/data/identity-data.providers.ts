import { Provider } from '@angular/core';
import { providePort } from './data-mode';
import { DemoProfilesPort } from './demo-profiles.port';
import { IdentityPort } from './identity.port';
import { InMemoryDemoProfilesAdapter } from './in-memory-demo-profiles.adapter';
import { InMemoryIdentityAdapter } from './in-memory-identity.adapter';
import { InMemoryScreenCatalogAdapter } from './in-memory-screen-catalog.adapter';
import { ScreenCatalogPort } from './screen-catalog.port';

/** Registers the identity ports. The demonstration adapters exist only for the memory mode (S8). */
export function provideIdentityData(): Provider[] {
  return [
    ...providePort(IdentityPort, { memory: InMemoryIdentityAdapter }),
    ...providePort(DemoProfilesPort, { memory: InMemoryDemoProfilesAdapter }),
    ...providePort(ScreenCatalogPort, { memory: InMemoryScreenCatalogAdapter }),
  ];
}
