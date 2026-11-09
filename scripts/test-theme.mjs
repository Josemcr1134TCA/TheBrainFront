#!/usr/bin/env node
// Prueba del tema de Tailwind (D-017, D-018): solo compilan las clases que salen de tokens.json.
//   node scripts/test-theme.mjs
// Compila con el CLI de Tailwind una lista fija de clases y comprueba cuáles generan regla y cuáles no.
// Lo que el tema NO puede impedir (valores arbitrarios, /50, p-px, rounded-full, font-bold…; D-019) no se prueba aquí:
// es trabajo del validador estático.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEBEN = ["bg-accent", "text-ink-muted", "border-line", "bg-surface", "bg-surface-hover", "text-on-navy", "text-on-accent", "p-1", "p-5", "p-8", "gap-6",
  "rounded-sm", "rounded-xl", "rounded-full", "shadow-card", "shadow-sheet", "font-sans", "font-mono", "text-display", "text-body", "text-cell",
  "text-micro", "text-kpi", "text-num", "ease-out"];
const NO_DEBEN = ["bg-white", "bg-black", "bg-blue-600", "text-gray-500", "p-7", "p-9", "gap-10",
  "rounded-2xl", "shadow-md", "shadow-lg", "text-sm", "text-xl", "ease-in", "max-w-md", "bg-mute", "text-page-title"];

// Dentro de node_modules para que «tailwindcss» se resuelva desde el proyecto.
const tmp = join(root, "node_modules/.cache/tb-theme");
mkdirSync(tmp, { recursive: true });
const entrada = join(tmp, "entrada.css"), salida = join(tmp, "salida.css");
const theme = join(root, "src/ui/tokens/theme.css").replace(/\\/g, "/");
writeFileSync(entrada, `@import "tailwindcss" source(none);\n@import "${theme}";\n@source inline("${[...DEBEN, ...NO_DEBEN].join(" ")}");\n`);

const cli = join(root, "node_modules/@tailwindcss/cli/dist/index.mjs");
const r = spawnSync(process.execPath, [cli, "-i", entrada, "-o", salida], { cwd: root, encoding: "utf8" });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const css = readFileSync(salida, "utf8");
const existe = (c) => new RegExp(`\\.${c.replace(/[-]/g, "\\-")}\\s*\\{`).test(css);

const fallas = [
  ...DEBEN.filter((c) => !existe(c)).map((c) => `debería compilar y no compila: ${c}`),
  ...NO_DEBEN.filter(existe).map((c) => `no debería compilar y compila: ${c}`),
];
if (fallas.length) { console.error(fallas.join("\n")); process.exit(1); }
console.log(`tema ok · compilan ${DEBEN.length} clases de tokens.json · no compilan ${NO_DEBEN.length} clases por defecto de Tailwind`);
