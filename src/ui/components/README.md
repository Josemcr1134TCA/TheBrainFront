# Piezas del design system

Piezas de Angular 22 que replican el documento de referencia v6 (`src/ui/docs/the-brain-design-system.html`). Son presentación pura: muestran y emiten eventos; no ordenan, no filtran ni consultan datos (DEC-0012).

## Cómo se importan

`src/app/` importa solo desde `src/ui/index.ts` (regla `ui-public-api`). Desde `src/app/<modulo>/pages/`:

```ts
import { TbButton, TbEmptyState, TbBanner } from '../../../ui';
```

Todas son standalone: se agregan al arreglo `imports` del componente. Los textos para personas los pasa quien llama, en español de México; las únicas palabras fijas son las de la v6 (niveles de Banner, estados oficiales, «Limpiar filtros» y «Reintentar»).

## Button

`<button tb-button>` o `<a tb-button>`. El host es el elemento nativo.

| Entrada | Valores | Por defecto |
|---|---|---|
| `variant` | `primary`, `secondary`, `ghost`, `danger`, `danger-solid` | `secondary` |
| `size` | `sm` (28 px), `md` (32 px), `lg` (40 px) | `md` |
| `block` | ancho completo | `false` |
| `busy` | `aria-busy`, indicador giratorio y bloqueo del clic, también con teclado | `false` |
| `disabledReason` | va al `title` solo mientras el botón está deshabilitado | — |

Salida: el `click` nativo. Un botón sin `type` recibe `type="button"`.

```html
<button tb-button variant="primary" [busy]="saving()" (click)="save()">Guardar</button>
<button tb-button [disabled]="!canEdit()" disabledReason="Sin permiso para editar">Editar</button>
```

## StatusBadge

`<tb-status>` y `<tb-badge>`.

| Pieza | Entradas | Notas |
|---|---|---|
| `tb-status` | `value`: `DRAFT`, `IN_CAPTURE`, `PENDING`, `ACTIVE`, `APPLIED`, `WITH_ERROR`, `EXPIRED` | Lista cerrada de «Estados oficiales». Punto de color y palabra: el color nunca va solo |
| `tb-badge` | `count`, `tone` (`accent`, `mute`, `bad`), `showZero` | El conteo desaparece en cero. La cifra sale de `formatQuantity` |

```html
<tb-status value="ACTIVE" />
<tb-badge [count]="12" tone="mute" aria-label="12 pendientes" />
```

## Banner

`<tb-banner>`. El texto se proyecta (una o dos líneas).

| Entrada | Valores |
|---|---|
| `level` | `info` (Información), `warn` (Aviso), `bad` (Error), `ok` (Listo). Cada nivel empieza con su palabra en negrita |
| `actionLabel` | una acción como máximo, botón `sm` a la derecha |
| `dismissible` | solo cuenta en `info` y `ok`; en `warn` y `bad` se ignora |

Salidas: `action()` y `dismiss()`. Rol: `alert` en `bad`, `status` en los demás.

```html
<tb-banner level="warn" actionLabel="Revisar" (action)="review()">La lista vence en 3 días.</tb-banner>
```

## Skeleton

`<tb-skeleton>`. Decorativo (`aria-hidden`); `aria-busy`, `aria-label` y el anuncio final son del contenedor.

| Entrada | Valores |
|---|---|
| `shape` | `rows`, `line`, `title`, `block`, `chip` |
| `rows` | solo con `rows`; se acota de 4 a 6 y vale 5 por defecto |

Con «reducir movimiento» el brillo se detiene. Los tiempos (no aparece antes de 300 ms, error a los 10 s, sin mezclar filas viejas con el esqueleto) los maneja `createLoadingPhase` en `skeleton/loading-phase.ts`. Es interna y no se exporta: la usa DataTable.

```html
<div aria-busy="true" aria-label="Cargando productos"><tb-skeleton shape="rows" /></div>
```

## EmptyState

`<tb-empty-state>`.

| Entrada | Valores |
|---|---|
| `variant` | `empty`, `no-results`, `forbidden`, `offline`, `error` |
| `heading`, `message` | título y una frase |
| `actionLabel` | texto de la acción. Por defecto: `no-results` → «Limpiar filtros»; `offline` y `error` → «Reintentar»; los demás, ninguna |
| `focusActionOnShow` | el botón toma el foco al aparecer; solo si la persona acaba de disparar la carga |

Salida: `action()`. Como máximo una acción. Rol: `alert` en `error` y `offline`; `status` en `empty`, `no-results` y `forbidden`.

```html
<tb-empty-state variant="error" heading="No se pudo cargar" message="El servicio no respondió." (action)="reload()" />
```

## FilterSelect

`<tb-filter-select>`. Filtro de selección múltiple. Vacío significa «Todos».

| Entrada | Valores |
|---|---|
| `label` | etiqueta del filtro, por ejemplo «Proveedor» |
| `options` | `{ value, label, count? }`. `count` nulo muestra «—»; sin `count` no muestra nada |
| `selected` | valores marcados; funciona con `[(selected)]` o solo con la salida |
| `total` | total de resultados del pie, en color de acento |
| `resultLabel` | `{ one, other }`, por ejemplo `{ one: 'resultado', other: 'resultados' }` |

Salida: `selectedChange`. El botón dice «Todos» sin valores, la etiqueta completa con uno y «N elegidos» con dos o más; con valor aparece la X que deja el filtro vacío sin abrir el panel. El panel tiene un buscador interno que solo filtra las opciones del panel (sin distinguir mayúsculas ni acentos), casillas con su conteo y un pie: «Todos» marca las opciones visibles y «Limpiar» desmarca todas; los dos solo emiten el cambio. No cuenta ni consulta: los conteos y el total los da quien llama.

Teclado: al abrir, el foco va al buscador; `Esc` cierra y devuelve el foco al botón; un clic o el foco fuera lo cierra, así que solo hay un panel abierto. ARIA: `aria-haspopup="true"`, `aria-expanded` y el panel con `role="group"`.

```html
<tb-filter-select
  label="Proveedor"
  [options]="supplierOptions()"
  [selected]="filters().suppliers"
  (selectedChange)="onSuppliers($event)"
  [total]="total()"
  [resultLabel]="{ one: 'resultado', other: 'resultados' }"
/>
```

## Tabs

`<tb-tabs>`. El contenido proyectado es el panel de la pestaña activa.

| Entrada | Valores |
|---|---|
| `tabs` | `{ id, label, count?, badge?: { count, tone } }`. `count` va en mono y con formato |
| `selected` | `id` de la pestaña activa; funciona con `[(selected)]` o solo con la salida |
| `label` | nombre accesible de la lista de pestañas |

Salida: `selectedChange`. Con una selección inválida toma la primera y lo emite una vez. Teclado: solo la activa entra en el orden de Tab; `←` y `→` mueven el foco y dan la vuelta; `Enter` o `Espacio` activan; Tab pasa al panel. El foco se queda en la pestaña. No toca la dirección: quien llama la sincroniza.

```html
<tb-tabs [tabs]="tabs" [(selected)]="tab" label="Secciones del producto">
  @if (tab === 'prices') { <p>…</p> }
</tb-tabs>
```

## DataTable

`<tb-data-table>`. Presenta y emite: **no ordena, no filtra, no pagina ni consulta**; quien la llama decide (DEC-0012). Incluye cabecera con título, barra de filtros con el buscador, encabezado ordenable, filas, pie y estados.

| Entrada | Valores |
|---|---|
| `title` | título de la tarjeta y nombre accesible de la tabla |
| `columns` | `{ id, header, type, value: (row) => …, cents?, sortable?, track? }`. `type`: `text`, `money`, `quantity`, `percent`, `date`, `status`. Dinero, cantidad y porcentaje van a la derecha. `track` es la pista de la rejilla (por defecto `minmax(0,1fr)`) |
| `rows`, `rowKey` | filas y su clave única |
| `state` | `loading`, `ready`, `error`, `offline`, `forbidden` |
| `sort` | `{ columnId, direction }` o `null` |
| `searchTerm`, `searchLabel`, `searchPlaceholder` | buscador de la barra; `searchLabel` es su nombre accesible |
| `filtersActive` | muestra «Limpiar filtros» en la barra |
| `itemLabel` | `{ one, other }` para el pie y el anuncio: «1 producto», «41 productos» |
| `count`, `note` | total del pie (por defecto, `rows.length`) y nota a la derecha |
| `loadingLabel` | nombre accesible mientras carga |
| `texts` | un objeto por variante: `{ heading, message, actionLabel? }` para `empty`, `no-results`, `forbidden`, `offline` y `error` |
| `rowsActivatable` | las filas se activan con clic, `Enter` o `Espacio` |

Salidas: `sortChange`, `searchChange` (en cada tecla, sin *debounce*), `clearFilters`, `retry`, `loadTimeout`, `rowActivate` y `emptyAction`. Los `FilterSelect` se proyectan dentro de la tabla y las acciones de la cabecera llevan el atributo `tbActions`.

Reglas de presentación:
- Un valor nulo, indefinido o vacío se muestra como «—». El texto largo se corta con elipsis y queda completo en el DOM.
- Carga: `aria-busy` desde el primer instante; antes de 300 ms conserva lo que había; después aparece el esqueleto en lugar de todo (nunca mezclado con filas viejas); a los 10 s pasa a error con «Reintentar» y emite `loadTimeout` una vez. Si los datos llegan después, se muestran.
- Sin filas: `no-results` si hay filtros o búsqueda; si no, `empty`. `error` y `offline` usan `role="alert"`; `empty`, `no-results` y `forbidden`, `role="status"`.
- La acción de un estado emite `retry` (`error` y `offline`), `clearFilters` (`no-results`) o `emptyAction` con la variante (`empty` y `forbidden`).
- `aria-sort` solo va en el encabezado activo. Una región invisible con `role="status"` anuncia el conteo cuando hay filas.

### Celda propia (`tbCell`)

`<ng-template tbCell="idDeColumna">` reemplaza las celdas de esa columna. Su contexto:

| Variable | Contenido |
|---|---|
| `$implicit` (`let-row`) | la fila |
| `value` (`let-value="value"`) | el valor crudo, `column.value(row)` |

Ejemplo para una lista de texto con nueve columnas (código, nombre, marca, proveedor, presentación y cuatro de clasificación), con estados de carga, vacío, error, sin permisos y cursor inválido. La paginación va fuera de la tabla, en el pie de la página:

```ts
protected readonly columns: TbColumn<Product>[] = [
  { id: 'code', header: 'Código', type: 'text', value: (r) => r.code, track: '120px' },
  { id: 'name', header: 'Nombre', type: 'text', value: (r) => r.name },
  { id: 'brand', header: 'Marca', type: 'text', value: (r) => r.brand },
  { id: 'supplier', header: 'Proveedor', type: 'text', value: (r) => r.supplier },
  { id: 'presentation', header: 'Presentación', type: 'text', value: (r) => r.presentation },
  { id: 'class1', header: 'Clasificación 1', type: 'text', value: (r) => r.classification[0] },
  // … las otras tres clasificaciones, igual
];
protected readonly texts: TbTableTexts = {
  empty: { heading: 'Aún no hay productos', message: 'Cuando haya productos aparecerán aquí.' },
  'no-results': { heading: 'Sin resultados', message: 'Ningún producto coincide con la búsqueda.' },
  forbidden: { heading: 'Sin permisos', message: 'Tu perfil no puede ver el catálogo.' },
  offline: { heading: 'Sin conexión', message: 'Revisa tu red e inténtalo de nuevo.' },
  // Cursor inválido: un error con otra acción; (retry) lleva a la primera página.
  error: { heading: 'No se pudo cargar', message: 'El cursor ya no es válido.', actionLabel: 'Ir a la primera página' },
};
```

```html
<tb-data-table
  title="Productos"
  [columns]="columns"
  [rows]="rows()"
  [rowKey]="rowKey"
  [state]="state()"
  [searchTerm]="term()"
  searchLabel="Buscar productos"
  [itemLabel]="{ one: 'producto', other: 'productos' }"
  loadingLabel="Cargando productos"
  [texts]="texts"
  (searchChange)="onSearch($event)"
  (retry)="goToFirstPage()"
>
  <ng-template tbCell="name" let-row><strong>{{ row.name }}</strong></ng-template>
</tb-data-table>
<!-- El pie de paginación de la página va aquí, fuera de la tabla. -->
```

## Fuera de esta versión

- DataTable: menú de columnas, CSV, ampliar columnas, columnas fijas, densidad, selección y paginación (PQ-2).
- Chip, Tooltip, botón de solo icono y atajo de teclado (PQ-3 y PQ-4).
- `Icon` es interno (`components/icon/`): no se exporta ni se usa desde `src/app/`.
