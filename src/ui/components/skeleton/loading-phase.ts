import { DestroyRef, Signal, effect, inject, signal, untracked } from '@angular/core';

/**
 * Phases of a load seen by the person (v6 "c-Skeleton", Reglas; AJ-7).
 * - idle: not loading.
 * - waiting: loading for less than 300 ms; keep what was visible, draw no skeleton.
 * - skeleton: from 300 ms; replace everything with the skeleton, never mixed with old rows.
 * - timeout: from 10 s; the container shows an error EmptyState with "Reintentar".
 */
export type TbLoadingPhase = 'idle' | 'waiting' | 'skeleton' | 'timeout';

export const SKELETON_DELAY_MS = 300;
export const LOADING_TIMEOUT_MS = 10_000;

export interface TbLoadingTimers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface TbLoadingPhaseOptions {
  /** Called once per load when it reaches the timeout. */
  onTimeout?: () => void;
  delayMs?: number;
  timeoutMs?: number;
  /** Replaceable timers (tests). By default, the global setTimeout and clearTimeout. */
  timers?: TbLoadingTimers;
}

const DEFAULT_TIMERS: TbLoadingTimers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Internal utility (not exported from src/ui/index.ts). Must be called in an injection context.
 * Timers are cleared when loading ends, when it restarts and when the owner is destroyed.
 * If data arrives after the timeout, loading turns false and the phase goes back to idle.
 */
export function createLoadingPhase(
  loading: () => boolean,
  options: TbLoadingPhaseOptions = {},
): Signal<TbLoadingPhase> {
  const timers = options.timers ?? DEFAULT_TIMERS;
  const delayMs = options.delayMs ?? SKELETON_DELAY_MS;
  const timeoutMs = options.timeoutMs ?? LOADING_TIMEOUT_MS;
  const phase = signal<TbLoadingPhase>(loading() ? 'waiting' : 'idle');
  let handles: unknown[] = [];

  const clearAll = () => {
    for (const handle of handles) timers.clear(handle);
    handles = [];
  };

  effect(() => {
    if (!loading()) {
      untracked(() => {
        clearAll();
        phase.set('idle');
      });
      return;
    }
    untracked(() => {
      clearAll();
      phase.set('waiting');
      handles.push(timers.set(() => phase.set('skeleton'), delayMs));
      handles.push(
        timers.set(() => {
          phase.set('timeout');
          options.onTimeout?.();
        }, timeoutMs),
      );
    });
  });

  inject(DestroyRef).onDestroy(clearAll);
  return phase.asReadonly();
}
