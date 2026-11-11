// Common page contract of TheBrainApi lists (design EP00-TBR-003 §3.1). Forward-only cursor pagination.

/** Page size used when the request does not give one. */
export const DEFAULT_PAGE_SIZE = 20;

/** Largest page size the contract accepts. */
export const MAX_PAGE_SIZE = 100;

export interface Page<T> {
  readonly items: readonly T[];
  /** Opaque cursor for the next page; null means there are no more pages. */
  readonly nextCursor: string | null;
}

export interface PageRequest {
  /** Opaque cursor received in a previous page; absent or null asks for the first page. */
  readonly cursor?: string | null;
  /** Items per page, from 1 to MAX_PAGE_SIZE; absent means DEFAULT_PAGE_SIZE. */
  readonly pageSize?: number;
}
