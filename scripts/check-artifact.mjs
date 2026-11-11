// Reviews the build artifact (dist/the-brain-front/) against the list of forbidden patterns (EP00-TBR-002, CA3).
// Usage: node scripts/check-artifact.mjs [--dir <path>]
// The list is fixed at scripts/forbidden-artifact-patterns.json: there is no option to swap it.
// Fails closed: a missing artifact, a bad list, symlinks and unreadable files all fail the review.
// Findings never carry a secret in full: only the rule id, the path, the line and at most 6 characters plus «…».
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIST_PATH = join(root, "scripts", "forbidden-artifact-patterns.json");
const DEFAULT_DIR = join(root, "dist", "the-brain-front");
const NAME_KINDS = new Set(["file", "dir"]);
const CONTENT_KINDS = new Set(["regex", "jwt-role"]);
const SAMPLE_LENGTH = 6;
// JWT search in linear time: split every run of token characters at the dots instead of backtracking a regex.
const TOKEN_RUN_RE = /[\w.-]+/g;
const PURE_WILDCARD_RE = /^\*+(?:\/\*+)*$/;

const USAGE = "Uso: node scripts/check-artifact.mjs [--dir <ruta>]";

// Glob to RegExp. "*" never crosses "/". "**" is a globstar only as a whole segment: "**/" is zero or more whole
// folders and a final "**" is anything below; glued to a name it behaves like "*". Case sensitive unless `ignoreCase`.
function globToRegExp(glob, ignoreCase = false) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        let end = i + 1;
        while (glob[end + 1] === "*") end++;
        const atStart = i === 0 || glob[i - 1] === "/";
        const next = glob[end + 1];
        if (atStart && next === "/") {
          source += "(?:[^/]+/)*";
          i = end + 1;
        } else if (atStart && next === undefined) {
          source += ".*";
          i = end;
        } else {
          source += "[^/]*";
          i = end;
        }
      } else {
        source += "[^/]*";
      }
    } else {
      source += ch.replace(/[.+?^${}()|[\]\\/]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`, ignoreCase ? "iu" : "u");
}

// An exception must name files: the last segment of its path may not hold "**" and its name (before the first ".",
// not counting a leading ".") needs at least 3 alphanumeric characters in a row.
function exceptionPathTooBroad(path) {
  const last = path.split("/").pop();
  if (last.includes("**")) return true;
  const stem = (last.startsWith(".") ? last.slice(1) : last).split(".")[0];
  return !/[A-Za-z0-9]{3}/.test(stem);
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
    else if (exception.path !== exception.path.trim()) errors.push(`${label}: la ruta «${exception.path}» no puede llevar espacios al inicio ni al final`);
    else if (exception.path.startsWith("/") || exception.path.startsWith("./")) errors.push(`${label}: la ruta «${exception.path}» debe ser relativa al artefacto, sin «/» ni «./» al inicio`);
    else if (exception.path.includes("\\")) errors.push(`${label}: la ruta «${exception.path}» lleva «\\»; separe los tramos con «/»`);
    else if (exception.path.startsWith("dist/")) errors.push(`${label}: la ruta «${exception.path}» empieza por «dist/»; debe ser relativa a dist/the-brain-front/ (por ejemplo «browser/main-*.js»)`);
    else if (exception.path.split("/").includes("")) errors.push(`${label}: la ruta «${exception.path}» tiene un tramo vacío («//» o «/» al final); quite la barra sobrante`);
    else if (exception.path.split("/").some((part) => part === "." || part === "..")) errors.push(`${label}: la ruta «${exception.path}» tiene un tramo «.» o «..»; escriba la ruta directa desde el artefacto`);
    else if (PURE_WILDCARD_RE.test(exception.path)) errors.push(`${label}: la ruta «${exception.path}» es un comodín puro`);
    else if (exceptionPathTooBroad(exception.path)) errors.push(`${label}: la ruta «${exception.path}» exime demasiado; el último tramo debe nombrar archivos (sin «**» y con al menos 3 letras o dígitos seguidos antes del primer punto)`);
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

// Error type shown to people: only a plain error name, never the message or the trace.
const errorType = (error) => {
  const name = error?.name;
  return typeof name === "string" && /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
};

// Content matches of one rule, yielded as they are found: { index, text } where text is the matched string (never
// printed in full). A generator, so the matches found before an error are not lost.
function* contentMatches(rule, text) {
  if (rule.kind === "regex") {
    for (const m of text.matchAll(new RegExp(rule.pattern, "gu"))) yield { index: m.index, text: m[0] };
  } else {
    for (const run of text.matchAll(TOKEN_RUN_RE)) {
      const parts = run[0].split(".");
      let offset = 0;
      const starts = parts.map((part) => {
        const at = offset;
        offset += part.length + 1;
        return at;
      });
      // Smallest base64url payload that can hold {"role":"<role>"}; shorter parts are never decoded.
      const minLength = Math.ceil(((rule.role.length + 10) * 4) / 3) - 1;
      const roles = new Array(parts.length); // each part is decoded at most once
      const roleOf = (n) => {
        if (roles[n] === undefined) roles[n] = parts[n].length < minLength ? null : (decodeRole(parts[n]) ?? null);
        return roles[n];
      };
      for (let i = 0; i + 2 < parts.length; i++) {
        const k = parts[i].indexOf("eyJ");
        if (k < 0 || !parts[i + 1].startsWith("eyJ") || !parts[i + 2]) continue;
        if (roleOf(i + 1) !== rule.role) continue;
        const from = starts[i] + k;
        const to = starts[i + 2] + parts[i + 2].length;
        yield { index: run.index + from, text: run[0].slice(from, to) };
        i += 2;
      }
    }
  }
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
      let isLink;
      try {
        isLink = entry.isSymbolicLink() || lstatSync(abs).isSymbolicLink();
      } catch {
        findings.push({ rule: "unreadable", path, line: 0, sample: "no se pudo leer la entrada" });
        continue;
      }
      if (isLink) {
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
      if (!entry.isFile()) {
        findings.push({ rule: "unsupported-type", path, line: 0, sample: "tipo de archivo no admitido (FIFO, socket o dispositivo); no se lee" });
        continue;
      }
      files++;
      let text;
      try {
        text = readFileSync(abs).toString("latin1");
      } catch {
        findings.push({ rule: "unreadable", path, line: 0, sample: "no se pudo leer el archivo" });
        continue;
      }
      // Line numbers: positions of "\n" computed once per file, then a binary search per match.
      let newlines = null;
      const lineOf = (index) => {
        if (!newlines) {
          newlines = [];
          for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) newlines.push(at);
        }
        let lo = 0;
        let hi = newlines.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (newlines[mid] < index) lo = mid + 1;
          else hi = mid;
        }
        return lo + 1;
      };
      for (const rule of list.contents) {
        if (exceptions.some((e) => e.rule === rule.id && e.re.test(path))) continue;
        const reported = new Set();
        try {
          for (const match of contentMatches(rule, text)) {
            const line = lineOf(match.index);
            if (reported.has(line)) continue;
            reported.add(line);
            findings.push({ rule: rule.id, path, line, sample: mask(match.text) });
          }
        } catch (error) {
          // Fail closed: matches found before the error are kept; the other rules and files still run.
          findings.push({ rule: "scan-error", path, line: 0, sample: `no se pudo revisar con la regla «${rule.id}» (${errorType(error)}); el archivo no pasa la revisión` });
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

  let result;
  try {
    result = scanDetailed(dir, list);
  } catch (error) {
    console.error(`check-artifact: error inesperado al revisar ${shown} (${errorType(error)}); la revisión falla y no se sube nada`);
    process.exitCode = 1;
    return;
  }
  const { findings, files } = result;
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

// Entry guard on real paths, so a call through a symlink still runs the review (never fails open).
function isEntryPoint() {
  if (!process.argv[1]) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    return realpathSync(process.argv[1]) === realpathSync(self);
  } catch {
    return resolve(process.argv[1]) === self;
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2));
}
