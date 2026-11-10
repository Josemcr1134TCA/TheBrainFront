#!/usr/bin/env node
// Tailwind theme test (D-017, D-018): only the classes that come from tokens.json compile.
//   node scripts/test-theme.mjs
// Compiles a fixed list of classes with the Tailwind CLI and checks which ones generate a rule and which do not.
// What the theme CANNOT prevent (arbitrary values, /50, p-px, rounded-full, font-bold...; D-019) is not tested here:
// that is the job of the static validator.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MUST_COMPILE = ["bg-accent", "text-ink-muted", "border-line", "bg-surface", "bg-surface-hover", "text-on-navy", "text-on-accent", "p-1", "p-5", "p-8", "gap-6",
  "rounded-sm", "rounded-xl", "rounded-full", "shadow-card", "shadow-sheet", "font-sans", "font-mono", "text-display", "text-body", "text-cell",
  "text-micro", "text-kpi", "text-num", "ease-out"];
const MUST_NOT_COMPILE = ["bg-white", "bg-black", "bg-blue-600", "text-gray-500", "p-7", "p-9", "gap-10",
  "rounded-2xl", "shadow-md", "shadow-lg", "text-sm", "text-xl", "ease-in", "max-w-md", "bg-mute", "text-page-title"];

// Inside node_modules so that "tailwindcss" resolves from the project.
const tmp = join(root, "node_modules/.cache/tb-theme");
mkdirSync(tmp, { recursive: true });
const input = join(tmp, "input.css"), output = join(tmp, "output.css");
const theme = join(root, "src/ui/tokens/theme.css").replace(/\\/g, "/");
writeFileSync(input, `@import "tailwindcss" source(none);\n@import "${theme}";\n@source inline("${[...MUST_COMPILE, ...MUST_NOT_COMPILE].join(" ")}");\n`);

const cli = join(root, "node_modules/@tailwindcss/cli/dist/index.mjs");
const r = spawnSync(process.execPath, [cli, "-i", input, "-o", output], { cwd: root, encoding: "utf8" });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const css = readFileSync(output, "utf8");
const compiles = (c) => new RegExp(`\\.${c.replace(/[-]/g, "\\-")}\\s*\\{`).test(css);

const failures = [
  ...MUST_COMPILE.filter((c) => !compiles(c)).map((c) => `debería compilar y no compila: ${c}`),
  ...MUST_NOT_COMPILE.filter(compiles).map((c) => `no debería compilar y compila: ${c}`),
];
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`tema ok · compilan ${MUST_COMPILE.length} clases de tokens.json · no compilan ${MUST_NOT_COMPILE.length} clases por defecto de Tailwind`);
