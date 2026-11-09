// Tests for the module generator (scripts/new-module.mjs), written black-box from the criteria.
// [EP00-TBR-001-CA1] A new module has src/app/<module>/ with index.ts, pages, components, data and model (DEC-0012).
// Edge cases (expert reservation): invalid name or existing folder -> exit != 0, message on stderr, nothing written.
// The generator always runs with --root <tmp dir> (DA-1); the real src/app/ must stay untouched.
// Run: node --test scripts/new-module.test.mjs
import { after, before, describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATOR = join(FRONT, "scripts", "new-module.mjs");
const CONFIG = join(FRONT, ".dependency-cruiser.cjs");
const DEPCRUISE = join(FRONT, "node_modules", "dependency-cruiser", "bin", "dependency-cruiser.mjs");
const TSC = join(FRONT, "node_modules", "typescript", "bin", "tsc");
const TMP = join(FRONT, "tmp");

// The 8 front modules of DEC-0012 (names unchanged until the DEC-0013 migration story).
const MODULES = ["catalogo", "abastecimiento", "compras", "inventario", "comercial", "inteligencia", "integracion", "administracion"];
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

// Runs the generator. cwd is a scratch dir so a generator that ignores --root cannot hit the real repo silently.
function generate(args) {
  assert.ok(existsSync(GENERATOR), `no existe el generador ${GENERATOR}`);
  const cwd = makeRoot();
  return spawnSync(process.execPath, [GENERATOR, ...args], { cwd, encoding: "utf8" });
}

before(() => {
  realAppBefore = snapshot(join(FRONT, "src", "app"));
});

after(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  try { rmdirSync(TMP); } catch { /* not empty (another test file is running) or already gone */ }
});

describe("[EP00-TBR-001-CA1] generated module structure", () => {
  it("[EP00-TBR-001-CA1] creates src/app/compras/ with index.ts, pages, components, data and model", () => {
    const root = makeRoot();
    const r = generate(["compras", "--root", root]);
    assert.equal(r.status, 0, `el generador falló:\n${r.stdout}${r.stderr}`);

    const moduleDir = join(root, "src", "app", "compras");
    assert.deepEqual(readdirSync(moduleDir).sort(), ["index.ts", ...FOLDERS].sort(), "la carpeta del módulo tiene más o menos de lo que pide DEC-0012");
    assert.ok(statSync(join(moduleDir, "index.ts")).isFile());
    for (const folder of FOLDERS) {
      assert.ok(statSync(join(moduleDir, folder)).isDirectory(), `${folder}/ no es carpeta`);
      // .gitkeep: git does not version empty folders; without it the structure would vanish on commit.
      assert.deepEqual(readdirSync(join(moduleDir, folder)), [".gitkeep"], `${folder}/ debe tener solo .gitkeep`);
    }
  });

  it("[EP00-TBR-001-CA1] index.ts exports `routes` typed as Routes from @angular/router (DA-3)", () => {
    const root = makeRoot();
    const r = generate(["compras", "--root", root]);
    assert.equal(r.status, 0, `el generador falló:\n${r.stdout}${r.stderr}`);
    const index = readFileSync(join(root, "src", "app", "compras", "index.ts"), "utf8");
    assert.match(index, /import\s*(type\s*)?\{\s*Routes\s*\}\s*from\s*['"]@angular\/router['"]/);
    assert.match(index, /export\s+const\s+routes\s*:\s*Routes\s*=/);
  });

  it("[EP00-TBR-001-CA1] leaves an existing app.routes.ts untouched (DA-2)", () => {
    const routes = "import { Routes } from '@angular/router';\n\n// synthetic fixture\nexport const routes: Routes = [];\n";
    const root = makeRoot({ "src/app/app.routes.ts": routes });
    const r = generate(["inventario", "--root", root]);
    assert.equal(r.status, 0, `el generador falló:\n${r.stdout}${r.stderr}`);
    assert.equal(readFileSync(join(root, "src", "app", "app.routes.ts"), "utf8"), routes);
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

    it("[EP00-TBR-001-CA1] accepts each of the 8 module names of DEC-0012", () => {
      for (const m of MODULES) {
        const r = generate([m, "--root", root]);
        assert.equal(r.status, 0, `rechazó el módulo válido ${m}:\n${r.stdout}${r.stderr}`);
        assert.ok(existsSync(join(root, "src", "app", m, "index.ts")), `${m}/index.ts no existe`);
      }
    });

    it("[EP00-TBR-001-CA1] generated modules imported through index.ts pass arch:check (real config)", () => {
      for (const m of MODULES) assert.ok(existsSync(join(root, "src", "app", m)), `falta el módulo ${m}`);
      const r = spawnSync(process.execPath, [DEPCRUISE, "src", "--config", CONFIG], { cwd: root, encoding: "utf8" });
      assert.equal(r.status, 0, `arch:check falló sobre los módulos generados:\n${r.stdout}${r.stderr}`);
    });

    it("[EP00-TBR-001-CA1] generated index.ts files type-check with the repo TypeScript", () => {
      for (const m of MODULES) assert.ok(existsSync(join(root, "src", "app", m, "index.ts")), `falta ${m}/index.ts`);
      const r = spawnSync(process.execPath, [TSC, "--noEmit", "-p", join(root, "tsconfig.app.json")], { cwd: root, encoding: "utf8" });
      assert.equal(r.status, 0, `tsc falló:\n${r.stdout}${r.stderr}`);
    });

    it("[EP00-TBR-001-CA1] generated files pass the design-system validator (revisar from validate-ui.mjs)", async () => {
      const { revisar } = await import(pathToFileURL(join(FRONT, "scripts", "validate-ui.mjs")).href);
      let checked = 0;
      for (const m of MODULES) {
        const files = snapshot(join(root, "src", "app", m));
        for (const [path, content] of Object.entries(files)) {
          if (content === "<dir>") continue;
          const ext = path.endsWith(".ts") ? ".ts" : path.slice(path.lastIndexOf("."));
          const errors = revisar(content, ext).filter((h) => h.nivel === "ERROR");
          assert.deepEqual(errors, [], `${m}/${path} no pasa validate-ui`);
          checked++;
        }
      }
      assert.ok(checked >= MODULES.length, "no se revisó ningún archivo generado");
    });
  });
});

test("[EP00-TBR-001-CA1] the module list in .dependency-cruiser.cjs is exactly the 8 modules of DEC-0012", () => {
  const config = createRequire(import.meta.url)(CONFIG);
  const modules = config.forbidden.map((r) => r.name).filter((n) => n.startsWith("frontera-")).map((n) => n.slice("frontera-".length));
  assert.deepEqual([...modules].sort(), [...MODULES].sort());
});

// Rejections: exit != 0, a message on stderr (not a crash), and the root tree byte-identical before and after.
// `args` is either the arguments before `--root <root>`, or a function root -> full argument list.
function assertRejected(args, seed, { listsValidNames = false } = {}) {
  const root = makeRoot(seed);
  const before = snapshot(root);
  const r = generate(typeof args === "function" ? args(root) : [...args, "--root", root]);
  assert.equal(typeof r.status, "number", `el proceso no terminó con un código (señal ${r.signal})`);
  assert.notEqual(r.status, 0, `se esperaba rechazo para ${JSON.stringify(args)}:\n${r.stdout}`);
  assert.ok(r.stderr.trim().length > 0, "el rechazo debe explicar el motivo por stderr");
  assert.doesNotMatch(r.stderr, /^\s+at .+:\d+:\d+\)?\s*$/m, `el rechazo es un error no controlado:\n${r.stderr}`);
  if (listsValidNames) for (const m of MODULES) assert.ok(r.stderr.includes(m), `el mensaje no menciona el módulo válido ${m}:\n${r.stderr}`);
  assert.deepEqual(snapshot(root), before, "el generador escribió algo al rechazar");
}

// Synthetic witness: proves nothing is created, not even src/app/.
const EMPTY_SEED = { "witness.txt": "synthetic witness\n" };

describe("[EP00-TBR-001-CA1] generator rejects invalid input without writing anything", () => {
  it("[EP00-TBR-001-CA1] rejects a call without a module name", () => {
    assertRejected([], EMPTY_SEED);
  });

  it("[EP00-TBR-001-CA1] rejects more than one module name", () => {
    assertRejected(["compras", "inventario"], EMPTY_SEED);
  });

  for (const [label, name] of [
    ["a name outside the 8 modules (ventas)", "ventas"],
    ["a name outside the 8 modules (core)", "core"],
    ["a name outside the 8 modules (ui)", "ui"],
    ["an uppercase name (Compras)", "Compras"],
    ["a path traversal (../x)", "../x"],
    ["a name with a separator (compras/x)", "compras/x"],
    ["an empty name", ""],
  ]) {
    it(`[EP00-TBR-001-CA1] rejects ${label} and lists the valid names`, () => {
      assertRejected([name], EMPTY_SEED, { listsValidNames: true });
    });
  }

  it("[EP00-TBR-001-CA1] rejects an existing module folder and keeps its content intact", () => {
    assertRejected(["compras"], {
      "src/app/app.routes.ts": "export const routes = [];\n",
      "src/app/compras/witness.txt": "synthetic witness\n",
    });
  });

  it("[EP00-TBR-001-CA1] rejects an existing empty module folder", () => {
    assertRejected(["compras"], { "src/app/compras/": "" });
  });

  it("[EP00-TBR-001-CA1] rejects when a file already has the module name", () => {
    assertRejected(["compras"], { "src/app/compras": "synthetic file, not a folder\n" });
  });

  it("[EP00-TBR-001-CA1] rejects --root without a value and does not fall back to the real repo", () => {
    assertRejected(() => ["compras", "--root"], EMPTY_SEED);
    assert.deepEqual(snapshot(join(FRONT, "src", "app")), realAppBefore, "escribió en el src/app/ real");
  });

  it("[EP00-TBR-001-CA1] rejects an unknown option (e.g. the old --raiz)", () => {
    assertRejected((root) => ["compras", "--raiz", root], EMPTY_SEED);
    assert.deepEqual(snapshot(join(FRONT, "src", "app")), realAppBefore, "escribió en el src/app/ real");
  });

  it("[EP00-TBR-001-CA1] rejects --root=<dir> (only the separated form is supported)", () => {
    assertRejected((root) => ["compras", `--root=${root}`], EMPTY_SEED);
  });

  // Write failures after validation: the generator must leave nothing behind.
  it("[EP00-TBR-001-CA1] fails cleanly when src/app is a file (write error, nothing left behind)", () => {
    assertRejected(["compras"], { "src/app": "synthetic file where src/app should be\n" });
  });

  it("[EP00-TBR-001-CA1] fails cleanly when --root points to a file (write error, nothing left behind)", () => {
    const parent = makeRoot({ "root-file": "synthetic file used as --root\n" });
    const before = snapshot(parent);
    const r = generate(["compras", "--root", join(parent, "root-file")]);
    assert.notEqual(r.status, 0, `se esperaba rechazo:\n${r.stdout}`);
    assert.ok(r.stderr.trim().length > 0, "el fallo debe explicarse por stderr");
    assert.doesNotMatch(r.stderr, /^\s+at .+:\d+:\d+\)?\s*$/m, `error no controlado:\n${r.stderr}`);
    assert.deepEqual(snapshot(parent), before, "el generador dejó restos al fallar");
  });
});

test("[EP00-TBR-001-CA1] package.json exposes the generator as `npm run module:new`", () => {
  const { scripts } = JSON.parse(readFileSync(join(FRONT, "package.json"), "utf8"));
  assert.match(scripts["module:new"] ?? "", /^node scripts\/new-module\.mjs$/);
});

test("[EP00-TBR-001-CA1] the real src/app/ is untouched by the test run (DA-1)", () => {
  // Runs last in file order; compares against the snapshot taken in before().
  assert.deepEqual(snapshot(join(FRONT, "src", "app")), realAppBefore);
});
