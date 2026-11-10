// Tests for the module generator (scripts/new-module.mjs), written black-box from the criteria.
// [EP00-TBR-001-CA1] A new module has src/app/<module>/ with index.ts, pages, components, data and model (DEC-0012).
// [EP00-TBR-014-CA1] Module names are in English (DEC-0013, DEC-0017); arch:check guards a new module with boundary-<module>.
// [EP00-TBR-014-CA2] An old Spanish name is rejected like any unknown name: nothing written, and the message lists the
// 8 valid English names, with no hint of the new name (DA-2).
// Edge cases (expert reservation): invalid name or existing folder -> exit != 0, message on stderr, nothing written.
// The generator always runs with --root <tmp dir> (DA-1); the real src/app/ must stay untouched.
// The fixed module table and its comparison with .dependency-cruiser.cjs live in arch-check.test.mjs (CA6).
// Run: node --test scripts/new-module.test.mjs
import { after, before, describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATOR = join(FRONT, "scripts", "new-module.mjs");
const CONFIG = join(FRONT, ".dependency-cruiser.cjs");
const DEPCRUISE = join(FRONT, "node_modules", "dependency-cruiser", "bin", "dependency-cruiser.mjs");
const TSC = join(FRONT, "node_modules", "typescript", "bin", "tsc");
const TMP = join(FRONT, "tmp");

// The 8 front modules (DEC-0017 table, approved by the PO on 2026-11-10).
const MODULES = ["catalog", "replenishment", "purchasing", "inventory", "commercial", "intelligence", "integration", "administration"];
// Test data only: the names used before DEC-0013. The generator must reject every one of them (CA2).
const LEGACY_MODULES = ["catalogo", "abastecimiento", "compras", "inventario", "comercial", "inteligencia", "integracion", "administracion"];
const FOLDERS = ["pages", "components", "data", "model"];
const TSCONFIG = JSON.stringify({ extends: "../../tsconfig.json", compilerOptions: { types: [] }, include: ["src/**/*.ts"] });

const created = [];
let realAppBefore;

// Recursive snapshot of a directory: every folder and every file with its content.
function snapshot(dir) {
  const out = {};
  const walk = (abs, rel) => {
    for (const name of readdirSync(abs).sort()) {
      const a = join(abs, name);
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(a).isDirectory()) { out[`${r}/`] = "<dir>"; walk(a, r); }
      else out[r] = readFileSync(a, "utf8");
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out;
}

// Fresh root under tmp/ (so @angular/* resolves to the repo's node_modules), seeded with synthetic files.
function makeRoot(files = {}) {
  mkdirSync(TMP, { recursive: true });
  const dir = mkdtempSync(join(TMP, "gen-"));
  created.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const abs = join(dir, path);
    if (path.endsWith("/")) { mkdirSync(abs, { recursive: true }); continue; }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

// Resource limit (S1): no child process (generator, depcruise, tsc) may hang the job.
const CHILD_TIMEOUT_MS = 60_000;

// Runs a Node script synchronously with a timeout; a child that does not finish fails the test with a clear message.
function runNode(script, args, cwd) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", timeout: CHILD_TIMEOUT_MS, killSignal: "SIGKILL" });
  if (r.error?.code === "ETIMEDOUT" || r.status === null) {
    assert.fail(`${script} no terminó (señal ${r.signal}, límite ${CHILD_TIMEOUT_MS / 1000} s) en ${cwd}\n${r.stdout ?? ""}${r.stderr ?? ""}`);
  }
  return r;
}

// Runs the generator. cwd is a scratch dir so a generator that ignores --root cannot hit the real repo silently.
function generate(args, cwd = makeRoot()) {
  assert.ok(existsSync(GENERATOR), `no existe el generador ${GENERATOR}`);
  return runNode(GENERATOR, args, cwd);
}

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (s) => new RegExp(`(^|[^A-Za-z0-9_-])${escape(s)}($|[^A-Za-z0-9_-])`, "m");

before(() => {
  realAppBefore = snapshot(join(FRONT, "src", "app"));
});

after(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  try { rmdirSync(TMP); } catch { /* not empty (another test file is running) or already gone */ }
});

describe("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] generated module structure", () => {
  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] creates src/app/purchasing/ with index.ts, pages, components, data and model", () => {
    const root = makeRoot();
    const r = generate(["purchasing", "--root", root]);
    assert.equal(r.status, 0, `el generador falló:\n${r.stdout}${r.stderr}`);

    const moduleDir = join(root, "src", "app", "purchasing");
    assert.deepEqual(readdirSync(moduleDir).sort(), ["index.ts", ...FOLDERS].sort(), "la carpeta del módulo tiene más o menos de lo que pide DEC-0012");
    assert.ok(statSync(join(moduleDir, "index.ts")).isFile());
    for (const folder of FOLDERS) {
      assert.ok(statSync(join(moduleDir, folder)).isDirectory(), `${folder}/ no es carpeta`);
      // .gitkeep: git does not version empty folders; without it the structure would vanish on commit.
      assert.deepEqual(readdirSync(join(moduleDir, folder)), [".gitkeep"], `${folder}/ debe tener solo .gitkeep`);
    }
  });

  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] index.ts exports `routes` typed as Routes from @angular/router (DA-3)", () => {
    const root = makeRoot();
    const r = generate(["purchasing", "--root", root]);
    assert.equal(r.status, 0, `el generador falló:\n${r.stdout}${r.stderr}`);
    const index = readFileSync(join(root, "src", "app", "purchasing", "index.ts"), "utf8");
    assert.match(index, /import\s*(type\s*)?\{\s*Routes\s*\}\s*from\s*['"]@angular\/router['"]/);
    assert.match(index, /export\s+const\s+routes\s*:\s*Routes\s*=/);
  });

  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] leaves an existing app.routes.ts untouched (DA-2)", () => {
    const routes = "import { Routes } from '@angular/router';\n\n// synthetic fixture\nexport const routes: Routes = [];\n";
    const root = makeRoot({ "src/app/app.routes.ts": routes });
    const r = generate(["inventory", "--root", root]);
    assert.equal(r.status, 0, `el generador falló:\n${r.stdout}${r.stderr}`);
    assert.equal(readFileSync(join(root, "src", "app", "app.routes.ts"), "utf8"), routes);
  });

  // CA1: "arch:check lo verifica con la regla boundary-purchasing", on the module the generator just created.
  it("[EP00-TBR-014-CA1] arch:check guards the generated purchasing module with boundary-purchasing", () => {
    const root = makeRoot({ "tsconfig.app.json": TSCONFIG });
    for (const m of ["purchasing", "inventory"]) {
      const r = generate([m, "--root", root]);
      assert.equal(r.status, 0, `el generador falló con ${m}:\n${r.stdout}${r.stderr}`);
    }
    // Clean tree first: the generated modules alone pass the real config.
    const clean = runNode(DEPCRUISE, ["src", "--config", CONFIG], root);
    assert.equal(clean.status, 0, `arch:check falló sobre los módulos recién generados:\n${clean.stdout}${clean.stderr}`);

    // One violation: another module imports an internal of purchasing.
    const from = "src/app/inventory/pages/p.ts";
    const to = "src/app/purchasing/data/x.ts";
    writeFileSync(join(root, to), "export const x = 1;\n");
    writeFileSync(join(root, from), "import { x } from '../../purchasing/data/x';\nexport const p = x;\n");

    const text = runNode(DEPCRUISE, ["src", "--config", CONFIG], root);
    assert.notEqual(text.status, 0, `se esperaba fallo de arch:check:\n${text.stdout}${text.stderr}`);
    assert.match(stripAnsi(text.stdout), new RegExp(`error boundary-purchasing: ${escape(from)} →\\s+${escape(to)}`),
      `no aparece la regla boundary-purchasing con la importación:\n${text.stdout}`);

    const json = runNode(DEPCRUISE, ["src", "--config", CONFIG, "-T", "json"], root);
    const violations = JSON.parse(json.stdout).summary.violations;
    assert.deepEqual(violations.map((v) => [v.rule.name, v.from, v.to]), [["boundary-purchasing", from, to]],
      `se esperaba solo boundary-purchasing:\n${JSON.stringify(violations, null, 2)}`);
  });

  describe("all 8 modules generated in one root", () => {
    let root;
    before(() => {
      root = makeRoot({
        "tsconfig.app.json": TSCONFIG,
        "src/app/app.routes.ts":
          "import { Routes } from '@angular/router';\n" +
          MODULES.map((m) => `import { routes as ${m} } from './${m}';`).join("\n") +
          "\n\nexport const routes: Routes = [\n" +
          MODULES.map((m) => `  { path: '${m}', children: ${m} },`).join("\n") +
          "\n];\n",
      });
    });

    it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] accepts each of the 8 English module names", () => {
      for (const m of MODULES) {
        const r = generate([m, "--root", root]);
        assert.equal(r.status, 0, `rechazó el módulo válido ${m}:\n${r.stdout}${r.stderr}`);
        assert.ok(existsSync(join(root, "src", "app", m, "index.ts")), `${m}/index.ts no existe`);
      }
    });

    it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] generated modules imported through index.ts pass arch:check (real config)", () => {
      for (const m of MODULES) assert.ok(existsSync(join(root, "src", "app", m)), `falta el módulo ${m}`);
      const r = runNode(DEPCRUISE, ["src", "--config", CONFIG], root);
      assert.equal(r.status, 0, `arch:check falló sobre los módulos generados:\n${r.stdout}${r.stderr}`);
    });

    it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] generated index.ts files type-check with the repo TypeScript", () => {
      for (const m of MODULES) assert.ok(existsSync(join(root, "src", "app", m, "index.ts")), `falta ${m}/index.ts`);
      const r = runNode(TSC, ["--noEmit", "-p", join(root, "tsconfig.app.json")], root);
      assert.equal(r.status, 0, `tsc falló:\n${r.stdout}${r.stderr}`);
    });

    // validate-ui public API (DA-3): review(text, ext) -> { level: "error" | "warning", id, line, sample, message }[].
    it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] generated files pass the design-system validator (review from validate-ui.mjs)", async () => {
      const { review } = await import(pathToFileURL(join(FRONT, "scripts", "validate-ui.mjs")).href);
      assert.equal(typeof review, "function", "validate-ui.mjs no exporta la función review(text, ext)");
      let checked = 0;
      for (const m of MODULES) {
        const files = snapshot(join(root, "src", "app", m));
        for (const [path, content] of Object.entries(files)) {
          if (content === "<dir>") continue;
          const ext = path.endsWith(".ts") ? ".ts" : path.slice(path.lastIndexOf("."));
          const findings = review(content, ext);
          assert.ok(Array.isArray(findings), "review debe devolver una lista de hallazgos");
          const errors = findings.filter((f) => f.level === "error");
          assert.deepEqual(errors, [], `${m}/${path} no pasa validate-ui`);
          checked++;
        }
      }
      assert.ok(checked >= MODULES.length, "no se revisó ningún archivo generado");
    });
  });
});

// Rejections: exit != 0, a message on stderr (not a crash), and the root tree byte-identical before and after.
// `args` is either the arguments before `--root <root>`, or a function root -> full argument list.
// With listsValidNames, stderr must name the 8 English modules and no old Spanish name other than the rejected input.
function assertRejected(args, seed, { listsValidNames = false } = {}) {
  const root = makeRoot(seed);
  const before = snapshot(root);
  const r = generate(typeof args === "function" ? args(root) : [...args, "--root", root]);
  assert.equal(typeof r.status, "number", `el proceso no terminó con un código (señal ${r.signal})`);
  assert.notEqual(r.status, 0, `se esperaba rechazo para ${JSON.stringify(args)}:\n${r.stdout}`);
  assert.ok(r.stderr.trim().length > 0, "el rechazo debe explicar el motivo por stderr");
  assert.doesNotMatch(r.stderr, /^\s+at .+:\d+:\d+\)?\s*$/m, `el rechazo es un error no controlado:\n${r.stderr}`);
  if (listsValidNames) {
    // Whole words only: "catalog" must not be satisfied by "catalogo".
    for (const m of MODULES) assert.match(r.stderr, word(m), `el mensaje no menciona el módulo válido ${m}:\n${r.stderr}`);
    const input = typeof args === "function" ? undefined : args[0];
    for (const old of LEGACY_MODULES) {
      if (old === input) continue;
      assert.doesNotMatch(r.stderr, word(old), `el mensaje menciona el nombre antiguo ${old}:\n${r.stderr}`);
    }
  }
  assert.deepEqual(snapshot(root), before, "el generador escribió algo al rechazar");
  return { r, root };
}

// Synthetic witness: proves nothing is created, not even src/app/.
const EMPTY_SEED = { "witness.txt": "synthetic witness\n" };

// The rejection message with the variable parts (rejected name, root path) replaced, to compare two rejections.
const normalized = (stderr, name, root) => stderr.split(root).join("<root>").split(name).join("<name>");

describe("[EP00-TBR-014-CA2] old Spanish module names are rejected", () => {
  // The rejection an unknown name gets (ventas), used as the reference message (no assertions: the ventas case has its own test).
  const reference = () => {
    const root = makeRoot(EMPTY_SEED);
    return normalized(generate(["ventas", "--root", root]).stderr, "ventas", root);
  };

  for (const old of LEGACY_MODULES) {
    it(`[EP00-TBR-014-CA2] rejects the old name ${old} without writing anything and lists the 8 English names`, () => {
      const { r, root } = assertRejected([old], EMPTY_SEED, { listsValidNames: true });
      // DA-2: no "old -> new" hint; the message is the same one an unknown name gets.
      assert.equal(normalized(r.stderr, old, root), reference(), `el rechazo de ${old} difiere del de un nombre desconocido:\n${r.stderr}`);
      assert.deepEqual(snapshot(join(FRONT, "src", "app")), realAppBefore, "escribió en el src/app/ real");
    });
  }

  it("[EP00-TBR-014-CA2] rejects an old name even when its folder does not exist anywhere (no fallback to the old table)", () => {
    // The generator must not create src/app/compras/ under any root, whatever its config history.
    const { root } = assertRejected(["compras"], { "src/app/app.routes.ts": "export const routes = [];\n" }, { listsValidNames: true });
    assert.ok(!existsSync(join(root, "src", "app", "compras")), "se creó src/app/compras/");
  });
});

describe("[EP00-TBR-001-CA1][EP00-TBR-014-CA2] generator rejects invalid input without writing anything", () => {
  it("[EP00-TBR-001-CA1] rejects a call without a module name", () => {
    assertRejected([], EMPTY_SEED);
  });

  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] rejects more than one module name", () => {
    assertRejected(["purchasing", "inventory"], EMPTY_SEED);
  });

  for (const [label, name] of [
    ["a name outside the 8 modules (ventas)", "ventas"],
    ["a name outside the 8 modules (core)", "core"],
    ["a name outside the 8 modules (ui)", "ui"],
    ["a capitalized name (Purchasing)", "Purchasing"],
    ["an uppercase name (PURCHASING)", "PURCHASING"],
    ["an uppercase old name (COMPRAS)", "COMPRAS"],
    ["a name with a leading space ( purchasing)", " purchasing"],
    ["a name with a trailing space (purchasing )", "purchasing "],
    ["a path traversal (../x)", "../x"],
    ["a name with a separator (purchasing/x)", "purchasing/x"],
    ["an empty name", ""],
  ]) {
    it(`[EP00-TBR-001-CA1][EP00-TBR-014-CA2] rejects ${label} and lists the valid names`, () => {
      assertRejected([name], EMPTY_SEED, { listsValidNames: true });
    });
  }

  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] rejects an existing module folder and keeps its content intact", () => {
    assertRejected(["purchasing"], {
      "src/app/app.routes.ts": "export const routes = [];\n",
      "src/app/purchasing/witness.txt": "synthetic witness\n",
    });
  });

  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] rejects an existing empty module folder", () => {
    assertRejected(["purchasing"], { "src/app/purchasing/": "" });
  });

  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] rejects when a file already has the module name", () => {
    assertRejected(["purchasing"], { "src/app/purchasing": "synthetic file, not a folder\n" });
  });

  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] rejects --root without a value and does not fall back to the real repo", () => {
    assertRejected(() => ["purchasing", "--root"], EMPTY_SEED);
    assert.deepEqual(snapshot(join(FRONT, "src", "app")), realAppBefore, "escribió en el src/app/ real");
  });

  // --raiz stays on purpose: it is the old option of EP00-TBR-001 and must keep being rejected.
  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] rejects an unknown option (e.g. the old --raiz)", () => {
    assertRejected((root) => ["purchasing", "--raiz", root], EMPTY_SEED);
    assert.deepEqual(snapshot(join(FRONT, "src", "app")), realAppBefore, "escribió en el src/app/ real");
  });

  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] rejects --root=<dir> (only the separated form is supported)", () => {
    assertRejected((root) => ["purchasing", `--root=${root}`], EMPTY_SEED);
  });

  // Q1: an ambiguous target must be rejected, not resolved silently (e.g. "last one wins").
  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] rejects a repeated --root and leaves both roots untouched", () => {
    const first = makeRoot(EMPTY_SEED);
    const second = makeRoot(EMPTY_SEED);
    const before = { first: snapshot(first), second: snapshot(second) };
    const r = generate(["purchasing", "--root", first, "--root", second]);
    assert.notEqual(r.status, 0, `se esperaba rechazo con --root repetido:\n${r.stdout}`);
    assert.ok(r.stderr.trim().length > 0, "el rechazo debe explicar el motivo por stderr");
    assert.doesNotMatch(r.stderr, /^\s+at .+:\d+:\d+\)?\s*$/m, `el rechazo es un error no controlado:\n${r.stderr}`);
    assert.deepEqual(snapshot(first), before.first, "el generador escribió en el primer --root");
    assert.deepEqual(snapshot(second), before.second, "el generador escribió en el segundo --root");
  });

  // Q2: an option-like token is not a directory; it must not create ./--x/ in the working directory.
  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] rejects --root followed by an option-like value (--x) without creating it in the cwd", () => {
    const cwd = makeRoot(EMPTY_SEED);
    const before = snapshot(cwd);
    const r = generate(["purchasing", "--root", "--x"], cwd);
    assert.notEqual(r.status, 0, `se esperaba rechazo con --root --x:\n${r.stdout}`);
    assert.ok(r.stderr.trim().length > 0, "el rechazo debe explicar el motivo por stderr");
    assert.doesNotMatch(r.stderr, /^\s+at .+:\d+:\d+\)?\s*$/m, `el rechazo es un error no controlado:\n${r.stderr}`);
    assert.ok(!existsSync(join(cwd, "--x")), "el generador creó ./--x en el directorio de trabajo");
    assert.deepEqual(snapshot(cwd), before, "el generador escribió en el directorio de trabajo");
    assert.deepEqual(snapshot(join(FRONT, "src", "app")), realAppBefore, "escribió en el src/app/ real");
  });

  // Write failures after validation: the generator must leave nothing behind.
  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] fails cleanly when src/app is a file (write error, nothing left behind)", () => {
    assertRejected(["purchasing"], { "src/app": "synthetic file where src/app should be\n" });
  });

  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] fails cleanly when --root points to a file (write error, nothing left behind)", () => {
    const parent = makeRoot({ "root-file": "synthetic file used as --root\n" });
    const before = snapshot(parent);
    const r = generate(["purchasing", "--root", join(parent, "root-file")]);
    assert.notEqual(r.status, 0, `se esperaba rechazo:\n${r.stdout}`);
    assert.ok(r.stderr.trim().length > 0, "el fallo debe explicarse por stderr");
    assert.doesNotMatch(r.stderr, /^\s+at .+:\d+:\d+\)?\s*$/m, `error no controlado:\n${r.stderr}`);
    assert.deepEqual(snapshot(parent), before, "el generador dejó restos al fallar");
  });
});

// S2: a write that fails after the generator created folders must remove only what that run created.
// Fault injection: a preload replaces fs.writeFileSync so that writing model/.gitkeep (the last file) throws;
// syncBuiltinESMExports() propagates the patch to the generator's named ESM import.
const FAULT_PRELOAD = [
  "import fs from 'node:fs';",
  "import { syncBuiltinESMExports } from 'node:module';",
  "const original = fs.writeFileSync;",
  "fs.writeFileSync = (file, ...rest) => {",
  "  if (String(file).split(/[\\\\/]/).slice(-2).join('/') === 'model/.gitkeep') {",
  "    throw Object.assign(new Error('fallo inyectado por la prueba'), { code: 'EIO' });",
  "  }",
  "  return original(file, ...rest);",
  "};",
  "syncBuiltinESMExports();",
  "",
].join("\n");

function generateWithLateFailure(args, cwd = makeRoot()) {
  const preload = join(makeRoot({ "fault.mjs": FAULT_PRELOAD }), "fault.mjs");
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, GENERATOR, ...args],
    { cwd, encoding: "utf8", timeout: CHILD_TIMEOUT_MS, killSignal: "SIGKILL" });
  if (r.error?.code === "ETIMEDOUT" || r.status === null) assert.fail(`el generador no terminó (señal ${r.signal})`);
  assert.equal(r.status, 1, `se esperaba fallo con código 1:\n${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /fallo inyectado por la prueba/, `el fallo inyectado no llegó al generador:\n${r.stderr}`);
  assert.doesNotMatch(r.stderr, /^\s+at .+:\d+:\d+\)?\s*$/m, `error no controlado:\n${r.stderr}`);
  return r;
}

describe("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] late write failure rolls back only what the run created (S2)", () => {
  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] --root that does not exist: the whole created chain is removed, the parent stays intact", () => {
    const parent = makeRoot(EMPTY_SEED);
    const before = snapshot(parent);
    generateWithLateFailure(["purchasing", "--root", join(parent, "new-root", "deeper")]);
    assert.ok(!existsSync(join(parent, "new-root")), "quedó la raíz creada por la corrida fallida");
    assert.deepEqual(snapshot(parent), before, "el generador dejó restos o tocó contenido ajeno");
  });

  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] root without src/: src/ is removed and the root keeps its content", () => {
    const root = makeRoot(EMPTY_SEED);
    const before = snapshot(root);
    generateWithLateFailure(["purchasing", "--root", root]);
    assert.deepEqual(snapshot(root), before, "el generador dejó restos o tocó contenido ajeno");
  });

  it("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] existing src/app with other modules: only the new module folder is removed", () => {
    const root = makeRoot({
      "src/app/app.routes.ts": "export const routes = [];\n",
      "src/app/inventory/index.ts": "export const routes = [];\n",
      "src/app/inventory/data/witness.txt": "synthetic witness\n",
    });
    const before = snapshot(root);
    generateWithLateFailure(["purchasing", "--root", root]);
    assert.deepEqual(snapshot(root), before, "la reversión borró contenido ajeno o dejó restos");
  });
});

// Q3: a missing, broken or rule-less .dependency-cruiser.cjs ends with code 1 and a message, no stack trace,
// nothing written. The generator reads the config next to its own repo, so it runs from a synthetic copy.
// [EP00-TBR-014-CA2] A config that only has the old frontera-<module> rules has no valid module names either.
describe("[EP00-TBR-001-CA1][EP00-TBR-014-CA2] unusable dependency-cruiser config is rejected cleanly (Q3)", () => {
  for (const [label, config, module] of [
    ["missing", undefined, "purchasing"],
    ["with a syntax error", "module.exports = {\n", "purchasing"],
    ["without boundary-<module> rules", "module.exports = { forbidden: [{ name: 'no-cycles', from: {}, to: { circular: true } }] };\n", "purchasing"],
    ["with only the old frontera-<module> rules", "module.exports = { forbidden: [{ name: 'frontera-compras', from: {}, to: {} }] };\n", "compras"],
    ["without a forbidden list", "module.exports = {};\n", "purchasing"],
  ]) {
    it(`[EP00-TBR-001-CA1][EP00-TBR-014-CA2] config ${label}: exit 1, message on stderr, nothing written`, () => {
      const fakeRepo = makeRoot({
        "scripts/new-module.mjs": readFileSync(GENERATOR, "utf8"),
        ...(config === undefined ? {} : { ".dependency-cruiser.cjs": config }),
      });
      const root = makeRoot(EMPTY_SEED);
      const before = { repo: snapshot(fakeRepo), root: snapshot(root) };
      const r = runNode(join(fakeRepo, "scripts", "new-module.mjs"), [module, "--root", root], root);
      assert.equal(r.status, 1, `se esperaba código 1:\n${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /dependency-cruiser\.cjs/, `el mensaje no nombra la configuración:\n${r.stderr}`);
      assert.doesNotMatch(r.stderr, /^\s+at .+:\d+:\d+\)?\s*$/m, `error no controlado:\n${r.stderr}`);
      assert.deepEqual(snapshot(root), before.root, "el generador escribió en --root");
      assert.deepEqual(snapshot(fakeRepo), before.repo, "el generador escribió en su repo");
    });
  }
});

test("[EP00-TBR-001-CA1][EP00-TBR-014-CA1] package.json exposes the generator as `npm run module:new`", () => {
  const { scripts } = JSON.parse(readFileSync(join(FRONT, "package.json"), "utf8"));
  assert.match(scripts["module:new"] ?? "", /^node scripts\/new-module\.mjs$/);
});

test("[EP00-TBR-001-CA1] the real src/app/ is untouched by the test run (DA-1)", () => {
  // Runs last in file order; compares against the snapshot taken in before().
  assert.deepEqual(snapshot(join(FRONT, "src", "app")), realAppBefore);
});
