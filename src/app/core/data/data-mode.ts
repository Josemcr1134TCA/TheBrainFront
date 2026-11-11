import { inject, InjectionToken, Provider, Type } from '@angular/core';

/** Where the data comes from. Today only memory exists; the remote adapter adds its mode later. */
export type DataMode = 'memory';

/** Configured data mode. It has no default value: the app must state it (see provideDataMode). */
export const DATA_MODE = new InjectionToken<DataMode>('DATA_MODE');

export function provideDataMode(mode: DataMode): Provider {
  return { provide: DATA_MODE, useValue: mode };
}

type PortToken<T> = abstract new (...args: never[]) => T;

/**
 * Resolves a port to the adapter of the configured data mode. It fails with a Spanish message when the mode is not
 * configured or has no adapter, and never falls back to another mode.
 */
export function providePort<T>(port: PortToken<T>, adapters: Partial<Record<DataMode, Type<T>>>): Provider[] {
  return [
    ...Object.values(adapters),
    {
      provide: port,
      useFactory: (): T => {
        const mode = inject(DATA_MODE, { optional: true });
        const adapter = mode ? adapters[mode] : undefined;
        if (!mode || !adapter) {
          throw new Error(`No hay adaptador de datos para el modo «${mode ?? 'sin configurar'}».`);
        }
        return inject(adapter);
      },
    },
  ];
}
