#!/usr/bin/env node
// Construye las páginas del documento de referencia visual a partir de los mismos tokens que usa la app.
//
//   páginas:  src/ui/docs/<nombre>.src.html  →  src/ui/docs/<salida>.html
//   marcadores que cada página debe tener exactamente una vez:
//     /*@@TOKENS@@*/            src/ui/tokens/tokens.plain.css (generado por build-tokens.mjs)
//     /*@@CHROME@@*/            src/ui/docs/chrome.css         (marco del documento: encabezado, rejilla, muestras)
//     /*@@COMPONENTS@@*/        src/ui/docs/components.css     (clases tb-*, compartidas por todas las páginas)
//     <!--@@THEME_TOGGLE@@-->   src/ui/docs/theme-toggle.html  (botón de modo claro u oscuro, en el encabezado)
//     /*@@THEME_JS@@*/          src/ui/docs/theme-toggle.js    (script del botón, dentro de un <script> en <head>)
//   Los tres primeros van juntos dentro de <style>.
//
// Uso:
//   node scripts/build-doc.mjs           genera las páginas
//   node scripts/build-doc.mjs --check   falla si alguna página en disco no coincide
//
// Falla si falta un marcador o si una página usa una variable CSS que nadie define.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docs = resolve(root, "src/ui/docs");
const check = process.argv.includes("--check");

const PAGES = [
  { src: "reference.src.html", out: "the-brain-design-system.html" },
];

const read = (p) => readFileSync(resolve(p), "utf8");
const MARKERS = {
  "/*@@TOKENS@@*/": read(resolve(root, "src/ui/tokens/tokens.plain.css")).trim().replace(/^\/\*[^]*?\*\/\n/, ""),
  "/*@@CHROME@@*/": read(resolve(docs, "chrome.css")),
  "/*@@COMPONENTS@@*/": read(resolve(docs, "components.css")),
  "<!--@@THEME_TOGGLE@@-->": read(resolve(docs, "theme-toggle.html")).trim(),
  "/*@@THEME_JS@@*/": read(resolve(docs, "theme-toggle.js")).trim(),
};

let failed = false;
const report = [];
for (const page of PAGES) {
  const srcPath = resolve(docs, page.src);
  const outPath = resolve(docs, page.out);
  let html = read(srcPath);

  for (const marker of Object.keys(MARKERS)) {
    if (html.split(marker).length !== 2) {
      console.error(`${page.src}: debe tener el marcador ${marker} exactamente una vez.`);
      failed = true;
    }
  }
  if (failed) continue;
  for (const [marker, content] of Object.entries(MARKERS)) html = html.replace(marker, () => content);

  const defined = new Set([...html.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...html.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
  const missing = [...used].filter((v) => !defined.has(v)).sort();
  if (missing.length) {
    console.error(`${page.out} usa variables CSS sin definir:\n` + missing.map((v) => "  - " + v).join("\n"));
    failed = true;
    continue;
  }

  if (check) {
    if (!existsSync(outPath) || read(outPath) !== html) {
      console.error(`DESACTUALIZADO: src/ui/docs/${page.out}`);
      failed = true;
    }
  } else {
    writeFileSync(outPath, html);
    report.push(`${page.out} · variables definidas: ${defined.size} · usadas: ${used.size} · sin definir: 0`);
  }
}

if (failed) {
  if (check) console.error("Ejecuta: node scripts/build-doc.mjs");
  process.exit(1);
}
console.log(check ? "documentos al día" : report.join("\n"));
