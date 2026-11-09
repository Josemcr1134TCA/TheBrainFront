#!/usr/bin/env node
// Genera el CSS de los tokens de The Brain a partir de src/ui/tokens/tokens.json (D-012, D-020).
//
//   salidas (no se editan a mano):
//     src/ui/tokens/tokens.plain.css   variables CSS en claro y oscuro (lo usa build-doc.mjs para el documento de referencia)
//     src/ui/tokens/theme.css          tema de Tailwind 4: vacía la paleta y escalas por defecto y declara solo las de tokens.json
//     src/ui/tokens/tokens.flat.json   mapa plano variable → { light, dark } para validadores y herramientas
//
// Uso:
//   node scripts/build-tokens.mjs           genera
//   node scripts/build-tokens.mjs --check   falla si algún archivo en disco no coincide
//
// Falla si un color o sombra no declara "dark" o "darkSame": true (D-006, D-017), o si declara los dos.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, "src/ui/tokens");
const check = process.argv.includes("--check");
const t = JSON.parse(readFileSync(resolve(dir, "tokens.json"), "utf8"));

const errores = [];
// Grupos en el orden en que se escriben. Clave de tokens.json → prefijo de la variable CSS (espacio de nombres de Tailwind 4).
const GRUPOS = [
  ["color", "--color-"], ["spacing", "--spacing-"], ["radius", "--radius-"], ["size", "--size-"], ["shadow", "--shadow-"],
  ["font", "--font-"], ["text", "--text-"], ["motion", "--motion-"], ["ease", "--ease-"], ["container", "--container-"],
];
const TEMATICOS = new Set(["color", "shadow"]); // llevan valor claro y oscuro
const PROPS_TEXTO = ["size", "line-height", "font-weight", "letter-spacing"];

// ---------- lectura y validación ----------
const claro = [];   // [grupo, [[variable, valor], ...]]
const oscuro = [];  // [[variable, valor], ...] en el orden de tokens.json
const flat = {};
for (const [g, pre] of GRUPOS) {
  const grupo = t[g];
  if (!grupo) { errores.push(`Falta el grupo «${g}» en tokens.json.`); continue; }
  const vars = [];
  for (const [nombre, v] of Object.entries(grupo)) {
    const variable = pre + nombre;
    if (TEMATICOS.has(g)) {
      if (typeof v !== "object" || typeof v.value !== "string") { errores.push(`${variable}: debe ser { value, dark | darkSame }.`); continue; }
      const tieneDark = typeof v.dark === "string", igual = v.darkSame === true;
      if (tieneDark === igual) errores.push(`${variable}: declara "dark" o "darkSame": true (exactamente uno).`);
      vars.push([variable, v.value]);
      if (tieneDark) oscuro.push([variable, v.dark]);
      flat[variable] = { light: v.value, dark: tieneDark ? v.dark : v.value };
    } else if (g === "text") {
      for (const p of PROPS_TEXTO) if (typeof v?.[p] !== "string") errores.push(`${variable}: falta «${p}».`);
      vars.push([variable, v.size]);
      for (const p of PROPS_TEXTO.slice(1)) vars.push([`${variable}--${p}`, v[p]]);
      for (const [k, val] of vars.slice(-4)) flat[k] = { light: val, dark: val };
    } else {
      if (typeof v !== "string") { errores.push(`${variable}: debe ser texto.`); continue; }
      vars.push([variable, v]);
      flat[variable] = { light: v, dark: v };
    }
  }
  claro.push([g, vars]);
}
const reducido = Object.entries(t.reducedMotion || {}).map(([k, v]) => [`--${k}`, v]);
for (const [k] of reducido) if (!(k in flat)) errores.push(`reducedMotion: ${k} no existe en los tokens.`);
const alias = Object.entries(t.docAliases || {}).map(([corto, largo]) => [`--${corto}`, `var(--${largo})`]);
for (const [k, v] of alias) if (!(v.slice(4, -1) in flat)) errores.push(`docAliases: ${k} apunta a una variable que no existe (${v}).`);

// Contraste (D-006, D-038): cada par texto/fondo de tokens.json cumple el mínimo en claro y en oscuro (WCAG 2.x).
const luminancia = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const minimo = t.contrast?.min ?? 4.5;
let paresRevisados = 0;
for (const [texto, fondo] of t.contrast?.pairs ?? []) {
  const a = flat[`--color-${texto}`], b = flat[`--color-${fondo}`];
  if (!a || !b) { errores.push(`contrast: el par ${texto} / ${fondo} usa un color que no existe.`); continue; }
  for (const tema of ["light", "dark"]) {
    if (!/^#[0-9a-fA-F]{6}$/.test(a[tema]) || !/^#[0-9a-fA-F]{6}$/.test(b[tema])) { errores.push(`contrast: ${texto} / ${fondo} (${tema}) no es un color #rrggbb.`); continue; }
    const r = contraste(a[tema], b[tema]);
    if (r < minimo) errores.push(`contraste ${texto} sobre ${fondo} en ${tema === "light" ? "claro" : "oscuro"}: ${r.toFixed(2)}:1, mínimo ${minimo}:1 (D-038).`);
  }
  paresRevisados++;
}

if (errores.length) { console.error(errores.join("\n")); process.exit(1); }

// ---------- escritura ----------
const decl = (pares, sangria) => pares.map(([k, v]) => `${sangria}${k}: ${v};`).join("\n");
const bloquesClaros = (sangria) => claro.map(([g, vars]) => `${sangria}/* ${g} */\n${decl(vars, sangria)}`).join("\n\n");
const oscuroCss = [
  `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n    color-scheme: dark;\n${decl(oscuro, "    ")}\n  }\n}`,
  `:root[data-theme="dark"] {\n  color-scheme: dark;\n${decl(oscuro, "  ")}\n}`,
  `:root[data-theme="light"] {\n  color-scheme: light;\n}`,
  `@media (prefers-reduced-motion: reduce) {\n  :root {\n${decl(reducido, "    ")}\n  }\n}`,
].join("\n\n");

const plain = `/* The Brain · tokens. GENERADO por scripts/build-tokens.mjs desde src/ui/tokens/tokens.json; no editar a mano. */\n` +
  `:root {\n${bloquesClaros("  ")}\n\n  /* alias de nombres cortos de la v6 (--ink-muted, --space-4…): los leen components.css y el documento de referencia */\n${decl(alias, "  ")}\n}\n\n${oscuroCss}\n`;

// Tailwind 4: se vacían los espacios de nombres por defecto (D-017, D-018) y solo existen los de tokens.json.
// «static» hace que todas las variables se emitan aunque ninguna utilidad las use (los componentes las leen con var()).
const VACIAR = ["--color-*", "--spacing", "--spacing-*", "--radius-*", "--shadow-*", "--inset-shadow-*", "--drop-shadow-*",
  "--font-*", "--text-*", "--ease-*", "--container-*"];
const theme = `/* The Brain · tema de Tailwind 4. GENERADO por scripts/build-tokens.mjs desde src/ui/tokens/tokens.json; no editar a mano. */\n` +
  `/* Se importa después de tailwindcss en src/styles.css. Los valores oscuros redefinen las mismas variables por tema (D-006, D-026). */\n` +
  `@theme static {\n  /* sin paleta ni escalas por defecto de Tailwind */\n${VACIAR.map((v) => `  ${v}: initial;`).join("\n")}\n\n${bloquesClaros("  ")}\n}\n\n${oscuroCss}\n`;

const salidas = {
  "tokens.plain.css": plain,
  "theme.css": theme,
  "tokens.flat.json": JSON.stringify(flat, null, 2) + "\n",
};
let desactualizado = false;
for (const [nombre, contenido] of Object.entries(salidas)) {
  const p = resolve(dir, nombre);
  if (check) {
    if (!existsSync(p) || readFileSync(p, "utf8") !== contenido) { console.error(`DESACTUALIZADO: src/ui/tokens/${nombre}`); desactualizado = true; }
  } else writeFileSync(p, contenido);
}
if (desactualizado) { console.error("Ejecuta: node scripts/build-tokens.mjs"); process.exit(1); }
console.log(`contraste: ${paresRevisados} pares ≥ ${minimo}:1 en claro y oscuro`);
console.log(check ? "tokens al día" : `tokens: ${Object.keys(flat).length} variables · oscuras explícitas: ${oscuro.length} · ${Object.keys(salidas).join(", ")}`);
