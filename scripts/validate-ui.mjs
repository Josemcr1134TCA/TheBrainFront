#!/usr/bin/env node
// Validador estático del design system de The Brain (D-005, D-019; DEC-0009 del arnés).
// Revisa lo que el tema de Tailwind no puede impedir. Lee las plantillas, componentes y estilos de la app
// (src/**/*.html, *.ts, *.css), salvo src/ui/ (design system y su documento) y los *.spec.ts.
//
//   node scripts/validate-ui.mjs            revisa src/
//   node scripts/validate-ui.mjs --prueba   corre las pruebas del propio validador
//
// ERROR (falla el PR):
//   - valores arbitrarios de Tailwind: bg-[#fff], p-[13px], w-[calc(...)]          (D-017 a D-019)
//   - modificadores de opacidad: bg-accent/50, text-ink/80                           (D-019)
//   - clases integradas sin token: font-bold (y demás pesos), duration-NNN, delay-NNN,
//     *-px (p-px, gap-px…)                                                           (D-018, D-019)
//   - colores escritos a mano: #hex, rgb(), rgba(), hsl(), hsla(), oklch()           (D-017)
//   - variables que no existen en tokens.json, o valores arbitrarios entre paréntesis: duration-(--x), w-(calc…)
//   - emoji                                                                           («Contenido y tono»)
// AVISO (no falla, se resuelve o se justifica en el PR):
//   - porcentaje sin espacio («24.5%» → «24.5 %»), fechas con barras («30/09/2026» → «30-sep-2026»)
//   - posible nombre de persona en un texto de acción («Esperando a …»)                (D-007, heurística)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Variables que existen en el design system (generado por build-tokens.mjs). Solo esas se pueden usar con la
// sintaxis de Tailwind 4 para variables: duration-(--motion-duration-fast), bg-(--color-accent).
const TOKENS = new Set(Object.keys(JSON.parse(readFileSync(join(root, "src/ui/tokens/tokens.flat.json"), "utf8"))));

const PESOS = "thin|extralight|light|normal|medium|semibold|bold|extrabold|black";
const PREFIJOS_COLOR = "bg|text|border|border-[trblxy]|ring|ring-offset|outline|fill|stroke|divide|decoration|placeholder|caret|accent|shadow|from|via|to";
const REGLAS_ERROR = [
  { id: "valor-arbitrario", re: /(?<![\w-])(?:[a-z][\w-]*:)*-?[a-z][\w-]*-\[[^\]\s]+\]/g, msg: "valor arbitrario de Tailwind; usa un token de tokens.json o pregunta (D-009)" },
  { id: "opacidad", re: new RegExp(`(?<![\\w-])(?:[a-z][\\w-]*:)*(?:${PREFIJOS_COLOR})-[a-z][\\w-]*\\/\\d{1,3}(?![\\w.])`, "g"), msg: "modificador de opacidad; no existe en el design system (D-019)" },
  { id: "peso-fuente", re: new RegExp(`(?<![\\w-])(?:[a-z][\\w-]*:)*font-(?:${PESOS})(?![\\w-])`, "g"), msg: "el peso lo fija el estilo tipográfico (text-*), no font-* (D-018, D-019)" },
  { id: "duracion", re: /(?<![\w-])(?:[a-z][\w-]*:)*(?:duration|delay)-\d+(?![\w-])/g, msg: "duración sin token; usa duration-(--motion-duration-fast) o duration-(--motion-duration-base) (D-016, D-019)" },
  { id: "px", re: /(?<![\w-])(?:[a-z][\w-]*:)*-?(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|top|right|bottom|left|w|h|size)-px(?![\w-])/g, msg: "*-px no es un token de espaciado (D-018, D-019)" },
  { id: "color-a-mano", re: /#[0-9a-fA-F]{3,8}(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g, msg: "color escrito a mano; usa var(--color-…) o una clase de token (D-017)" },
  { id: "variable-desconocida", re: /(?<![\w-])(?:[a-z][\w-]*:)*-?[a-z][\w-]*-\((--[\w-]+)\)/g, filtro: (m) => !TOKENS.has(m[1]), msg: "variable que no existe en tokens.json (D-009: pregunta antes de inventarla)" },
  { id: "variable-arbitraria", re: /(?<![\w-])(?:[a-z][\w-]*:)*-?[a-z][\w-]*-\((?!--)[^)\s]+\)/g, msg: "valor arbitrario entre paréntesis; solo se admiten variables de tokens.json" },
  { id: "emoji", re: /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, msg: "emoji en la interfaz («Contenido y tono»)" },
];
const REGLAS_AVISO = [
  { id: "porcentaje", re: /\d%/g, soloTexto: true, msg: "porcentaje sin espacio: «24.5 %»" },
  { id: "fecha-barras", re: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, soloTexto: true, msg: "fecha con barras: el formato es «30-sep-2026»" },
  { id: "persona", re: /\b(?:Esperando a|Asignado a|Aprobado por|Enviar a)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/g, soloTexto: true, msg: "posible nombre de persona en una acción o etiqueta (D-007)" },
];

// Partes de un archivo que se revisan. En .ts se omiten los comentarios; en .css, los comentarios.
function quitarComentarios(texto, ext) {
  const blanco = (m) => m.replace(/[^\n]/g, " "); // conserva líneas para reportar bien
  if (ext === ".css") return texto.replace(/\/\*[\s\S]*?\*\//g, blanco);
  if (ext === ".ts") return texto.replace(/\/\*[\s\S]*?\*\//g, blanco).replace(/(^|[^:])\/\/.*$/gm, (m, a) => a + blanco(m.slice(a.length)));
  if (ext === ".html") return texto.replace(/<!--[\s\S]*?-->/g, blanco);
  return texto;
}
// Texto visible aproximado: en .html, lo que no es etiqueta; en .ts, el contenido de los literales de plantilla.
function soloTexto(texto, ext) {
  if (ext === ".html") return texto.replace(/<[^>]*>/g, (m) => m.replace(/[^\n]/g, " "));
  if (ext === ".ts") return texto.replace(/[^`]*(`[^`]*`)?/g, (m, lit) => (lit ? m.slice(0, m.length - lit.length).replace(/[^\n]/g, " ") + lit.replace(/<[^>]*>/g, (t) => t.replace(/[^\n]/g, " ")) : m.replace(/[^\n]/g, " ")));
  return "";
}
const linea = (texto, i) => texto.slice(0, i).split("\n").length;

export function revisar(texto, ext) {
  const limpio = quitarComentarios(texto, ext);
  const hallazgos = [];
  for (const r of REGLAS_ERROR) for (const m of limpio.matchAll(r.re)) if (!r.filtro || r.filtro(m)) hallazgos.push({ nivel: "ERROR", id: r.id, linea: linea(limpio, m.index), muestra: m[0], msg: r.msg });
  const visible = soloTexto(limpio, ext);
  for (const r of REGLAS_AVISO) for (const m of visible.matchAll(r.re)) hallazgos.push({ nivel: "AVISO", id: r.id, linea: linea(visible, m.index), muestra: m[0], msg: r.msg });
  return hallazgos.sort((a, b) => a.linea - b.linea);
}

function archivos(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const rel = relative(root, p).split(sep).join("/");
    if (rel === "src/ui" || n === "node_modules") continue;
    if (statSync(p).isDirectory()) out.push(...archivos(p));
    else if ([".html", ".ts", ".css"].includes(extname(n)) && !n.endsWith(".spec.ts")) out.push(p);
  }
  return out;
}

function pruebas() {
  const casos = [
    // [texto, ext, ids esperados (en orden, sin repetir)]
    ['<div class="bg-[#ff0000] p-[13px]"></div>', ".html", ["valor-arbitrario", "color-a-mano"]],
    ['<div class="bg-accent/50 hover:text-ink/80"></div>', ".html", ["opacidad"]],
    ['<span class="font-bold duration-150 p-px"></span>', ".html", ["duracion", "peso-fuente", "px"]],
    [".x{color:rgb(0,0,0)}", ".css", ["color-a-mano"]],
    ["<p>Listo 🚀</p>", ".html", ["emoji"]],
    ["<td>24.5%</td><td>30/09/2026</td>", ".html", ["fecha-barras", "porcentaje"]],
    ["<button>Esperando a Óscar</button>", ".html", ["persona"]],
    ['<div class="bg-surface text-ink p-5 rounded-full text-micro duration-(--motion-duration-fast) shadow-card"></div>', ".html", []],
    ['<div class="duration-(--motion-duration-lenta) bg-(--color-azul)"></div>', ".html", ["variable-desconocida"]],
    ['<div class="w-(calc(100%-1px))"></div>', ".html", ["variable-arbitraria"]],
    ['/* #ffffff en un comentario */ .x{color:var(--color-ink)}', ".css", []],
    ["// rgb( en comentario\nconst a = 10 / 2;", ".ts", []],
    ['<td>24.5 %</td><td>30-sep-2026</td><button>Esperando aprobación</button>', ".html", []],
    ["const t = `<p>${'{'}x{'}'} 12%</p>`;", ".ts", ["porcentaje"]],
  ];
  let fallas = 0;
  for (const [texto, ext, esperado] of casos) {
    const obtenido = [...new Set(revisar(texto, ext).map((h) => h.id))].sort();
    const ok = JSON.stringify(obtenido) === JSON.stringify([...esperado].sort());
    if (!ok) { fallas++; console.error(`FALLA ${JSON.stringify(texto)} → ${obtenido.join(", ") || "(nada)"}; se esperaba ${esperado.join(", ") || "(nada)"}`); }
  }
  console.log(fallas ? `validate-ui: ${fallas} prueba(s) fallaron de ${casos.length}` : `validate-ui: ${casos.length} pruebas correctas`);
  process.exit(fallas ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--prueba")) pruebas();
  let errores = 0, avisos = 0;
  for (const p of archivos(join(root, "src"))) {
    const rel = relative(root, p).split(sep).join("/");
    for (const h of revisar(readFileSync(p, "utf8"), extname(p))) {
      console.log(`${h.nivel === "ERROR" ? "ERROR" : "AVISO"}  ${rel}:${h.linea}  ${h.muestra}  · ${h.msg}`);
      h.nivel === "ERROR" ? errores++ : avisos++;
    }
  }
  console.log(`validate-ui: ${errores} error(es), ${avisos} aviso(s)`);
  process.exit(errores ? 1 : 0);
}
