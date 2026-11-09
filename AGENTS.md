# The Brain · frontend · instrucciones para agentes

Interfaz de The Brain para GUNA: Angular 22 y Tailwind CSS 4, sin librería de componentes (D-002, D-003). El design system vive en `src/ui/` (D-004).

## Antes de escribir una línea
1. Lee completo `src/ui/DECISIONS.md`. Una decisión **confirmada** no se vuelve a preguntar ni se contradice. Si tu trabajo depende de una **por confirmar**, detente y pregunta.
2. Consulta `src/ui/docs/the-brain-design-system.html` (versión 6, D-039). Ahí están los principios, «Contenido y tono», color, tipografía, espacio, patrones de pantalla y la anatomía de cada componente. Para leer solo el CSS de componentes usa `src/ui/docs/components.css`. Piezas disponibles: AppFrame, AccountMenu, PageLayout, Banner, Confirm, EmptyState, Skeleton, Field, SelectCombo, CheckboxSwitch, DateField, FileDrop, StatusBadge, Tabs, ActionList, además de Buttons, DataTable, FilterSelect, SideSheet, StepBar, StepCard, StatusBar, History, DocLink, DealCard, Threshold y las demás del documento (D-047, D-048).
3. Si trabajas desde el arnés de The Brain, además rigen su `CLAUDE.md`, el contrato de tarea y `.claude/scope.txt`. Construyes **exactamente** la UI aprobada por el PO (`docs/ui/<ID>/` del arnés).

## Reglas
- **Si falta un componente, una variante o un token, detente y pregunta (D-009).** La v6 no trae `Banner`, `EmptyState`, `Confirm`, `Tabs`, `Badge`, `Switch`, `Field` y otras piezas (D-045): no las dibujes. Describe qué falta y espera la decisión. No lo inventes.
- **Solo existen los tokens de `src/ui/tokens/tokens.json`** (D-017, D-018). No uses la paleta ni las escalas por defecto de Tailwind (`bg-white` y `p-7` no compilan), valores arbitrarios (`bg-[#…]`, `p-[13px]`), modificadores de opacidad (`bg-accent/50`) ni clases integradas sin token (`font-bold`, `duration-150`, `p-px`). El tema no puede bloquear estas últimas (D-019); las atrapa `scripts/validate-ui.mjs` (D-037).
- **Duraciones y variables:** Tailwind 4 no tiene clases de duración con token. Escribe `duration-(--motion-duration-fast)` o `duration-(--motion-duration-base)`. La sintaxis `-(--variable)` solo se admite con variables que existan en `tokens.json`.
- **No edites archivos generados** (D-020): `src/ui/tokens/theme.css`, `tokens.plain.css`, `tokens.flat.json` y `src/ui/docs/the-brain-design-system.html`. Un valor visual se cambia en `tokens.json`, y el documento de referencia en `src/ui/docs/reference.src.html`. Luego se regenera con `npm run ds:tokens` y `npm run ds:doc`.
- **Tema claro y oscuro** (D-006): todo color y toda sombra declara `dark` o `darkSame: true`. Todo par texto/fondo de `tokens.json` (`contrast`) cumple 4.5:1 en los dos temas y `build-tokens.mjs` lo comprueba (D-038). Si combinas un texto y un fondo que no están en la lista, agrégalo y comprueba que pase. Verifica tu pantalla en los dos temas.
- **Tipografía** (D-041): solo `text-display`, `text-title`, `text-heading`, `text-body`, `text-cell`, `text-label`, `text-micro`, `text-kpi` y `text-num`. Geist y Geist Mono (`font-sans`, `font-mono`).
- **UX** (D-046): el prototipo GUNA v5 es contrato de UX obligatorio; vive en el arnés, `docs/ui/ux/guna-v5/`.
- **Textos** (D-007, «Contenido y tono»):
  - Español de México, de tú, frases cortas, directo en las plantillas.
  - Sin subtítulos explicativos ni notas de ayuda.
  - Sin nombres de personas en acciones ni etiquetas.
  - Sin emoji. Mayúscula solo al inicio.
  - Cifras «$1,850,000» y «24.5 %» (con espacio); fechas cortas «9 oct» (con año si no es el vigente: «30-sep-2026»).
- **Reglas de negocio** fuera del design system (D-008, D-035). Si la regla la cambiaría el equipo comercial o Finanzas, no la escribes tú: pregúntala. Su significado vive en una ficha `R-` y su valor en la configuración de la base; en el código se cita `R-NNNN`, nunca la cifra.
- **Datos**: solo sintéticos. Nunca nombres reales de fabricantes, marcas, clientes ni personas.
- **Decisiones nuevas**: se registran en `src/ui/DECISIONS.md` con el siguiente identificador libre (D-010). Las aprueba una persona en el PR.

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run ds:check` | Comprueba que los tokens y el documento estén al día, que solo compilen las clases de los tokens y que la app pase el validador. Debe pasar antes de cada PR |
| `npm run ds:validate` | Solo el validador estático (D-037), con sus pruebas |
| `npm run ds:tokens` | Regenera el CSS de tokens desde `tokens.json` |
| `npm run ds:doc` | Regenera el documento de referencia |
| `npm run build` · `npm test -- --watch=false` | Compila y corre las pruebas |

Node `^22.22.3`, `^24.15.0` o `>=26` (ver `.nvmrc`).
