// Tests for `npm run arch:check` (dependency-cruiser with the real .dependency-cruiser.cjs).
// [EP00-TBR-001-CA2] Every forbidden rule fails on a synthetic violation and reports rule + import.
// Fixtures are written at runtime under tmp/ (ignored by git) and removed afterwards.
// Run: node --test scripts/arch-check.test.mjs
import { after, describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(FRONT, ".dependency-cruiser.cjs");
const DEPCRUISE = join(FRONT, "node_modules", "dependency-cruiser", "bin", "dependency-cruiser.mjs");
const TMP = join(FRONT, "tmp");
const config = createRequire(import.meta.url)(CONFIG);

const MODULES = ["catalogo", "abastecimiento", "compras", "inventario", "comercial", "inteligencia", "integracion", "administracion"];
const TSCONFIG = JSON.stringify({ extends: "../../tsconfig.json", compilerOptions: { types: [] }, include: ["src/**/*.ts"] });

const created = [];
after(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  try { rmdirSync(TMP); } catch { /* not empty (another test file is running) or already gone */ }
});

// Writes a fixture (map: relative path -> content) into a fresh directory under tmp/.
function makeFixture(files) {
  mkdirSync(TMP, { recursive: true });
  const dir = mkdtempSync(join(TMP, "arch-"));
  created.push(dir);
  writeFileSync(join(dir, "tsconfig.app.json"), TSCONFIG);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

// Runs depcruise exactly like `npm run arch:check`, with the real config, from the fixture directory.
function cruise(dir, extraArgs = []) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [DEPCRUISE, "src", "--config", CONFIG, ...extraArgs], { cwd: dir });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d) => (stderr += d));
    child.on("error", fail);
    child.on("close", (status) => done({ status, stdout: stdout.replace(/\x1b\[[0-9;]*m/g, ""), stderr }));
  });
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const other = (m) => MODULES[(MODULES.indexOf(m) + 1) % MODULES.length];

// One case per forbidden rule; each fixture holds exactly one violation.
// `to` is a string (exact path) or a RegExp (paths that depend on the disk layout).
const CASES = [
  ...MODULES.map((m) => ({
    title: `fails on frontera-${m} when another module imports its internals`,
    rule: `frontera-${m}`,
    files: {
      [`src/app/${m}/data/x.ts`]: "export const x = 1;\n",
      [`src/app/${other(m)}/pages/p.ts`]: `import { x } from '../../${m}/data/x';\nexport const p = x;\n`,
    },
    from: `src/app/${other(m)}/pages/p.ts`,
    to: `src/app/${m}/data/x.ts`,
  })),
  {
    title: "fails on frontera-compras when the app root imports a module internal",
    rule: "frontera-compras",
    files: {
      "src/app/compras/pages/p.ts": "export const p = 1;\n",
      "src/app/app.routes.ts": "import { p } from './compras/pages/p';\nexport const r = p;\n",
    },
    from: "src/app/app.routes.ts",
    to: "src/app/compras/pages/p.ts",
  },
  {
    title: "fails on capas-del-modulo when data/ imports pages/",
    rule: "capas-del-modulo",
    files: {
      "src/app/compras/pages/p.ts": "export const p = 1;\n",
      "src/app/compras/data/d.ts": "import { p } from '../pages/p';\nexport const d = p;\n",
    },
    from: "src/app/compras/data/d.ts",
    to: "src/app/compras/pages/p.ts",
  },
  {
    title: "fails on capas-del-modulo when model/ imports components/",
    rule: "capas-del-modulo",
    files: {
      "src/app/inventario/components/c.ts": "export const c = 1;\n",
      "src/app/inventario/model/t.ts": "import { c } from '../components/c';\nexport const t = c;\n",
    },
    from: "src/app/inventario/model/t.ts",
    to: "src/app/inventario/components/c.ts",
  },
  {
    title: "fails on http-solo-en-data when pages/ imports @angular/common/http",
    rule: "http-solo-en-data",
    files: {
      "src/app/compras/pages/p.ts": "import { HttpClient } from '@angular/common/http';\nexport const p = HttpClient;\n",
    },
    from: "src/app/compras/pages/p.ts",
    to: /node_modules\/@angular\/common\/.*http/,
  },
  {
    title: "fails on ui-independiente when src/ui imports from src/app",
    rule: "ui-independiente",
    files: {
      "src/app/app.config.ts": "export const appConfig = {};\n",
      "src/ui/x.ts": "import { appConfig } from '../app/app.config';\nexport const x = appConfig;\n",
    },
    from: "src/ui/x.ts",
    to: "src/app/app.config.ts",
  },
  {
    title: "fails on sin-ciclos when two files import each other",
    rule: "sin-ciclos",
    cycle: true,
    files: {
      "src/app/compras/pages/a.ts": "import { b } from './b';\nexport const a = () => b;\n",
      "src/app/compras/pages/b.ts": "import { a } from './a';\nexport const b = () => a;\n",
    },
    from: "src/app/compras/pages/a.ts",
    to: "src/app/compras/pages/b.ts",
  },
  {
    title: "fails on hub-solo-por-api when the front imports a hub client",
    rule: "hub-solo-por-api",
    files: {
      "src/app/compras/data/hub-client.ts": "export const hub = 1;\n",
      "src/app/compras/data/q.ts": "import { hub } from './hub-client';\nexport const q = hub;\n",
    },
    from: "src/app/compras/data/q.ts",
    to: "src/app/compras/data/hub-client.ts",
  },
  {
    title: "fails on sin-backend-en-el-front when the front imports @prisma/client",
    rule: "sin-backend-en-el-front",
    files: {
      // Synthetic package, local to the fixture: it only has to resolve.
      "node_modules/@prisma/client/package.json": JSON.stringify({ name: "@prisma/client", version: "0.0.0-test", main: "index.js" }),
      "node_modules/@prisma/client/index.js": "module.exports = { PrismaClient: class {} };\n",
      "src/app/compras/data/p.ts": "import { PrismaClient } from '@prisma/client';\nexport const p = PrismaClient;\n",
    },
    from: "src/app/compras/data/p.ts",
    to: /node_modules\/@prisma\/client\//,
  },
];

describe("[EP00-TBR-001-CA2] arch:check rules", { concurrency: true }, () => {
  for (const c of CASES) {
    it(`[EP00-TBR-001-CA2] ${c.title} and reports the import`, async () => {
      const dir = makeFixture(c.files);
      const [text, json] = await Promise.all([cruise(dir), cruise(dir, ["-T", "json"])]);

      // 1. Fails.
      // (Only the default "err" reporter sets the exit code; the JSON run is used for isolation only.)
      assert.notEqual(text.status, 0, `se esperaba salida distinta de 0 para ${c.rule}\n${text.stdout}${text.stderr}`);

      // 2. The developer sees which rule breaks which import: "error <rule>: <from> → <to>".
      const toText = typeof c.to === "string" ? escape(c.to) : `\\S*${c.to.source}\\S*`;
      // A cycle is printed across lines ("a.ts → \n b.ts →\n a.ts"), hence the \s+ after the arrow.
      const line = new RegExp(`error ${escape(c.rule)}: ${escape(c.from)} →\\s+${toText}`);
      assert.match(text.stdout, line, `no aparece la línea de la regla ${c.rule} con su importación:\n${text.stdout}`);

      // 3. Isolation: only the expected rule fires (a cycle reports each of its edges).
      const violations = JSON.parse(json.stdout).summary.violations;
      assert.ok(violations.length >= 1, "sin violaciones en el reporte JSON");
      assert.deepEqual([...new Set(violations.map((v) => v.rule.name))], [c.rule], `reglas inesperadas: ${JSON.stringify(violations.map((v) => v.rule.name))}`);
      if (!c.cycle) assert.equal(violations.length, 1, `se esperaba una sola violación:\n${JSON.stringify(violations, null, 2)}`);
      const hit = violations.find((v) => v.from === c.from);
      assert.ok(hit, `ninguna violación sale de ${c.from}`);
      if (typeof c.to === "string") assert.equal(hit.to, c.to);
      else assert.match(hit.to, c.to);
    });
  }

  it("[EP00-TBR-001-CA2] passes (exit 0) on a compliant module layout (negative control)", async () => {
    const dir = makeFixture({
      "src/app/compras/model/order.ts": "export interface Order { id: string; }\n",
      "src/app/compras/data/orders-api.ts":
        "import { HttpClient } from '@angular/common/http';\nimport { Order } from '../model/order';\nexport const api = (h: HttpClient): Order[] => (h ? [] : []);\n",
      "src/app/compras/components/row.ts": "import { Order } from '../model/order';\nexport const row = (o: Order) => o.id;\n",
      "src/app/compras/pages/list.ts": "import { api } from '../data/orders-api';\nimport { row } from '../components/row';\nexport const list = { api, row };\n",
      "src/app/compras/index.ts": "import { list } from './pages/list';\nexport const routes = [{ path: '', data: list }];\n",
      "src/app/core/http.ts": "import { provideHttpClient } from '@angular/common/http';\nexport const http = provideHttpClient;\n",
      "src/app/app.config.ts": "import { provideHttpClient } from '@angular/common/http';\nexport const appConfig = { providers: [provideHttpClient] };\n",
      "src/app/app.routes.ts": "import { routes as compras } from './compras';\nexport const routes = [{ path: 'compras', children: compras }];\n",
      "src/ui/button.ts": "export const button = 'button';\n",
    });
    const result = await cruise(dir);
    assert.equal(result.status, 0, `el control negativo no debería fallar:\n${result.stdout}${result.stderr}`);
  });
});

test("[EP00-TBR-001-CA2] every forbidden rule in .dependency-cruiser.cjs has a test case (coverage)", () => {
  const configured = config.forbidden.map((r) => r.name);
  const covered = new Set(CASES.map((c) => c.rule));
  const missing = configured.filter((name) => !covered.has(name));
  const stale = [...covered].filter((name) => !configured.includes(name));
  assert.deepEqual(missing, [], `reglas sin caso de prueba: ${missing.join(", ")}`);
  assert.deepEqual(stale, [], `casos de reglas que ya no existen: ${stale.join(", ")}`);
  // Two variants for capas-del-modulo, per the design (§8.3).
  assert.equal(CASES.filter((c) => c.rule === "capas-del-modulo").length, 2);
});

test("[EP00-TBR-001-CA2] the frontera rules cover exactly the 8 modules of DEC-0012", () => {
  const modules = config.forbidden.map((r) => r.name).filter((n) => n.startsWith("frontera-")).map((n) => n.slice("frontera-".length));
  assert.deepEqual([...modules].sort(), [...MODULES].sort());
});
