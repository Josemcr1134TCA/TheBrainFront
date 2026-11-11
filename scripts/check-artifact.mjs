// Reviews the build artifact (dist/the-brain-front/) against the list of forbidden patterns (EP00-TBR-002, CA3).
// Usage: node scripts/check-artifact.mjs [--dir <path>]
// The list is fixed at scripts/forbidden-artifact-patterns.json: there is no option to swap it.
// Fails closed: a missing artifact, a bad list, symlinks and unreadable files all fail the review.
// Findings never carry a secret in full: only the rule id, the path, the line and at most 6 characters plus «…».
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIST_PATH = join(root, "scripts", "forbidden-artifact-patterns.json");
const DEFAULT_DIR = join(root, "dist", "the-brain-front");
const NAME_KINDS = new Set(["file", "dir"]);
const CONTENT_KINDS = new Set(["regex", "jwt-role"]);
const SAMPLE_LENGTH = 6;
const JWT_RE = /eyJ[\w-]*\.(eyJ[\w-]*)\.[\w-]+/g;
const PURE_WILDCARD_RE = /^\*+(?:\/\*+)*$/;

const USAGE = "Uso: node scripts/check-artifact.mjs [--dir <ruta>]";

// Glob to RegExp. "*" never crosses "/", "**" does. Matching is case sensitive unless `ignoreCase` is set.
function globToRegExp(glob, ignoreCase = false) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        source += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        source += "[^/]*";
      }
    } else {
      source += ch.replace(/[.+?^${}()|[\]\\/]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`, ignoreCase ? "iu" : "u");
}

export function loadPatternList(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`No se pudo leer la lista de patrones prohibidos en ${path}: ${error.code ?? error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`La lista de patrones prohibidos no es un JSON válido (${path}): ${error.message}`);
  }
}

// Returns the list of errors (Spanish messages); an empty list means the list is valid.
export function validatePatternList(list) {
  const errors = [];
  if (!list || typeof list !== "object" || Array.isArray(list)) return ["La lista debe ser un objeto con names, contents y exceptions"];
  const names = Array.isArray(list.names) ? list.names : [];
  const contents = Array.isArray(list.contents) ? list.contents : [];
  if (!names.length) errors.push("«names» no puede faltar ni estar vacío");
  if (!contents.length) errors.push("«contents» no puede faltar ni estar vacío");
  if (list.exceptions !== undefined && !Array.isArray(list.exceptions)) errors.push("«exceptions» debe ser un arreglo");

  const seen = new Set();
  const contentIds = new Set();
  const common = (rule, group, index) => {
    const label = `${group}[${index}]${rule && typeof rule.id === "string" ? ` (${rule.id})` : ""}`;
    if (!rule || typeof rule !== "object") {
      errors.push(`${label}: la regla debe ser un objeto`);
      return null;
    }
    if (typeof rule.id !== "string" || !rule.id.trim()) errors.push(`${label}: falta el id`);
    else if (seen.has(rule.id)) errors.push(`${label}: id repetido «${rule.id}»`);
    else seen.add(rule.id);
    if (typeof rule.reason !== "string" || !rule.reason.trim()) errors.push(`${label}: falta el motivo (reason)`);
    return label;
  };

  names.forEach((rule, index) => {
    const label = common(rule, "names", index);
    if (!label) return;
    if (!NAME_KINDS.has(rule.kind)) errors.push(`${label}: kind desconocido «${rule.kind}» (use file o dir)`);
    if (typeof rule.name !== "string" || !rule.name.trim()) errors.push(`${label}: falta el nombre (name)`);
  });

  contents.forEach((rule, index) => {
    const label = common(rule, "contents", index);
    if (!label) return;
    if (typeof rule.id === "string") contentIds.add(rule.id);
    if (!CONTENT_KINDS.has(rule.kind)) {
      errors.push(`${label}: kind desconocido «${rule.kind}» (use regex o jwt-role)`);
    } else if (rule.kind === "regex") {
      if (typeof rule.pattern !== "string" || !rule.pattern) errors.push(`${label}: falta el patrón (pattern)`);
      else {
        try {
          new RegExp(rule.pattern, "u");
        } catch (error) {
          errors.push(`${label}: la expresión regular no compila: ${error.message}`);
        }
      }
    } else if (typeof rule.role !== "string" || !rule.role) {
      errors.push(`${label}: falta el rol (role)`);
    }
  });

  (Array.isArray(list.exceptions) ? list.exceptions : []).forEach((exception, index) => {
    const label = `exceptions[${index}]`;
    if (!exception || typeof exception !== "object") {
      errors.push(`${label}: la excepción debe ser un objeto`);
      return;
    }
    if (!contentIds.has(exception.rule)) errors.push(`${label}: la regla «${exception.rule}» no es una regla de contenido existente`);
    if (typeof exception.path !== "string" || !exception.path.trim()) errors.push(`${label}: falta la ruta (path)`);
    else if (PURE_WILDCARD_RE.test(exception.path.trim())) errors.push(`${label}: la ruta «${exception.path}» es un comodín puro`);
    if (typeof exception.reason !== "string" || !exception.reason.trim()) errors.push(`${label}: falta el motivo (reason)`);
    if (typeof exception.decision !== "string" || !exception.decision.trim()) errors.push(`${label}: falta la decisión (decision)`);
  });

  return errors;
}

const mask = (text) => `${text.slice(0, SAMPLE_LENGTH)}… (valor oculto)`;

function decodeRole(payload) {
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))?.role;
  } catch {
    return undefined;
  }
}

// Content matches of one rule: [{ index, text }] where text is the matched string (never printed in full).
function contentMatches(rule, text) {
  const matches = [];
  if (rule.kind === "regex") {
    for (const m of text.matchAll(new RegExp(rule.pattern, "gu"))) matches.push({ index: m.index, text: m[0] });
  } else {
    for (const m of text.matchAll(JWT_RE)) {
      if (decodeRole(m[1]) === rule.role) matches.push({ index: m.index, text: m[0] });
    }
  }
  return matches;
}

function scanDetailed(dir, list) {
  const findings = [];
  let files = 0;
  const nameRules = list.names.map((rule) => ({ rule, re: globToRegExp(rule.name, true) }));
  const exceptions = (list.exceptions ?? []).map((e) => ({ rule: e.rule, re: globToRegExp(e.path) }));

  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      findings.push({ rule: "unreadable", path: relative(dir, current) || ".", line: 0, sample: "no se pudo leer la carpeta" });
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = join(current, entry.name);
      const path = relative(dir, abs).split("\\").join("/");
      if (entry.isSymbolicLink() || lstatSync(abs).isSymbolicLink()) {
        findings.push({ rule: "symlink", path, line: 0, sample: "enlace simbólico; no se sigue" });
        continue;
      }
      const isDir = entry.isDirectory();
      for (const { rule, re } of nameRules) {
        if (rule.kind === (isDir ? "dir" : "file") && re.test(entry.name)) {
          findings.push({ rule: rule.id, path, line: 0, sample: `${rule.reason}; el artefacto debe servir en cualquier hosting` });
        }
      }
      if (isDir) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      files++;
      let text;
      try {
        text = readFileSync(abs).toString("latin1");
      } catch {
        findings.push({ rule: "unreadable", path, line: 0, sample: "no se pudo leer el archivo" });
        continue;
      }
      for (const rule of list.contents) {
        if (exceptions.some((e) => e.rule === rule.id && e.re.test(path))) continue;
        const reported = new Set();
        for (const match of contentMatches(rule, text)) {
          const line = text.slice(0, match.index).split("\n").length;
          if (reported.has(line)) continue;
          reported.add(line);
          findings.push({ rule: rule.id, path, line, sample: mask(match.text) });
        }
      }
    }
  };

  walk(dir);
  return { findings, files };
}

// Returns the findings: [{ rule, path, line, sample }]. `path` is relative to `dir`, with "/" separators.
export function scanArtifact(dir, list) {
  return scanDetailed(dir, list).findings;
}

function parseArgs(argv) {
  let dir = DEFAULT_DIR;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--dir") return { error: `Argumento no reconocido: ${argv[i]}` };
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) return { error: "--dir necesita una ruta" };
    dir = resolve(value);
    i++;
  }
  return { dir };
}

function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.error) {
    console.error(`${parsed.error}\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const { dir } = parsed;
  const rel = relative(root, dir);
  const shown = rel && !rel.startsWith("..") ? rel : dir;

  let list;
  try {
    list = loadPatternList(LIST_PATH);
    const errors = validatePatternList(list);
    if (errors.length) throw new Error(`La lista de patrones prohibidos no es válida:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (!existsSync(join(dir, "browser", "index.html"))) {
    console.error(`No existe el artefacto en ${shown}; corre npm run build`);
    process.exitCode = 1;
    return;
  }

  const { findings, files } = scanDetailed(dir, list);
  for (const f of findings) {
    console.error(`ERROR  ${f.path}${f.line ? `:${f.line}` : ""}  · ${f.rule} · ${f.sample}`);
  }
  if (findings.length) {
    console.error(`check-artifact: ${findings.length} hallazgo(s) en ${files} archivo(s) de ${shown}`);
    process.exitCode = 1;
    return;
  }
  console.log(`check-artifact: 0 hallazgos en ${files} archivo(s) de ${shown}; listo para subir`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
