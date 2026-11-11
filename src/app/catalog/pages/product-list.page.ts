import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ApiErrorCode, isApiError } from '../../core/data/api-error';
import { Page } from '../../core/data/page';
import {
  TbCellDef,
  TbColumn,
  TbCursorPager,
  TbDataTable,
  TbItemLabel,
  TbTableState,
  TbTableText,
  TbTableTexts,
} from '../../../ui';
import { ProductPort } from '../data/product.port';
import { Product } from '../model/product';

interface Request {
  /** Zero-based index of the page being asked for. */
  readonly index: number;
  readonly cursor: string | null;
}

interface Failure {
  readonly code: ApiErrorCode;
  /** Service message, only when it is not tied to a request parameter (field is null). */
  readonly message: string | null;
  readonly correlationId: string | null;
}

const RETRY_PHRASE = 'Reintenta; si sigue igual, avisa al equipo técnico.';
const RETRY = 'Reintentar';
const GO_FIRST = 'Ir a la primera página';

// Fixed title and phrase per error code (approved UI, propuesta §3).
const BY_CODE: Record<ApiErrorCode, { heading: string; phrase: string }> = {
  UNAVAILABLE: { heading: 'No pudimos cargar el catálogo', phrase: RETRY_PHRASE },
  VALIDATION: { heading: 'No pudimos pedir esa página', phrase: RETRY_PHRASE },
  NOT_FOUND: { heading: 'No encontramos el catálogo', phrase: 'Vuelve a abrirlo desde el menú.' },
  INVALID_CURSOR: { heading: 'Esa página ya no está disponible', phrase: 'Vuelve a la primera página.' },
  FORBIDDEN: { heading: 'Tu perfil no puede ver el catálogo', phrase: 'Pide acceso a quien administra tu perfil.' },
};

@Component({
  selector: 'app-product-list-page',
  imports: [TbDataTable, TbCellDef, TbCursorPager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-list.page.html',
})
export class ProductListPage implements OnDestroy {
  private readonly port = inject(ProductPort);
  private running: Subscription | null = null;

  protected readonly itemLabel: TbItemLabel = { one: 'producto', other: 'productos' };

  protected readonly columns: readonly TbColumn<Product>[] = [
    { id: 'code', header: 'Código', type: 'text', value: (p) => p.code },
    { id: 'name', header: 'Nombre', type: 'text', value: (p) => p.name },
    { id: 'ean', header: 'EAN', type: 'text', value: (p) => p.ean },
    { id: 'brand', header: 'Marca', type: 'text', value: (p) => p.brand },
    { id: 'supplier', header: 'Proveedor', type: 'text', value: (p) => p.supplier?.name },
    { id: 'presentation', header: 'Presentación', type: 'text', value: (p) => p.presentation },
    { id: 'department', header: 'Departamento', type: 'text', value: (p) => p.classification.department },
    { id: 'subDepartment', header: 'Sub departamento', type: 'text', value: (p) => p.classification.subDepartment },
    { id: 'category', header: 'Categoría', type: 'text', value: (p) => p.classification.category },
    { id: 'subCategory', header: 'Sub categoría', type: 'text', value: (p) => p.classification.subCategory },
  ];

  protected readonly rowKey = (product: Product): string => product.code;

  protected readonly items = signal<readonly Product[]>([]);
  protected readonly state = signal<TbTableState>('loading');
  protected readonly pageNumber = signal(1);
  protected readonly hasNext = signal(false);
  private readonly failure = signal<Failure | null>(null);

  // Cursor stack: cursors[n] is the cursor that opened page n + 1 (the first page has none).
  private cursors: (string | null)[] = [null];
  private index = 0;
  private nextCursor: string | null = null;
  private pending: Request = { index: 0, cursor: null };

  protected readonly texts = computed<TbTableTexts>(() => {
    const failure = this.failure();
    const code = failure?.code ?? 'UNAVAILABLE';
    const base = BY_CODE[code];
    const message = [failure?.message, base.phrase, failure?.correlationId ? `Referencia: ${failure.correlationId}` : null]
      .filter((part): part is string => !!part)
      .join(' ');
    const error: TbTableText = {
      heading: base.heading,
      message,
      ...this.actionsOf(code),
    };
    return {
      empty: {
        heading: 'Aún no hay productos en el catálogo',
        message: 'Cuando haya productos registrados, aparecerán aquí.',
      },
      'no-results': { heading: '', message: '' },
      forbidden: { heading: BY_CODE.FORBIDDEN.heading, message },
      offline: { heading: '', message: '' },
      error,
    };
  });

  constructor() {
    this.request({ index: 0, cursor: null });
  }

  ngOnDestroy(): void {
    this.running?.unsubscribe();
  }

  protected next(): void {
    this.request({ index: this.index + 1, cursor: this.nextCursor });
  }

  protected previous(): void {
    this.request({ index: this.index - 1, cursor: this.cursors[this.index - 1] });
  }

  protected first(): void {
    this.request({ index: 0, cursor: null });
  }

  /** Primary action of the error state: «Reintentar», or «Ir a la primera página» when the cursor is no longer valid. */
  protected onRetry(): void {
    if (this.failure()?.code === 'INVALID_CURSOR') this.first();
    else this.request(this.pending);
  }

  private actionsOf(code: ApiErrorCode): Partial<TbTableText> {
    switch (code) {
      case 'UNAVAILABLE':
        return { actionLabel: RETRY, actionVariant: 'primary' };
      case 'VALIDATION':
        return { actionLabel: RETRY, actionVariant: 'primary', secondaryActionLabel: GO_FIRST };
      case 'INVALID_CURSOR':
        return { actionLabel: GO_FIRST, actionVariant: 'primary' };
      default:
        return {};
    }
  }

  private request(request: Request): void {
    this.running?.unsubscribe();
    this.pending = request;
    this.state.set('loading');
    this.running = this.port.list({ cursor: request.cursor }).subscribe({
      next: (page) => this.show(request, page),
      error: (error: unknown) => this.fail(error),
    });
  }

  private show(request: Request, page: Page<Product>): void {
    this.cursors = [...this.cursors.slice(0, request.index), request.cursor];
    this.index = request.index;
    this.nextCursor = page.nextCursor;
    this.failure.set(null);
    this.items.set(page.items);
    this.pageNumber.set(request.index + 1);
    this.hasNext.set(page.nextCursor !== null);
    this.state.set('ready');
  }

  private fail(error: unknown): void {
    const known = isApiError(error) ? error : null;
    const code = known?.code ?? 'UNAVAILABLE';
    this.items.set([]);
    this.failure.set({
      code,
      message: known && known.field === null ? known.message : null,
      correlationId: known?.correlationId ?? null,
    });
    this.state.set(code === 'FORBIDDEN' ? 'forbidden' : 'error');
  }
}
