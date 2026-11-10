#!/usr/bin/env node
// Generates the CSS of The Brain tokens from src/ui/tokens/tokens.json (D-012, D-020).
//
//   outputs (never edited by hand):
//     src/ui/tokens/tokens.plain.css   CSS variables in light and dark (build-doc.mjs uses it for the reference document)
//     src/ui/tokens/theme.css          Tailwind 4 theme: resets the default palette and scales and declares only those of tokens.json
//     src/ui/tokens/tokens.flat.json   flat map variable → { light, dark } for validators and tools
//
// Usage:
//   node scripts/build-tokens.mjs           generates
//   node scripts/build-tokens.mjs --check   fails if any file on disk does not match
//
// Fails if a color or shadow declares neither "dark" nor "darkSame": true (D-006, D-017), or declares both.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, "src/ui/tokens");
const check = process.argv.includes("--check");
const t = JSON.parse(readFileSync(resolve(dir, "tokens.json"), "utf8"));

const errors = [];
// Groups in the order they are written. Key of tokens.json → prefix of the CSS variable (Tailwind 4 namespace).
const GROUPS = [
  ["color", "--color-"], ["spacing", "--spacing-"], ["radius", "--radius-"], ["size", "--size-"], ["shadow", "--shadow-"],
  ["font", "--font-"], ["text", "--text-"], ["motion", "--motion-"], ["ease", "--ease-"], ["container", "--container-"],
];
const THEMED = new Set(["color", "shadow"]); // carry a light and a dark value
const TEXT_PROPS = ["size", "line-height", "font-weight", "letter-spacing"];

// ---------- reading and validation ----------
const light = [];  // [group, [[variable, value], ...]]
const dark = [];   // [[variable, value], ...] in the order of tokens.json
const flat = {};
for (const [g, pre] of GROUPS) {
  const group = t[g];
  if (!group) { errors.push(`Falta el grupo «${g}» en tokens.json.`); continue; }
  const vars = [];
  for (const [name, v] of Object.entries(group)) {
    const variable = pre + name;
    if (THEMED.has(g)) {
      if (typeof v !== "object" || typeof v.value !== "string") { errors.push(`${variable}: debe ser { value, dark | darkSame }.`); continue; }
      const hasDark = typeof v.dark === "string", same = v.darkSame === true;
      if (hasDark === same) errors.push(`${variable}: declara "dark" o "darkSame": true (exactamente uno).`);
      vars.push([variable, v.value]);
      if (hasDark) dark.push([variable, v.dark]);
      flat[variable] = { light: v.value, dark: hasDark ? v.dark : v.value };
    } else if (g === "text") {
      for (const p of TEXT_PROPS) if (typeof v?.[p] !== "string") errors.push(`${variable}: falta «${p}».`);
      vars.push([variable, v.size]);
      for (const p of TEXT_PROPS.slice(1)) vars.push([`${variable}--${p}`, v[p]]);
      for (const [k, val] of vars.slice(-4)) flat[k] = { light: val, dark: val };
    } else {
      if (typeof v !== "string") { errors.push(`${variable}: debe ser texto.`); continue; }
      vars.push([variable, v]);
      flat[variable] = { light: v, dark: v };
    }
  }
  light.push([g, vars]);
}
const reduced = Object.entries(t.reducedMotion || {}).map(([k, v]) => [`--${k}`, v]);
for (const [k] of reduced) if (!(k in flat)) errors.push(`reducedMotion: ${k} no existe en los tokens.`);
const aliases = Object.entries(t.docAliases || {}).map(([short, long]) => [`--${short}`, `var(--${long})`]);
for (const [k, v] of aliases) if (!(v.slice(4, -1) in flat)) errors.push(`docAliases: ${k} apunta a una variable que no existe (${v}).`);

// Contrast (D-006, D-038): each foreground/background pair of tokens.json meets the minimum in light and dark (WCAG 2.x).
const luminance = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrastRatio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const minimum = t.contrast?.min ?? 4.5;
let checkedPairs = 0;
for (const [fg, bg] of t.contrast?.pairs ?? []) {
  const a = flat[`--color-${fg}`], b = flat[`--color-${bg}`];
  if (!a || !b) { errors.push(`contrast: el par ${fg} / ${bg} usa un color que no existe.`); continue; }
  for (const mode of ["light", "dark"]) {
    if (!/^#[0-9a-fA-F]{6}$/.test(a[mode]) || !/^#[0-9a-fA-F]{6}$/.test(b[mode])) { errors.push(`contrast: ${fg} / ${bg} (${mode}) no es un color #rrggbb.`); continue; }
    const r = contrastRatio(a[mode], b[mode]);
    if (r < minimum) errors.push(`contraste ${fg} sobre ${bg} en ${mode === "light" ? "claro" : "oscuro"}: ${r.toFixed(2)}:1, mínimo ${minimum}:1 (D-038).`);
  }
  checkedPairs++;
}

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

// ---------- writing ----------
const decl = (pairs, indent) => pairs.map(([k, v]) => `${indent}${k}: ${v};`).join("\n");
const lightBlocks = (indent) => light.map(([g, vars]) => `${indent}/* ${g} */\n${decl(vars, indent)}`).join("\n\n");
const darkCss = [
  `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n    color-scheme: dark;\n${decl(dark, "    ")}\n  }\n}`,
  `:root[data-theme="dark"] {\n  color-scheme: dark;\n${decl(dark, "  ")}\n}`,
  `:root[data-theme="light"] {\n  color-scheme: light;\n}`,
  `@media (prefers-reduced-motion: reduce) {\n  :root {\n${decl(reduced, "    ")}\n  }\n}`,
].join("\n\n");

// The texts written inside the generated CSS belong to the artifact, not to this script (DA-4): they stay as they are.
const plain = `/* The Brain · tokens. GENERADO por scripts/build-tokens.mjs desde src/ui/tokens/tokens.json; no editar a mano. */\n` +
  `:root {\n${lightBlocks("  ")}\n\n  /* alias de nombres cortos de la v6 (--ink-muted, --space-4…): los leen components.css y el documento de referencia */\n${decl(aliases, "  ")}\n}\n\n${darkCss}\n`;

// Tailwind 4: the default namespaces are reset (D-017, D-018) and only those of tokens.json exist.
// "static" makes every variable get emitted even if no utility uses it (components read them with var()).
const RESET = ["--color-*", "--spacing", "--spacing-*", "--radius-*", "--shadow-*", "--inset-shadow-*", "--drop-shadow-*",
  "--font-*", "--text-*", "--ease-*", "--container-*"];
const theme = `/* The Brain · tema de Tailwind 4. GENERADO por scripts/build-tokens.mjs desde src/ui/tokens/tokens.json; no editar a mano. */\n` +
  `/* Se importa después de tailwindcss en src/styles.css. Los valores oscuros redefinen las mismas variables por tema (D-006, D-026). */\n` +
  `@theme static {\n  /* sin paleta ni escalas por defecto de Tailwind */\n${RESET.map((v) => `  ${v}: initial;`).join("\n")}\n\n${lightBlocks("  ")}\n}\n\n${darkCss}\n`;

const outputs = {
  "tokens.plain.css": plain,
  "theme.css": theme,
  "tokens.flat.json": JSON.stringify(flat, null, 2) + "\n",
};
let stale = false;
for (const [name, content] of Object.entries(outputs)) {
  const p = resolve(dir, name);
  if (check) {
    if (!existsSync(p) || readFileSync(p, "utf8") !== content) { console.error(`DESACTUALIZADO: src/ui/tokens/${name}`); stale = true; }
  } else writeFileSync(p, content);
}
if (stale) { console.error("Ejecuta: node scripts/build-tokens.mjs"); process.exit(1); }
console.log(`contraste: ${checkedPairs} pares ≥ ${minimum}:1 en claro y oscuro`);
console.log(check ? "tokens al día" : `tokens: ${Object.keys(flat).length} variables · oscuras explícitas: ${dark.length} · ${Object.keys(outputs).join(", ")}`);
