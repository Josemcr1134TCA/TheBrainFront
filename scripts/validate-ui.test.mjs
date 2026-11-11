// Black-box tests for scripts/validate-ui.mjs after the DEC-0013 migration (EP00-TBR-014).
// [EP00-TBR-014-CA5] The legacy CLI option is rejected, points to --test and does not review src/.
// [EP00-TBR-014-CA4] --test works, the public API is review(text, ext) with the DA-5 rule ids,
// ds:validate is wired with --test plus this suite (DA-1 a), no legacy Spanish code is left in
// scripts/ or .dependency-cruiser.cjs, and the messages for people stay in Spanish.
// Written from the acceptance criteria and the design (docs/diseno/EP00-TBR-014.md, DA-1, DA-3, DA-5).
// [EP00-TBR-004-CA1] The validator reviews src/ui/components/ and src/ui/format/ but not src/ui/tokens/ or src/ui/docs/
// (DA-2, isReviewed); the pieces only use variables of tokens.flat.json and utility classes that compile against theme.css.
// [EP00-TBR-004-CA3] Static checks that jsdom cannot make: focus ring with the focus token, reduced motion, ellipsis,
// and the contrast pairs used by the pieces listed in tokens.json (design docs/diseno/EP00-TBR-004.md §1.4, §4, §6).
// Run: node --test scripts/validate-ui.test.mjs
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = join(FRONT, "scripts");
const SCRIPT = join(SCRIPTS, "validate-ui.mjs");
const CONFIG = join(FRONT, ".dependency-cruiser.cjs");
const CHILD_TIMEOUT_MS = 120_000;

// Dynamic import: a missing export fails single tests instead of the whole file.
const validateUi = await import(pathToFileURL(SCRIPT).href);
const review = validateUi.review;

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: FRONT, encoding: "utf8", timeout: CHILD_TIMEOUT_MS });
  return { status: r.status, signal: r.signal, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// Output of a full review of src/: the summary line and the per-finding labels.
const SUMMARY_RE = /\d+ error\(es\), \d+ aviso\(s\)/;
const FINDING_LABEL_RE = /\b(?:ERROR|AVISO)\b/;
const STACK_TRACE_RE = /^\s+at .+:\d+(?::\d+)?\)?\s*$/m;

// DA-5: the only ids review may emit, with their level (DA-3).
const RULE_LEVELS = {
  "arbitrary-value": "error",
  opacity: "error",
  "font-weight": "error",
  duration: "error",
  px: "error",
  "hardcoded-color": "error",
  "unknown-variable": "error",
  "arbitrary-variable": "error",
  emoji: "error",
  "percent-spacing": "warning",
  "slash-date": "warning",
  "person-name": "warning",
};
const RULE_IDS = Object.keys(RULE_LEVELS).sort();

const cls = (c) => `<div class="${c}"></div>`;
const paragraph = (t) => `<p>${t}</p>`;
// One synthetic trigger per rule id (UI-like text, no real data).
const TRIGGERS = [
  ["arbitrary-value", cls("w-[13px]"), ".html"],
  ["opacity", cls("bg-primary/50"), ".html"],
  ["font-weight", cls("font-bold"), ".html"],
  ["duration", cls("duration-700"), ".html"],
  ["px", cls("p-px"), ".html"],
  ["hardcoded-color", ".card { color: #ff0000; }", ".css"],
  ["unknown-variable", cls("bg-(--does-not-exist)"), ".html"],
  ["arbitrary-variable", cls("bg-(red)"), ".html"],
  ["emoji", paragraph("Listo \u{1F389}"), ".html"],
  ["percent-spacing", paragraph("Avance 24.5%"), ".html"],
  ["slash-date", paragraph("Entrega 10/11/2026"), ".html"],
  ["person-name", paragraph("Esperando a Óscar"), ".html"],
];
// Extra inputs that mix several rules, to look for ids outside DA-5.
const EXTRA_INPUTS = [
  [cls("text-[#fff] md:font-black hover:bg-text/10 delay-150 -m-px bg-(--x) w-(calc)"), ".html"],
  [`@Component({ template: '<span class="duration-[300ms]">☀ Asignado a Laura 5% 1/2/26</span>' })`, ".ts"],
  [".a { background: rgba(0, 0, 0, 0.5); border-color: #abc; }", ".css"],
  [paragraph("Aprobado por Mateo el 3/4/2026 con 10% \u{1F600}"), ".html"],
];

const SPANISH_STOPWORDS = new Set([
  "de", "del", "la", "las", "el", "los", "que", "para", "por", "con", "una", "un", "unos", "unas", "sin", "se",
  "al", "lo", "su", "sus", "en", "cuando", "como", "pero", "tambien", "hay", "esta", "estan", "son", "segun", "entre",
]);
// Spanish words used in the legacy identifiers of scripts/ and .dependency-cruiser.cjs (design §2.1–§2.8),
// plus the legacy module names. Matched against identifier parts (camelCase, snake_case, kebab-case).
const SPANISH_WORDS = new Set([
  "revisar", "nivel", "peso", "pesos", "prefijos", "regla", "reglas", "errores", "aviso", "avisos", "filtro",
  "texto", "quitar", "comentarios", "hallazgo", "hallazgos", "limpio", "archivo", "archivos", "prueba", "pruebas",
  "caso", "casos", "falla", "fallas", "esperado", "obtenido", "linea", "blanco", "muestra", "valor", "arbitrario",
  "arbitraria", "opacidad", "fuente", "duracion", "desconocida", "porcentaje", "fecha", "barras", "persona",
  "modulo", "modulos", "frontera", "capas", "independiente", "ciclos", "grupo", "grupos", "tematicos", "claro",
  "claros", "oscuro", "nombre", "tiene", "igual", "reducido", "corto", "largo", "luminancia", "contraste",
  "minimo", "revisados", "fondo", "tema", "sangria", "bloques", "salida", "salidas", "entrada", "vaciar",
  "desactualizado", "contenido", "deben", "existe", "raiz", "ruta", "rutas", "generar", "crear", "validar",
  "nuevo", "dominio", "aplicacion", "infraestructura", "paginas", "componentes", "datos", "modelo",
  "catalogo", "abastecimiento", "compras", "inventario", "comercial", "inteligencia", "integracion", "administracion",
]);
// Legacy ids, option and file names that may not survive as code tokens (design §2.1, §2.5, §2.8, §3.2).
const LEGACY_TOKENS = [
  "--prueba", "MODULOS", "frontera-", "capas-del-modulo", "http-solo-en-data", "ui-independiente", "sin-ciclos",
  "hub-solo-por-api", "sin-backend-en-el-front", "valor-arbitrario", "opacidad", "peso-fuente", "duracion",
  "color-a-mano", "variable-desconocida", "variable-arbitraria", "porcentaje", "fecha-barras", "persona",
  "entrada.css", "salida.css",
  "catalogo", "abastecimiento", "compras", "inventario", "comercial", "inteligencia", "integracion", "administracion",
];
// The one legacy token allowed as a bare literal: validate-ui.mjs may name the old option to reject it (CA5).
const ALLOWED_LEGACY_LITERALS = { "validate-ui.mjs": new Set(["--prueba"]) };

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LEGACY_RES = LEGACY_TOKENS.map((t) => [t, new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(t)}${t.endsWith("-") ? "" : "(?![A-Za-z0-9_])"}`)]);

const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hasSpanishAccent = (s) => /[áéíóúñ¿¡]/i.test(s);
const stripQuoted = (s) => s.replace(/«[^»]*»|"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g, " ");
const words = (s) => fold(s).split(/[^a-z0-9ñ-]+/).filter(Boolean);
const identifierParts = (id) =>
  id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/[\s_$-]+/).filter(Boolean).map(fold);

// Prose heuristic: two Spanish function words, one plus an accent, or a word of the legacy vocabulary.
function looksSpanish(prose) {
  const text = stripQuoted(prose);
  const ws = words(text);
  const stop = ws.filter((w) => SPANISH_STOPWORDS.has(w)).length;
  if (stop >= 2 || (stop >= 1 && hasSpanishAccent(text))) return true;
  return ws.some((w) => SPANISH_WORDS.has(w));
}
// Message heuristic (short messages for people): a Spanish function word or an accent.
const isSpanishMessage = (s) => hasSpanishAccent(s) || words(s).some((w) => SPANISH_STOPWORDS.has(w));

// Minimal JS lexer: splits a source into code (strings, regexes and comments blanked, same length),
// comments and string pieces (template literal text included), each with its offset.
function lex(src) {
  const code = src.split("");
  const comments = [];
  const strings = [];
  const n = src.length;
  let i = 0;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (code[k] !== "\n") code[k] = " "; };
  const KEYWORDS = new Set(["return", "typeof", "case", "in", "of", "new", "delete", "void", "throw", "else", "do", "await", "yield"]);
  function regexAllowed(at) {
    let j = at - 1;
    while (j >= 0 && /\s/.test(code[j])) j--;
    if (j < 0) return true;
    const p = code[j];
    if ("(,=:[!&|?{};+-*%<>~^".includes(p)) return true;
    if (/[\w$]/.test(p)) {
      let k = j;
      while (k >= 0 && /[\w$]/.test(code[k])) k--;
      return KEYWORDS.has(code.slice(k + 1, j + 1).join(""));
    }
    return false;
  }
  function lexCode(insideTemplate) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      const d = src[i + 1];
      if (c === "/" && d === "/") {
        const e = src.indexOf("\n", i);
        const end = e < 0 ? n : e;
        comments.push({ text: src.slice(i + 2, end), at: i });
        blank(i, end);
        i = end;
      } else if (c === "/" && d === "*") {
        const e = src.indexOf("*/", i + 2);
        const end = e < 0 ? n : e + 2;
        comments.push({ text: src.slice(i + 2, Math.max(i + 2, end - 2)), at: i });
        blank(i, end);
        i = end;
      } else if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
        strings.push({ text: src.slice(i + 1, j), at: i });
        blank(i + 1, j);
        i = j + 1;
      } else if (c === "`") {
        i++;
        lexTemplate();
      } else if (c === "/" && regexAllowed(i)) {
        let j = i + 1;
        let inClass = false;
        while (j < n && src[j] !== "\n") {
          const ch = src[j];
          if (ch === "\\") { j += 2; continue; }
          if (ch === "[") inClass = true;
          else if (ch === "]") inClass = false;
          else if (ch === "/" && !inClass) break;
          j++;
        }
        blank(i + 1, j);
        i = j + 1;
      } else {
        if (insideTemplate) {
          if (c === "{") depth++;
          else if (c === "}") {
            if (depth === 0) { i++; return; }
            depth--;
          }
        }
        i++;
      }
    }
  }
  function lexTemplate() {
    let start = i;
    while (i < n) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { strings.push({ text: src.slice(start, i), at: start }); blank(start, i); i++; return; }
      if (c === "$" && src[i + 1] === "{") {
        strings.push({ text: src.slice(start, i), at: start });
        blank(start, i);
        i += 2;
        lexCode(true);
        start = i;
        continue;
      }
      i++;
    }
    strings.push({ text: src.slice(start), at: start });
    blank(start, n);
  }
  if (src.startsWith("#!")) {
    const e = src.indexOf("\n");
    i = e < 0 ? n : e;
    blank(0, i);
  }
  lexCode(false);
  return { code: code.join(""), comments, strings };
}

const lineAt = (src, at) => src.slice(0, at).split("\n").length;

function sourceFiles() {
  const files = readdirSync(SCRIPTS, { recursive: true })
    .map(String)
    .filter((f) => /\.(?:mjs|cjs|js)$/.test(f))
    .map((f) => join(SCRIPTS, f));
  return [...files, CONFIG];
}

// Exceptions (CA4: "salvo en las listas de prueba de nombres antiguos y en los mensajes"):
//  E1. string literals in *.test.mjs (legacy-name lists, fixtures, assertion messages); titles are checked apart;
//  E2. string literals with whitespace in non-test files (messages for people and text written into generated CSS, DA-4);
//  E3. regex literal bodies (patterns that recognise Spanish UI text are data);
//  E4. the bare literal listed in ALLOWED_LEGACY_LITERALS (validate-ui.mjs names the old option to reject it);
//  E5. legacy tokens inside comments of *.test.mjs (they describe the legacy-name cases).
const stripLegacy = (s) => LEGACY_RES.reduce((acc, [, re]) => acc.replace(new RegExp(re.source, "g"), " "), s);
function legacyCodeFindings(file) {
  const src = readFileSync(file, "utf8");
  const name = relative(FRONT, file).replaceAll("\\", "/");
  const isTest = file.endsWith(".test.mjs");
  const { code, comments, strings } = lex(src);
  const found = [];
  for (const m of code.matchAll(/(?<![\w$])[A-Za-z_$][\w$]*/g)) {
    const bad = identifierParts(m[0]).filter((p) => SPANISH_WORDS.has(p));
    if (bad.length) found.push(`${name}:${lineAt(src, m.index)} identifier ${m[0]}`);
  }
  for (const c of comments) {
    // E5: comments of *.test.mjs may name the legacy tokens they test; their prose must still be English.
    const prose = isTest ? stripLegacy(c.text) : c.text;
    const legacy = LEGACY_RES.filter(([, re]) => re.test(prose)).map(([t]) => t);
    if (legacy.length) found.push(`${name}:${lineAt(src, c.at)} comment names legacy ${legacy.join(", ")}`);
    else if (looksSpanish(prose)) found.push(`${name}:${lineAt(src, c.at)} comment in Spanish: ${c.text.trim().slice(0, 60)}`);
  }
  if (!isTest) {
    const allowed = ALLOWED_LEGACY_LITERALS[basename(file)] ?? new Set();
    for (const s of strings) {
      if (/\s/.test(s.text) || allowed.has(s.text)) continue;
      const legacy = LEGACY_RES.filter(([, re]) => re.test(s.text)).map(([t]) => t);
      if (legacy.length) found.push(`${name}:${lineAt(src, s.at)} literal "${s.text}" names legacy ${legacy.join(", ")}`);
    }
  }
  return found;
}

function testTitles(file) {
  const src = readFileSync(file, "utf8");
  return [...src.matchAll(/\b(?:test|it|describe)\s*\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => ({
    title: m[2],
    line: lineAt(src, m.index),
  }));
}

describe("validate-ui CLI options", () => {
  test("[EP00-TBR-014-CA5] rejects the legacy --prueba option, points to --test and does not review src/", () => {
    const r = run(["--prueba"]);
    assert.equal(r.signal, null, "el proceso no debe terminar por tiempo");
    assert.notEqual(r.status, 0, "--prueba debe salir con código distinto de 0");
    assert.match(r.stderr, /--test/, `stderr debe indicar usar --test; stderr: ${r.stderr}`);
    assert.ok(isSpanishMessage(r.stderr.replace(/--\S+/g, "")), `el mensaje para personas sigue en español; stderr: ${r.stderr}`);
    assert.doesNotMatch(r.stdout + r.stderr, SUMMARY_RE, "no debe correr la revisión de src/ (apareció el resumen)");
    assert.doesNotMatch(r.stdout, FINDING_LABEL_RE, "no debe imprimir hallazgos de src/");
    assert.doesNotMatch(r.stderr, STACK_TRACE_RE, "el rechazo no debe ser una excepción con traza");
  });

  for (const args of [["--x"], ["--TEST"], ["-t"], ["src"], ["--prueba", "--test"]]) {
    test(`[EP00-TBR-014-CA5] rejects the unknown argument list ${JSON.stringify(args)} without reviewing src/`, () => {
      const r = run(args);
      assert.equal(r.signal, null);
      assert.notEqual(r.status, 0, `${args.join(" ")} debe salir con código distinto de 0`);
      assert.notEqual(r.stderr.trim(), "", "debe explicar el rechazo en stderr");
      assert.doesNotMatch(r.stdout + r.stderr, SUMMARY_RE, "no debe correr la revisión de src/");
      assert.doesNotMatch(r.stdout, FINDING_LABEL_RE);
      assert.doesNotMatch(r.stderr, STACK_TRACE_RE);
    });
  }

  test("[EP00-TBR-014-CA5][EP00-TBR-014-CA4] control: with no arguments it reviews src/ and prints the Spanish summary", () => {
    const r = run([]);
    assert.equal(r.signal, null);
    assert.match(r.stdout + r.stderr, SUMMARY_RE, "sin argumentos debe revisar src/ e imprimir «N error(es), N aviso(s)»");
  });

  test("[EP00-TBR-014-CA4] --test exits with 0, prints «N pruebas correctas» and does not review src/", () => {
    const r = run(["--test"]);
    assert.equal(r.signal, null);
    assert.equal(r.status, 0, `--test debe salir con 0; stdout: ${r.stdout} stderr: ${r.stderr}`);
    const m = /\b(\d+) pruebas correctas\b/.exec(r.stdout);
    assert.ok(m && Number(m[1]) > 0, `--test debe imprimir «N pruebas correctas»; stdout: ${r.stdout}`);
    assert.doesNotMatch(r.stdout + r.stderr, SUMMARY_RE, "--test no revisa src/");
  });
});

describe("validate-ui public API", () => {
  test("[EP00-TBR-014-CA4][EP00-TBR-014-CA5] importing the module does not run the script", () => {
    const url = pathToFileURL(SCRIPT).href;
    const code = `const m = await import(${JSON.stringify(url)}); process.stdout.write(JSON.stringify(Object.keys(m).sort()));`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: FRONT, encoding: "utf8", timeout: CHILD_TIMEOUT_MS });
    assert.equal(r.status, 0, `importar no debe fallar; stderr: ${r.stderr}`);
    assert.equal(r.stderr, "", "importar no debe escribir en stderr");
    const keys = JSON.parse(r.stdout);
    assert.ok(keys.includes("review"), `debe exportar review; exporta: ${keys.join(", ")}`);
    assert.ok(!keys.includes("revisar"), "no debe exportar el nombre antiguo");
  });

  test("[EP00-TBR-014-CA4] exports review(text, ext) as a function", () => {
    assert.equal(typeof review, "function", "validate-ui.mjs debe exportar review(text, ext)");
    assert.deepEqual(review("", ".html"), [], "un texto vacío no tiene hallazgos");
  });

  test("[EP00-TBR-014-CA4] each finding is { level, id, line, sample, message }", () => {
    assert.equal(typeof review, "function");
    const text = `<section>\n\n${cls("p-px")}\n</section>`;
    const findings = review(text, ".html");
    assert.equal(findings.length, 1, JSON.stringify(findings));
    const [f] = findings;
    assert.deepEqual(Object.keys(f).sort(), ["id", "level", "line", "message", "sample"]);
    assert.equal(f.level, "error");
    assert.equal(f.id, "px");
    assert.equal(f.line, 3);
    assert.equal(f.sample, "p-px");
    assert.equal(typeof f.message, "string");
  });

  describe("[EP00-TBR-014-CA4] each DA-5 rule id is emitted with its level", () => {
    for (const [id, text, ext] of TRIGGERS) {
      test(`[EP00-TBR-014-CA4] ${id} (${RULE_LEVELS[id]})`, () => {
        assert.equal(typeof review, "function");
        const findings = review(text, ext);
        const hit = findings.find((f) => f.id === id);
        assert.ok(hit, `se esperaba ${id} para ${text}; se obtuvo ${JSON.stringify(findings)}`);
        assert.equal(hit.level, RULE_LEVELS[id]);
        assert.ok(text.includes(hit.sample), `sample debe salir del texto: ${hit.sample}`);
      });
    }
  });

  test("[EP00-TBR-014-CA4] the set of ids review can emit is exactly DA-5", () => {
    assert.equal(typeof review, "function");
    const emitted = new Set();
    for (const [, text, ext] of TRIGGERS) for (const f of review(text, ext)) emitted.add(f.id);
    for (const [text, ext] of EXTRA_INPUTS) for (const f of review(text, ext)) emitted.add(f.id);
    assert.deepEqual([...emitted].sort(), RULE_IDS);
  });

  test("[EP00-TBR-014-CA4] levels are lowercase error/warning and messages stay in Spanish", () => {
    assert.equal(typeof review, "function");
    const all = [...TRIGGERS.map(([, t, e]) => [t, e]), ...EXTRA_INPUTS].flatMap(([t, e]) => review(t, e));
    assert.ok(all.length > 0);
    for (const f of all) {
      assert.ok(f.level === "error" || f.level === "warning", `level inválido: ${f.level}`);
      assert.equal(f.level, RULE_LEVELS[f.id], `level de ${f.id}`);
      assert.ok(isSpanishMessage(f.message), `el mensaje de ${f.id} sigue en español: ${f.message}`);
    }
  });

  test("[EP00-TBR-014-CA4] printed labels stay in Spanish («ERROR», «AVISO»)", () => {
    const { strings } = lex(readFileSync(SCRIPT, "utf8"));
    const literals = new Set(strings.map((s) => s.text));
    assert.ok(literals.has("ERROR"), "validate-ui.mjs debe imprimir la etiqueta «ERROR»");
    assert.ok(literals.has("AVISO"), "validate-ui.mjs debe imprimir la etiqueta «AVISO»");
  });
});

describe("ds:validate wiring (DA-1 option a)", () => {
  const pkg = JSON.parse(readFileSync(join(FRONT, "package.json"), "utf8"));

  test("[EP00-TBR-014-CA4] ds:validate runs --test, this node:test suite and then the review", () => {
    const steps = (pkg.scripts["ds:validate"] ?? "").split("&&").map((s) => s.trim().replace(/\s+/g, " "));
    assert.deepEqual(steps, [
      "node scripts/validate-ui.mjs --test",
      "node --test scripts/validate-ui.test.mjs",
      "node scripts/validate-ui.mjs",
    ]);
  });

  test("[EP00-TBR-014-CA4] ds:check still chains ds:validate and no npm script uses the legacy option", () => {
    assert.match(pkg.scripts["ds:check"] ?? "", /(?:^|&&)\s*npm run ds:validate\s*(?:&&|$)/);
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      assert.doesNotMatch(cmd, /--prueba\b/, `el script npm ${name} usa la opción antigua`);
    }
  });
});

describe("no Spanish code in scripts/ and .dependency-cruiser.cjs", () => {
  test("[EP00-TBR-014-CA4] the lexer and heuristics used by these tests behave (self-check)", () => {
    const sample = [
      "// Old style comment: lee la lista de los archivos",
      "const PESOS = \"thin\"; const msg = \"usa --prueba si quieres\";",
      "const re = /Esperando a|Asignado a/g; const x = `frontera-${m}`;",
      "const ok = \"--test\"; // reads tokens.json and prints the summary",
    ].join("\n");
    const { code, comments, strings } = lex(sample);
    assert.ok(code.includes("PESOS") && !code.includes("Esperando") && !code.includes("lee la"));
    assert.deepEqual(comments.map((c) => looksSpanish(c.text)), [true, false]);
    assert.ok(strings.some((s) => s.text === "frontera-"));
    assert.ok(LEGACY_RES.find(([t]) => t === "frontera-")[1].test("frontera-"));
    assert.ok(!LEGACY_RES.find(([t]) => t === "persona")[1].test("personal"));
    assert.deepEqual(identifierParts("quitarComentarios"), ["quitar", "comentarios"]);
    assert.deepEqual(identifierParts("REGLAS_AVISO"), ["reglas", "aviso"]);
    assert.ok(looksSpanish("rechaza el nombre antiguo del módulo") && !looksSpanish("rejects the legacy module name"));
  });

  test("[EP00-TBR-014-CA4] no legacy Spanish identifiers, ids, options or comments", () => {
    const findings = sourceFiles().flatMap(legacyCodeFindings);
    assert.deepEqual(findings, [], `quedan términos en español en el código:\n${findings.join("\n")}`);
  });

  test("[EP00-TBR-014-CA4] test titles in scripts/ are in English", () => {
    const spanish = sourceFiles()
      .filter((f) => f.endsWith(".test.mjs"))
      .flatMap((f) => testTitles(f).filter((t) => looksSpanish(t.title)).map((t) => `${basename(f)}:${t.line} ${t.title}`));
    assert.deepEqual(spanish, [], `títulos de prueba en español:\n${spanish.join("\n")}`);
  });

  test("[EP00-TBR-014-CA4] dependency-cruiser rule names and comments are in English", () => {
    const config = createRequire(import.meta.url)(CONFIG);
    const rules = [...(config.forbidden ?? []), ...(config.allowed ?? [])];
    assert.ok(rules.length > 0);
    const bad = [];
    for (const r of rules) {
      const name = r.name ?? "";
      if (identifierParts(name).some((p) => SPANISH_WORDS.has(p)) || LEGACY_RES.some(([, re]) => re.test(name))) bad.push(`name ${name}`);
      if (r.comment && looksSpanish(r.comment)) bad.push(`comment of ${name}: ${r.comment}`);
    }
    assert.deepEqual(bad, [], `reglas con nombre o comentario en español:\n${bad.join("\n")}`);
  });

  test("[EP00-TBR-014-CA4] file names in scripts/ are in English", () => {
    const bad = readdirSync(SCRIPTS, { recursive: true })
      .map(String)
      .filter((f) => identifierParts(basename(f).replace(/\..*$/, "")).some((p) => SPANISH_WORDS.has(p)));
    assert.deepEqual(bad, []);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// EP00-TBR-004 · design system pieces and formats (docs/diseno/EP00-TBR-004.md §1.4, §2.1, §3, §4 and §6).
// ---------------------------------------------------------------------------------------------------------------
const UI = join(FRONT, "src", "ui");
const COMPONENTS = join(UI, "components");
const FORMAT = join(UI, "format");
// The 9 piece folders of the design (§1.1): icon/ is internal, the other 8 are the pieces of the story.
const PIECES = ["icon", "button", "status-badge", "banner", "skeleton", "empty-state", "filter-select", "tabs", "data-table"];
const TOKEN_NAMES = new Set(Object.keys(JSON.parse(readFileSync(join(UI, "tokens", "tokens.flat.json"), "utf8"))));
const isReviewed = validateUi.isReviewed;
const toPosix = (p) => relative(FRONT, p).split("\\").join("/");

// Source files of a folder (recursive): .ts, .html and .css, without *.spec.ts. Empty when the folder is missing.
function sourcesOf(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => /\.(?:ts|html|css)$/.test(f) && !f.endsWith(".spec.ts"))
    .map((f) => join(dir, f));
}
const pieceSources = (piece) => sourcesOf(join(COMPONENTS, piece));
const readAll = (files) => files.map((f) => readFileSync(f, "utf8")).join("\n");

// Custom properties a piece declares itself (for example --cols, passed by style; design §3.4).
function declaredVariables(text) {
  const names = new Set();
  for (const re of [/(--[\w-]+)\s*:/g, /style\.(--[\w-]+)/g, /setProperty\(\s*["'`](--[\w-]+)/g]) {
    for (const m of text.matchAll(re)) names.add(m[1]);
  }
  return names;
}
// Every var(--x) and every Tailwind -(--x) that is neither a token of tokens.flat.json nor declared by the piece.
function unknownVariables(text, declared = declaredVariables(text)) {
  const unknown = new Set();
  for (const m of text.matchAll(/var\(\s*(--[\w-]+)|(?<=\w)-\((--[\w-]+)\)/g)) {
    const name = m[1] ?? m[2];
    if (!TOKEN_NAMES.has(name) && !declared.has(name)) unknown.add(name);
  }
  return [...unknown].sort();
}

// Class names written in templates and host metadata (static class lists, [class.x] bindings and host class).
function templateClasses(text) {
  const found = new Set();
  const add = (list) => {
    for (const c of list.replace(/\{\{[\s\S]*?\}\}/g, " ").split(/\s+/)) if (/^[!-]?[a-z][\w:/.%()-]*$/i.test(c)) found.add(c);
  };
  for (const m of text.matchAll(/(?<![\w.[-])class\s*=\s*"([^"]*)"/g)) add(m[1]);
  for (const m of text.matchAll(/(?<![\w.[-])class\s*=\s*'([^']*)'/g)) add(m[1]);
  for (const m of text.matchAll(/\bclass\s*:\s*["'`]([^"'`]*)["'`]/g)) add(m[1]);
  for (const m of text.matchAll(/\[class\.([^\]=\s]+)\]/g)) add(m[1]);
  return found;
}
// Class selectors defined by the piece's own styles (.css files and styles: in the component metadata).
function ownSelectors(files) {
  const css = files
    .map((f) => {
      const text = readFileSync(f, "utf8");
      if (f.endsWith(".css")) return text;
      if (f.endsWith(".ts")) return [...text.matchAll(/styles\s*:\s*\[?\s*`([^`]*)`/g)].map((m) => m[1]).join("\n");
      return "";
    })
    .join("\n");
  return new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
}
// Marker classes that never produce CSS on their own.
const MARKER_CLASSES = /^(?:group|peer)(?:\/[\w-]+)?$/;

// Compiles a list of classes with the Tailwind CLI against theme.css (same mechanism as scripts/test-theme.mjs).
// [EP00-TBR-004-CA1] Each run uses its own temporary folder (two runs at a time do not collide) and removes it at the
// end; a hung child is killed (security review, low finding). The folder stays under node_modules/ so that
// @import "tailwindcss" resolves.
const TAILWIND_CACHE = join(FRONT, "node_modules", ".cache");
function compileWithTheme(classes) {
  mkdirSync(TAILWIND_CACHE, { recursive: true });
  const tmp = mkdtempSync(join(TAILWIND_CACHE, "tb-ui-classes-"));
  try {
    const input = join(tmp, "input.css");
    const output = join(tmp, "output.css");
    const theme = join(UI, "tokens", "theme.css").split("\\").join("/");
    writeFileSync(input, `@import "tailwindcss" source(none);\n@import "${theme}";\n@source inline("${[...classes].join(" ")}");\n`);
    const cli = join(FRONT, "node_modules", "@tailwindcss", "cli", "dist", "index.mjs");
    const r = spawnSync(process.execPath, [cli, "-i", input, "-o", output], {
      cwd: FRONT,
      encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    assert.equal(r.signal, null, `Tailwind no terminó (señal ${r.signal}, límite ${CHILD_TIMEOUT_MS / 1000} s)`);
    assert.equal(r.status, 0, `Tailwind no compiló: ${r.stderr || r.stdout}`);
    return readFileSync(output, "utf8");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
const cssEscapeClass = (c) => c.replace(/[^\w-]/g, (ch) => `\\${ch}`);
const compiles = (css, c) => new RegExp(`\\.${escapeRe(cssEscapeClass(c))}(?![\\w-])`).test(css);

describe("[EP00-TBR-004-CA1] validate-ui reviews the design system pieces (DA-2)", () => {
  const CASES = [
    ["src/ui/components/button/button.ts", true],
    ["src/ui/components/data-table/data-table.html", true],
    ["src/ui/format/format.ts", true],
    ["src/ui/index.ts", true],
    ["src/app/app.ts", true],
    ["src/ui/tokens/theme.css", false],
    ["src/ui/tokens/tokens.plain.css", false],
    ["src/ui/docs/components.css", false],
    ["src/ui/docs/the-brain-design-system.html", false],
    ["src/ui/components/button/button.spec.ts", false],
    ["src/ui/format/format.spec.ts", false],
    ["src/app/app.spec.ts", false],
  ];
  for (const [path, expected] of CASES) {
    test(`[EP00-TBR-004-CA1] isReviewed("${path}") is ${expected}`, () => {
      assert.equal(typeof isReviewed, "function", "validate-ui.mjs debe exportar isReviewed(relPath) (DA-2)");
      assert.equal(isReviewed(path), expected, `isReviewed("${path}") debería ser ${expected}`);
    });
  }

  test("[EP00-TBR-004-CA1] the full review of src/ uses isReviewed instead of skipping the whole of src/ui/", () => {
    const src = readFileSync(SCRIPT, "utf8");
    assert.doesNotMatch(src, /rel\s*===\s*["']src\/ui["']/, "validate-ui.mjs sigue saltando todo src/ui/");
    const uses = [...lex(src).code.matchAll(/\bisReviewed\s*\(/g)].length;
    assert.ok(uses >= 2, "isReviewed debe definirse y usarse al recorrer src/");
  });

  test("[EP00-TBR-004-CA1] the 9 piece folders exist and each one has at least one source .ts", () => {
    const missing = PIECES.filter((p) => !pieceSources(p).some((f) => f.endsWith(".ts")));
    assert.deepEqual(missing, [], `faltan piezas en src/ui/components/: ${missing.join(", ")}`);
    assert.ok(sourcesOf(FORMAT).some((f) => f.endsWith("format.ts")), "falta src/ui/format/format.ts");
  });
});

describe("[EP00-TBR-004-CA1] pieces and formats only use tokens", () => {
  test("[EP00-TBR-004-CA1] unknownVariables detects the short v6 aliases and accepts tokens and local variables (self-check)", () => {
    assert.deepEqual(unknownVariables(".x { color: var(--ink); padding: var(--space-3); }"), ["--ink", "--space-3"]);
    assert.deepEqual(unknownVariables('<div class="bg-(--surface)"></div>'), ["--surface"]);
    assert.deepEqual(unknownVariables(".x { color: var(--color-ink); height: var(--size-row); }"), []);
    assert.deepEqual(unknownVariables('<div class="bg-(--color-accent)"></div>'), []);
    assert.deepEqual(unknownVariables(".r { grid-template-columns: var(--cols); }\n<div [style.--cols]=\"cols()\"></div>"), []);
  });

  test("[EP00-TBR-004-CA1] every var(--x) and -(--x) in src/ui/components/ and src/ui/format/ exists in tokens.flat.json", () => {
    const files = [...sourcesOf(COMPONENTS), ...sourcesOf(FORMAT)];
    assert.ok(files.length > 0, "no hay fuentes en src/ui/components/ ni en src/ui/format/");
    const bad = [];
    for (const piece of PIECES) {
      const own = pieceSources(piece);
      const declared = declaredVariables(readAll(own));
      for (const f of own) for (const name of unknownVariables(readFileSync(f, "utf8"), declared)) bad.push(`${toPosix(f)} ${name}`);
    }
    for (const f of sourcesOf(FORMAT)) for (const name of unknownVariables(readFileSync(f, "utf8"))) bad.push(`${toPosix(f)} ${name}`);
    assert.deepEqual(bad, [], `variables que no están en tokens.flat.json:\n${bad.join("\n")}`);
  });

  test("[EP00-TBR-004-CA1] utility classes of the piece templates compile against theme.css (bg-white does not)", () => {
    const candidates = new Map();
    for (const piece of PIECES) {
      const own = pieceSources(piece);
      const selectors = ownSelectors(own);
      for (const f of own) {
        for (const c of templateClasses(readFileSync(f, "utf8"))) {
          const bare = c.replace(/^!/, "");
          if (bare.startsWith("tb-") || selectors.has(bare) || MARKER_CLASSES.test(bare)) continue;
          candidates.set(bare, toPosix(f));
        }
      }
    }
    // Synthetic controls: token classes (one with a variant) that must compile and default palette classes that must not.
    const controls = ["bg-surface", "focus-visible:outline-focus", "bg-white", "text-gray-500"];
    const css = compileWithTheme(new Set([...candidates.keys(), ...controls]));
    assert.ok(compiles(css, "bg-surface") && compiles(css, "focus-visible:outline-focus"), "control: las clases de tokens deben compilar con theme.css");
    assert.ok(!compiles(css, "bg-white") && !compiles(css, "text-gray-500"), "control: la paleta por defecto no debe compilar");
    assert.ok(pieceSources("button").length > 0, "no hay fuentes de piezas que revisar");
    const bad = [...candidates].filter(([c]) => !compiles(css, c)).map(([c, f]) => `${f} ${c}`);
    assert.deepEqual(bad, [], `clases que no salen de tokens.json (no compilan con theme.css):\n${bad.join("\n")}`);
  });

  test("[EP00-TBR-004-CA1] compileWithTheme leaves no temporary folder behind", () => {
    const list = () => (existsSync(TAILWIND_CACHE) ? readdirSync(TAILWIND_CACHE).filter((n) => n.startsWith("tb-ui-classes")) : []);
    const before = new Set(list());
    const css = compileWithTheme(new Set(["bg-surface"]));
    assert.ok(compiles(css, "bg-surface"), "control: bg-surface debe compilar");
    const left = list().filter((n) => !before.has(n));
    assert.deepEqual(left, [], `quedaron carpetas temporales: ${left.join(", ")}`);
  });

  test("[EP00-TBR-004-CA1] templateClasses reads class lists, [class.x] and host class (self-check)", () => {
    const sample = `@Component({ host: { class: 'tb-btn inline-flex' }, template: \`<b class="bg-white {{ x }}" [class.text-ink]="on"></b>\` })`;
    assert.deepEqual([...templateClasses(sample)].sort(), ["bg-white", "inline-flex", "tb-btn", "text-ink"]);
  });

  test("[EP00-TBR-004-CA1] no piece uses the Angular locale pipes (formats come from src/ui/format/, §2.2)", () => {
    const bad = [];
    for (const f of sourcesOf(COMPONENTS)) {
      const text = readFileSync(f, "utf8");
      if (/\b(?:CurrencyPipe|DecimalPipe|PercentPipe|DatePipe)\b/.test(text) || /\|\s*(?:currency|number|percent|date)\b/.test(text)) bad.push(toPosix(f));
    }
    assert.ok(sourcesOf(COMPONENTS).length > 0, "no hay fuentes en src/ui/components/");
    assert.deepEqual(bad, [], `usa pipes de formato de Angular:\n${bad.join("\n")}`);
  });
});

// [EP00-TBR-004-CA1] H6: the percent-spacing rule reads text for people (templates), not the CSS literals of a
// component's styles: (color-mix, gradients, transforms). The 20 warnings of T4 were all of this kind (D-051 note).
describe("[EP00-TBR-004-CA1] percent-spacing ignores the CSS of styles: and still reviews template text (H6)", () => {
  const percentFindings = (text, ext = ".ts") => review(text, ext).filter((f) => f.id === "percent-spacing");
  const component = ({ template, styles }) =>
    [
      "import { Component } from '@angular/core';",
      "@Component({",
      "  selector: 'tb-sample',",
      `  template: \`${template}\`,`,
      `  styles: ${styles},`,
      "})",
      "export class TbSample {}",
    ].join("\n");
  const CSS = [
    ".tb-sample { border-color: color-mix(in srgb, var(--color-accent) 30%, transparent); }",
    ".tb-sample .ico { transform: rotate(25%); }",
    ".tb-sample .bar { background: linear-gradient(90deg, var(--color-surface-hover) 25%, var(--color-surface-selected) 50%); width: 38%; }",
  ].join("\n    ");

  test("[EP00-TBR-004-CA1] a % without a space inside styles: `...` gives no warning", () => {
    assert.equal(typeof review, "function");
    const findings = percentFindings(component({ template: '<p class="tb-sample">Avance</p>', styles: `\`\n    ${CSS}\n  \`` }));
    assert.deepEqual(findings, [], `el CSS de styles: no es texto para personas: ${JSON.stringify(findings)}`);
  });

  test("[EP00-TBR-004-CA1] a % without a space inside styles: [`...`] (array form) gives no warning", () => {
    assert.equal(typeof review, "function");
    const findings = percentFindings(component({ template: '<p class="tb-sample">Avance</p>', styles: `[\`\n    ${CSS}\n  \`]` }));
    assert.deepEqual(findings, [], `el CSS de styles: no es texto para personas: ${JSON.stringify(findings)}`);
  });

  test("[EP00-TBR-004-CA1] «24.5%» in the template text still gives the warning, once, on the template line", () => {
    assert.equal(typeof review, "function");
    const text = component({ template: '<p class="tb-sample">Avance 24.5%</p>', styles: `\`\n    ${CSS}\n  \`` });
    const findings = percentFindings(text);
    assert.equal(findings.length, 1, `se esperaba un aviso, el del texto: ${JSON.stringify(findings)}`);
    assert.equal(findings[0].level, "warning");
    assert.equal(findings[0].line, text.split("\n").findIndex((l) => l.includes("Avance 24.5%")) + 1);
    assert.match(findings[0].sample, /5%/);
  });

  // Negative control (security review, low): skipping styles: only hides warnings, never errors. A hard-coded #hex,
  // an rgb() and an arbitrary w-[13px] inside styles: (string or array) are still errors, each on its own line.
  const BAD_CSS = [
    ".tb-sample { color: #ff0000; }",
    ".tb-sample .ico { background: rgb(0 0 0); }",
    ".tb-sample .bar { @apply w-[13px]; }",
  ];
  const STYLE_FORMS = [
    ["a string", `\`\n    ${BAD_CSS.join("\n    ")}\n  \``],
    ["an array", `[\`\n    ${BAD_CSS.join("\n    ")}\n  \`]`],
    ["an array of quoted strings", `[\n    '${BAD_CSS[0]}',\n    "${BAD_CSS[1]}",\n    '${BAD_CSS[2]}',\n  ]`],
  ];
  for (const [form, styles] of STYLE_FORMS) {
    test(`[EP00-TBR-004-CA1] #hex, rgb() and w-[13px] inside styles: as ${form} are still errors (negative control)`, () => {
      assert.equal(typeof review, "function");
      const text = component({ template: '<p class="tb-sample">Avance</p>', styles });
      const lines = text.split("\n");
      const lineWith = (s) => lines.findIndex((l) => l.includes(s)) + 1;
      const errors = review(text, ".ts").filter((f) => f.level === "error");
      const got = errors.map((f) => `${f.id}@${f.line}`).sort();
      const expected = [
        `hardcoded-color@${lineWith("#ff0000")}`,
        `hardcoded-color@${lineWith("rgb(0 0 0)")}`,
        `arbitrary-value@${lineWith("w-[13px]")}`,
      ].sort();
      assert.deepEqual(got, expected, `los errores dentro de styles: deben seguir saliendo: ${JSON.stringify(errors)}`);
    });
  }

  test("[EP00-TBR-004-CA1] the full review of src/ has no percent warning coming from the pieces' styles:", () => {
    const r = run([]);
    assert.equal(r.signal, null);
    const lines = (r.stdout + r.stderr).split("\n").filter((l) => /porcentaje sin espacio/.test(l) && /src[\\/]ui[\\/]/.test(l));
    assert.deepEqual(lines, [], `avisos de porcentaje en src/ui/ (CSS de styles:):\n${lines.join("\n")}`);
  });
});

describe("[EP00-TBR-004-CA2] format.ts does not depend on the machine time zone (static)", () => {
  const file = join(FORMAT, "format.ts");
  test("[EP00-TBR-004-CA2] no local date getters and no toLocale*String() without options", () => {
    assert.ok(existsSync(file), "falta src/ui/format/format.ts");
    const { code } = lex(readFileSync(file, "utf8"));
    assert.doesNotMatch(code, /\.get(?:Date|Day|FullYear|Month|Hours|Minutes|Seconds|Year)\s*\(/, "format.ts usa getters locales de Date");
    assert.doesNotMatch(code, /\.toLocale(?:Date|Time)?String\s*\(\s*\)/, "format.ts usa toLocale*String() sin opciones");
  });
  test("[EP00-TBR-004-CA2] the zone, the locale and the fixed month table are explicit", () => {
    assert.ok(existsSync(file), "falta src/ui/format/format.ts");
    const src = readFileSync(file, "utf8");
    assert.match(src, /America\/Mexico_City/);
    assert.match(src, /es-MX/);
    for (const m of ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]) {
      assert.match(src, new RegExp(`["'\`]${m}["'\`]`), `falta el mes «${m}» en la tabla fija`);
    }
    assert.doesNotMatch(src, /["'`]sept["'`]/, "la tabla de meses no usa «sept» (AJ-5)");
  });
});

describe("[EP00-TBR-004-CA3] focus, motion and ellipsis rules of the pieces (static, jsdom cannot evaluate them)", () => {
  const FOCUS_SCOPE = /focus-visible|focus-within/;
  const FOCUS_COLOR = /outline-focus|ring-focus|var\(\s*--color-focus\s*\)/;
  const FOCUS_OFFSET = /outline-offset-2|outline-offset\s*:\s*2px|ring-offset-2/;
  const OWN_RING = ["button", "filter-select", "tabs", "data-table"];
  for (const piece of OWN_RING) {
    test(`[EP00-TBR-004-CA3] ${piece} draws the 2 px focus ring with the focus token`, () => {
      const text = readAll(pieceSources(piece));
      assert.notEqual(text, "", `faltan las fuentes de ${piece}`);
      assert.match(text, FOCUS_SCOPE, `${piece} no declara un estilo de foco visible`);
      assert.match(text, FOCUS_COLOR, `${piece} no usa el token focus para el anillo`);
      assert.match(text, FOCUS_OFFSET, `${piece} no separa el anillo 2 px`);
    });
  }
  for (const piece of ["banner", "empty-state"]) {
    test(`[EP00-TBR-004-CA3] ${piece} actions get the focus ring (own rule or TbButton)`, () => {
      const text = readAll(pieceSources(piece));
      assert.notEqual(text, "", `faltan las fuentes de ${piece}`);
      const delegated = /\btb-button\b/.test(text);
      const own = FOCUS_SCOPE.test(text) && FOCUS_COLOR.test(text);
      assert.ok(delegated || own, `${piece}: sus botones no llevan el anillo de foco`);
    });
  }
  test("[EP00-TBR-004-CA3] skeleton stops its shimmer with reduced motion", () => {
    const text = readAll(pieceSources("skeleton"));
    assert.notEqual(text, "", "faltan las fuentes de skeleton");
    assert.match(text, /motion-reduce:animate-none|prefers-reduced-motion\s*:\s*reduce/, "Skeleton no respeta «reducir movimiento»");
  });
  for (const piece of ["data-table", "filter-select"]) {
    test(`[EP00-TBR-004-CA3] ${piece} cuts long text with an ellipsis`, () => {
      const text = readAll(pieceSources(piece));
      assert.notEqual(text, "", `faltan las fuentes de ${piece}`);
      assert.match(text, /text-overflow\s*:\s*ellipsis|\btruncate\b|\btext-ellipsis\b/, `${piece} no corta con elipsis`);
    });
  }
});

describe("[EP00-TBR-004-CA3] contrast pairs used by the pieces are checked by build-tokens (AJ-4, D-038)", () => {
  // Text/background pairs of the design §4, by piece. Color names without the color- prefix, like tokens.json.
  const INVENTORY = {
    banner: [
      ["ink", "accent-soft"], ["ink", "corr-soft"], ["ink", "bad-soft"], ["ink", "ok-soft"],
      ["ink-2", "accent-soft"], ["ink-2", "corr-soft"], ["ink-2", "bad-soft"], ["ink-2", "ok-soft"],
    ],
    "status-badge": [["surface", "bad"], ["ink-2", "surface-selected"], ["on-accent", "accent"], ["ink-2", "surface"]],
    "data-table": [["ink-2", "surface-hover"], ["ink-2", "surface-selected"], ["ink-muted", "surface-hover"], ["ink-muted", "surface-selected"]],
    "focus ring": [["focus", "bg"], ["focus", "surface"], ["focus", "surface-hover"]],
  };
  const tokens = JSON.parse(readFileSync(join(UI, "tokens", "tokens.json"), "utf8"));
  const listed = new Set((tokens.contrast?.pairs ?? []).map(([fg, bg]) => `${fg}|${bg}`));
  for (const [piece, pairs] of Object.entries(INVENTORY)) {
    test(`[EP00-TBR-004-CA3] ${piece}: its pairs are in tokens.json contrast.pairs`, () => {
      for (const [fg, bg] of pairs) assert.ok(TOKEN_NAMES.has(`--color-${fg}`) && TOKEN_NAMES.has(`--color-${bg}`), `${fg} o ${bg} no es un color de tokens.json`);
      const missing = pairs.filter(([fg, bg]) => !listed.has(`${fg}|${bg}`)).map(([fg, bg]) => `${fg} sobre ${bg}`);
      assert.deepEqual(missing, [], `pares sin comprobar en contrast.pairs: ${missing.join(", ")}`);
    });
  }
});
