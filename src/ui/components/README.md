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

## Fuera de esta versión

- Chip, Tooltip, botón de solo icono y atajo de teclado (PQ-3 y PQ-4).
- `Icon` es interno (`components/icon/`): no se exporta ni se usa desde `src/app/`.
