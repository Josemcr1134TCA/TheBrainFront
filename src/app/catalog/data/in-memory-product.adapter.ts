import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { ApiError, isApiError } from '../../core/data/api-error';
import { IN_MEMORY_FAILURE } from '../../core/data/in-memory-failure';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page, PageRequest } from '../../core/data/page';
import { Product } from '../model/product';
import { toProduct } from './product.mapper';
import { ProductPort } from './product.port';
import { PRODUCT_SEED } from './products.fixture';

const CURSOR_VERSION = 1;

// The cursor is internal to this adapter: base64url of {v, code}, the last internal code delivered.
function encodeCursor(code: string): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: CURSOR_VERSION, code }));
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Returns the last delivered code, or null when the cursor is not one this adapter issued.
function decodeCursor(cursor: string): string | null {
  try {
    const base64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const { v, code } = value as { v?: unknown; code?: unknown };
    return v === CURSOR_VERSION && typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}

const unavailable = () =>
  new ApiError({ code: 'UNAVAILABLE', message: 'El catálogo no está disponible en este momento.', field: null });

/** Simulates TheBrainApi behind ProductPort: sorts by internal code, validates the request and pages by cursor. */
@Injectable()
export class InMemoryProductAdapter extends ProductPort {
  private readonly seed = inject(PRODUCT_SEED);
  private readonly failure = inject(IN_MEMORY_FAILURE, { optional: true });

  list(request: PageRequest = {}): Observable<Page<Product>> {
    if (this.failure) return throwError(() => this.failure);
    try {
      return of(this.page(request));
    } catch (error) {
      return throwError(() => (isApiError(error) ? error : unavailable()));
    }
  }

  private page(request: PageRequest): Page<Product> {
    const pageSize = request.pageSize ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new ApiError({
        code: 'VALIDATION',
        message: `El tamaño de página debe ser un entero entre 1 y ${MAX_PAGE_SIZE}.`,
        field: 'pageSize',
      });
    }

    let after: string | null = null;
    if (request.cursor !== undefined && request.cursor !== null) {
      after = decodeCursor(request.cursor);
      if (after === null) {
        throw new ApiError({ code: 'INVALID_CURSOR', message: 'El cursor de paginación no es válido.', field: 'cursor' });
      }
    }

    // Ordinal comparison on the unique internal code (not the locale one).
    const sorted = [...this.seed].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    const remaining = after === null ? sorted : sorted.filter((p) => p.code > (after as string));
    const items = remaining.slice(0, pageSize).map(toProduct);
    const hasMore = remaining.length > pageSize;
    return {
      items: Object.freeze(items),
      nextCursor: hasMore ? encodeCursor(items[items.length - 1].code) : null,
    };
  }
}
