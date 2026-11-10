// Front module generator (DEC-0012). Usage: node scripts/new-module.mjs <name> [--root <dir>]
// Creates src/app/<name>/ with index.ts and the pages, components, data and model folders.
// Valid names come from the `boundary-<module>` rules of .dependency-cruiser.cjs (exact match, no normalizing).
// Messages for people are in Spanish; code and comments in English (DEC-0013).
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FOLDERS = ["pages", "components", "data", "model"];
const USAGE = "Uso: node scripts/new-module.mjs <nombre> [--root <directorio>]";

const INDEX_TS =
  "import { Routes } from '@angular/router';\n" +
  "\n" +
  "// Public API of the module (DEC-0012): other modules import only through this file.\n" +
  "export const routes: Routes = [];\n";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function validNames() {
  let config;
  try {
    config = createRequire(import.meta.url)(join(REPO_ROOT, ".dependency-cruiser.cjs"));
  } catch (error) {
    fail(`No se pudo cargar .dependency-cruiser.cjs (${error.code ?? error.message}); no se modifica nada.`);
  }
  const rules = Array.isArray(config?.forbidden) ? config.forbidden : [];
  const found = rules.map((rule) => rule?.name).filter((n) => typeof n === "string" && n.startsWith("boundary-"));
  if (found.length === 0) {
    fail("No hay reglas boundary-<módulo> en .dependency-cruiser.cjs; no se modifica nada.");
  }
  return found.map((n) => n.slice("boundary-".length));
}

function parseArgs(argv) {
  const names = [];
  let root = REPO_ROOT;
  let rootSeen = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") {
      if (rootSeen) fail(`La opción --root se indicó más de una vez.\n${USAGE}`);
      rootSeen = true;
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) fail(`Falta el valor de --root.\n${USAGE}`);
      root = resolve(argv[++i]);
    } else if (argv[i].startsWith("--")) {
      fail(`Opción desconocida: ${argv[i]}\n${USAGE}`);
    } else {
      names.push(argv[i]);
    }
  }
  return { names, root };
}

const { names, root } = parseArgs(process.argv.slice(2));
const valid = validNames();
const list = valid.map((m) => `  - ${m}`).join("\n");

if (names.length !== 1) {
  fail(`Se esperaba exactamente un nombre de módulo.\n${USAGE}\nMódulos válidos:\n${list}`);
}
const name = names[0];
if (!valid.includes(name)) {
  fail(`Módulo no válido: ${JSON.stringify(name)}.\n${USAGE}\nMódulos válidos:\n${list}`);
}

const appDir = join(root, "src", "app");
const moduleDir = join(appDir, name);
if (existsSync(moduleDir)) {
  fail(`Ya existe ${join("src", "app", name)}; no se modifica nada.`);
}

let firstCreated; // first path created by recursive mkdir; undefined if src/app already existed
let createdModuleDir = false;
const files = [];
try {
  firstCreated = mkdirSync(appDir, { recursive: true });
  mkdirSync(moduleDir); // non-recursive: fails with EEXIST if someone created it meanwhile
  createdModuleDir = true;
  writeFileSync(join(moduleDir, "index.ts"), INDEX_TS);
  files.push("index.ts");
  for (const folder of FOLDERS) {
    mkdirSync(join(moduleDir, folder));
    writeFileSync(join(moduleDir, folder, ".gitkeep"), "");
    files.push(`${folder}/.gitkeep`);
  }
} catch (error) {
  // Remove only what this run created.
  if (createdModuleDir) rmSync(moduleDir, { recursive: true, force: true });
  if (firstCreated) rmSync(firstCreated, { recursive: true, force: true });
  fail(`No se pudo crear el módulo ${name}: ${error.code === "EEXIST" ? "ya existe" : error.message}`);
}

process.stdout.write(`Módulo ${name} creado. Archivos:\n${files.map((f) => `  src/app/${name}/${f}`).join("\n")}\n`);
process.stdout.write("Nota: el registro de la ruta en app.routes.ts se hace en la primera historia con pantalla del módulo.\n");
