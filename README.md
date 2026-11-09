# TheBrainFront

Interfaz de usuario de The Brain para GUNA: cliente de la API y vistas de usuario.

Repo del frontend desde el 2026-11-09 (DEC-0011 del arnés). Empieza con historial nuevo; el design system v6 de `src/ui/` viene del commit `95890d5` de la rama `ds/v6` del repo anterior, que quedó archivado.

- **Stack:** Angular 22 y Tailwind CSS 4.3.3, sin librería de componentes.
- **Design system:** `src/ui/`. Las decisiones están en `src/ui/DECISIONS.md` y el documento de referencia en `src/ui/docs/the-brain-design-system.html`.
- **Instrucciones para agentes:** `AGENTS.md`.

## Empezar
Requiere Node `^22.22.3`, `^24.15.0` o `>=26` (`.nvmrc`).

```bash
npm install
npm start                 # http://localhost:4200
npm run ds:check          # tokens, documento, tema y validador estático
npm run arch:check        # reglas de arquitectura del arnés (dependency-cruiser)
npm run build
npm test -- --watch=false
```

## Estructura del design system
```
src/ui/
  DECISIONS.md                 registro de decisiones (fuente de verdad)
  tokens/
    tokens.json                valores visuales (se edita aquí)
    theme.css                  tema de Tailwind (generado)
    tokens.plain.css           variables CSS (generado)
    tokens.flat.json           mapa plano (generado)
  docs/
    reference.src.html         fuente del documento de referencia (se edita aquí)
    components.css, chrome.css, theme-toggle.*
    the-brain-design-system.html   documento de referencia (generado)
scripts/
  build-tokens.mjs  build-doc.mjs  test-theme.mjs  validate-ui.mjs
```

Sin datos reales de GUNA: todos los ejemplos son sintéticos.
