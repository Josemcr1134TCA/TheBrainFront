// Tests for `npm run arch:check` (dependency-cruiser with the real .dependency-cruiser.cjs).
// [EP00-TBR-001-CA2] Every forbidden rule fails on a synthetic violation and reports rule + import.
// [EP00-TBR-014-CA3] Rule names are in English (DEC-0013, DEC-0017): boundary-<module>, module-layers,
// http-only-in-data, ui-independent, no-cycles, hub-only-via-api and no-backend-in-front.
// [EP00-TBR-004-CA1] DA-3 adds ui-public-api: src/app/ imports src/ui/ only through src/ui/index.ts
// (DEC-0017 amendment of 2026-11-11: 15 forbidden rules in total).
// [EP00-TBR-014-CA6] The module list of .dependency-cruiser.cjs must match the table fixed in this file (MODULES).
// If it does not, this file fails, so `arch:check` fails in its test step and says which name is extra and which is missing.
// Fixtures are written at runtime under tmp/ (ignored by git) and removed afterwards.
// Run: node --test scripts/arch-check.test.mjs
import { after, describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(FRONT, ".dependency-cruiser.cjs");
const DEPCRUISE = join(FRONT, "node_modules", "dependency-cruiser", "bin", "dependency-cruiser.mjs");
const TMP = join(FRONT, "tmp");
const config = createRequire(import.meta.url)(CONFIG);

// Resource limits (S1): a bounded number of depcruise processes at a time, and nothing may hang the job.
// Each case runs two depcruise processes, so CONCURRENCY cases means up to 2 * CONCURRENCY children.
const CONCURRENCY = 4;
const CHILD_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = CHILD_TIMEOUT_MS + 15_000;

// [EP00-TBR-014-CA6] The fixed module table (approved by the PO on 2026-11-10; DEC-0017). The tests read it from here only.
const MODULES = ["catalog", "replenishment", "purchasing", "inventory", "commercial", "intelligence", "integration", "administration"];
const BOUNDARY_PREFIX = "boundary-";
// [EP00-TBR-014-CA3] The 7 rule names of the story (boundary-<module> counts once as a family): 8 + 6 = 14 forbidden rules.
// [EP00-TBR-004-CA1] Plus ui-public-api (DA-3, DEC-0017 amendment): 8 + 7 = 15 forbidden rules.
const OTHER_RULES = ["module-layers", "http-only-in-data", "ui-independent", "no-cycles", "hub-only-via-api", "no-backend-in-front", "ui-public-api"];
const EXPECTED_RULE_COUNT = 15;
const EXPECTED_RULES = [...MODULES.map((m) => `${BOUNDARY_PREFIX}${m}`), ...OTHER_RULES];
// Test data only: the rule and module names used before DEC-0013. None of them may remain in the config.
const LEGACY_PREFIX = "frontera-";
const LEGACY_RULES = ["capas-del-modulo", "http-solo-en-data", "ui-independiente", "sin-ciclos", "hub-solo-por-api", "sin-backend-en-el-front"];
const LEGACY_MODULES = ["catalogo", "abastecimiento", "compras", "inventario", "comercial", "inteligencia", "integracion", "administracion"];

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
// A child that exceeds CHILD_TIMEOUT_MS is killed and the promise rejects with a clear message.
function cruise(dir, extraArgs = []) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [DEPCRUISE, "src", "--config", CONFIG, ...extraArgs], {
      cwd: dir,
      timeout: CHILD_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d) => (stderr += d));
    child.on("error", fail);
    child.on("close", (status, signal) => {
      if (status === null) {
        fail(new Error(`depcruise no terminó (señal ${signal}, límite ${CHILD_TIMEOUT_MS / 1000} s) en ${dir}\n${stdout}${stderr}`));
        return;
      }
      done({ status, stdout: stdout.replace(/\x1b\[[0-9;]*m/g, ""), stderr });
    });
  });
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const other = (m) => MODULES[(MODULES.indexOf(m) + 1) % MODULES.length];

// One case per forbidden rule; each fixture holds exactly one violation.
// `to` is a string (exact path) or a RegExp (paths that depend on the disk layout).
const CASES = [
  ...MODULES.map((m) => ({
    title: `fails on ${BOUNDARY_PREFIX}${m} when another module imports its internals`,
    rule: `${BOUNDARY_PREFIX}${m}`,
    files: {
      [`src/app/${m}/data/x.ts`]: "export const x = 1;\n",
      [`src/app/${other(m)}/pages/p.ts`]: `import { x } from '../../${m}/data/x';\nexport const p = x;\n`,
    },
    from: `src/app/${other(m)}/pages/p.ts`,
    to: `src/app/${m}/data/x.ts`,
  })),
  {
    title: "fails on boundary-purchasing when the app root imports a module internal",
    rule: "boundary-purchasing",
    files: {
      "src/app/purchasing/pages/p.ts": "export const p = 1;\n",
      "src/app/app.routes.ts": "import { p } from './purchasing/pages/p';\nexport const r = p;\n",
    },
    from: "src/app/app.routes.ts",
    to: "src/app/purchasing/pages/p.ts",
  },
  {
    title: "fails on module-layers when data/ imports pages/",
    rule: "module-layers",
    files: {
      "src/app/purchasing/pages/p.ts": "export const p = 1;\n",
      "src/app/purchasing/data/d.ts": "import { p } from '../pages/p';\nexport const d = p;\n",
    },
    from: "src/app/purchasing/data/d.ts",
    to: "src/app/purchasing/pages/p.ts",
  },
  {
    title: "fails on module-layers when model/ imports components/",
    rule: "module-layers",
    files: {
      "src/app/inventory/components/c.ts": "export const c = 1;\n",
      "src/app/inventory/model/t.ts": "import { c } from '../components/c';\nexport const t = c;\n",
    },
    from: "src/app/inventory/model/t.ts",
    to: "src/app/inventory/components/c.ts",
  },
  {
    title: "fails on http-only-in-data when pages/ imports @angular/common/http",
    rule: "http-only-in-data",
    files: {
      "src/app/purchasing/pages/p.ts": "import { HttpClient } from '@angular/common/http';\nexport const p = HttpClient;\n",
    },
    from: "src/app/purchasing/pages/p.ts",
    to: /node_modules\/@angular\/common\/.*http/,
  },
  {
    title: "fails on ui-independent when src/ui imports from src/app",
    rule: "ui-independent",
    files: {
      "src/app/app.config.ts": "export const appConfig = {};\n",
      "src/ui/x.ts": "import { appConfig } from '../app/app.config';\nexport const x = appConfig;\n",
    },
    from: "src/ui/x.ts",
    to: "src/app/app.config.ts",
  },
  {
    tag: "[EP00-TBR-004-CA1]",
    title: "fails on ui-public-api when a module page imports a design system internal",
    rule: "ui-public-api",
    files: {
      "src/ui/components/button/button.ts": "export const button = 'button';\n",
      "src/app/purchasing/pages/p.ts": "import { button } from '../../../ui/components/button/button';\nexport const p = button;\n",
    },
    from: "src/app/purchasing/pages/p.ts",
    to: "src/ui/components/button/button.ts",
  },
  {
    tag: "[EP00-TBR-004-CA1]",
    title: "fails on ui-public-api when the app root imports src/ui/format directly",
    rule: "ui-public-api",
    files: {
      "src/ui/format/format.ts": "export const formatMoney = (v: number) => String(v);\n",
      "src/app/app.ts": "import { formatMoney } from '../ui/format/format';\nexport const app = formatMoney;\n",
    },
    from: "src/app/app.ts",
    to: "src/ui/format/format.ts",
  },
  {
    title: "fails on no-cycles when two files import each other",
    rule: "no-cycles",
    cycle: true,
    files: {
      "src/app/purchasing/pages/a.ts": "import { b } from './b';\nexport const a = () => b;\n",
      "src/app/purchasing/pages/b.ts": "import { a } from './a';\nexport const b = () => a;\n",
    },
    from: "src/app/purchasing/pages/a.ts",
    to: "src/app/purchasing/pages/b.ts",
  },
  {
    title: "fails on hub-only-via-api when the front imports a hub client",
    rule: "hub-only-via-api",
    files: {
      "src/app/purchasing/data/hub-client.ts": "export const hub = 1;\n",
      "src/app/purchasing/data/q.ts": "import { hub } from './hub-client';\nexport const q = hub;\n",
    },
    from: "src/app/purchasing/data/q.ts",
    to: "src/app/purchasing/data/hub-client.ts",
  },
  {
    title: "fails on no-backend-in-front when the front imports @prisma/client",
    rule: "no-backend-in-front",
    files: {
      // Synthetic package, local to the fixture: it only has to resolve.
      "node_modules/@prisma/client/package.json": JSON.stringify({ name: "@prisma/client", version: "0.0.0-test", main: "index.js" }),
      "node_modules/@prisma/client/index.js": "module.exports = { PrismaClient: class {} };\n",
      "src/app/purchasing/data/p.ts": "import { PrismaClient } from '@prisma/client';\nexport const p = PrismaClient;\n",
    },
    from: "src/app/purchasing/data/p.ts",
    to: /node_modules\/@prisma\/client\//,
  },
];

describe("[EP00-TBR-001-CA2][EP00-TBR-014-CA3] arch:check rules", { concurrency: CONCURRENCY }, () => {
  for (const c of CASES) {
    it(`[EP00-TBR-001-CA2][EP00-TBR-014-CA3]${c.tag ?? ""} ${c.title} and reports the import`, { timeout: TEST_TIMEOUT_MS }, async () => {
      const dir = makeFixture(c.files);
      const [text, json] = await Promise.all([cruise(dir), cruise(dir, ["-T", "json"])]);

      // 1. Fails.
      // (Only the default "err" reporter sets the exit code; the JSON run is used for isolation only.)
      assert.notEqual(text.status, 0, `se esperaba salida distinta de 0 para ${c.rule}\n${text.stdout}${text.stderr}`);

      // 2. The developer sees which rule, by its English name, breaks which import: "error <rule>: <from> → <to>".
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

  it("[EP00-TBR-001-CA2][EP00-TBR-014-CA3] passes (exit 0) on a compliant module layout (negative control)", { timeout: TEST_TIMEOUT_MS }, async () => {
    const dir = makeFixture({
      "src/app/purchasing/model/order.ts": "export interface Order { id: string; }\n",
      "src/app/purchasing/data/orders-api.ts":
        "import { HttpClient } from '@angular/common/http';\nimport { Order } from '../model/order';\nexport const api = (h: HttpClient): Order[] => (h ? [] : []);\n",
      "src/app/purchasing/components/row.ts": "import { Order } from '../model/order';\nexport const row = (o: Order) => o.id;\n",
      "src/app/purchasing/pages/list.ts": "import { api } from '../data/orders-api';\nimport { row } from '../components/row';\nexport const list = { api, row };\n",
      "src/app/purchasing/index.ts": "import { list } from './pages/list';\nexport const routes = [{ path: '', data: list }];\n",
      "src/app/core/http.ts": "import { provideHttpClient } from '@angular/common/http';\nexport const http = provideHttpClient;\n",
      "src/app/app.config.ts": "import { provideHttpClient } from '@angular/common/http';\nexport const appConfig = { providers: [provideHttpClient] };\n",
      "src/app/app.routes.ts": "import { routes as purchasing } from './purchasing';\nexport const routes = [{ path: 'purchasing', children: purchasing }];\n",
      "src/ui/button.ts": "export const button = 'button';\n",
    });
    const result = await cruise(dir);
    assert.equal(result.status, 0, `el control negativo no debería fallar:\n${result.stdout}${result.stderr}`);
  });

  it("[EP00-TBR-004-CA1] passes (exit 0) when src/app/ imports the design system through src/ui/index.ts (negative control)", { timeout: TEST_TIMEOUT_MS }, async () => {
    const dir = makeFixture({
      "src/ui/components/skeleton/skeleton.ts": "export const skeleton = 'skeleton';\n",
      "src/ui/components/data-table/data-table.ts": "import { skeleton } from '../skeleton/skeleton';\nexport const table = { skeleton };\n",
      "src/ui/format/format.ts": "export const formatMoney = (v: number) => String(v);\n",
      "src/ui/index.ts": "export { table } from './components/data-table/data-table';\nexport { formatMoney } from './format/format';\n",
      "src/app/purchasing/pages/list.ts": "import { table, formatMoney } from '../../../ui';\nexport const list = { table, formatMoney };\n",
      "src/app/app.ts": "import { formatMoney } from '../ui/index';\nexport const app = formatMoney;\n",
    });
    const result = await cruise(dir);
    assert.equal(result.status, 0, `importar src/ui/ por su index.ts no debería fallar:\n${result.stdout}${result.stderr}`);
  });
});

test("[EP00-TBR-001-CA2][EP00-TBR-014-CA3] every forbidden rule in .dependency-cruiser.cjs has a test case (coverage)", () => {
  const configured = config.forbidden.map((r) => r.name);
  const covered = new Set(CASES.map((c) => c.rule));
  const missing = configured.filter((name) => !covered.has(name));
  const stale = [...covered].filter((name) => !configured.includes(name));
  assert.deepEqual(missing, [], `reglas sin caso de prueba: ${missing.join(", ")}`);
  assert.deepEqual(stale, [], `casos de reglas que ya no existen: ${stale.join(", ")}`);
  // Two variants for module-layers (EP00-TBR-001 design, §8.3).
  assert.equal(CASES.filter((c) => c.rule === "module-layers").length, 2);
});

test("[EP00-TBR-014-CA3][EP00-TBR-004-CA1] the config has exactly the 15 forbidden rules, all with their English names", () => {
  const configured = config.forbidden.map((r) => r.name);
  const repeated = configured.filter((name, i) => configured.indexOf(name) !== i);
  assert.deepEqual(repeated, [], `reglas repetidas en .dependency-cruiser.cjs: ${repeated.join(", ")}`);
  const legacy = configured.filter((name) => name.startsWith(LEGACY_PREFIX) || LEGACY_RULES.includes(name));
  assert.deepEqual(legacy, [], `reglas con nombre antiguo en español: ${legacy.join(", ")}`);
  assert.equal(EXPECTED_RULES.length, EXPECTED_RULE_COUNT);
  assert.equal(configured.length, EXPECTED_RULE_COUNT, `se esperaban ${EXPECTED_RULE_COUNT} reglas y hay ${configured.length}: ${configured.join(", ")}`);
  assert.deepEqual([...configured].sort(), [...EXPECTED_RULES].sort(), `las reglas no son las ${EXPECTED_RULE_COUNT} esperadas: ${configured.join(", ")}`);
});

test("[EP00-TBR-004-CA1] ui-public-api is scoped to src/app/ and only lets src/ui/index.ts through", () => {
  const rule = config.forbidden.find((r) => r.name === "ui-public-api");
  assert.ok(rule, "falta la regla ui-public-api en .dependency-cruiser.cjs (DA-3)");
  assert.equal(rule.severity, "error");
  assert.equal(typeof rule.comment, "string");
  assert.notEqual(rule.comment.trim(), "", "la regla debe explicar en comment por qué falla");
  const from = new RegExp(rule.from.path);
  const to = new RegExp(rule.to.path);
  const toNot = new RegExp(rule.to.pathNot);
  assert.ok(from.test("src/app/catalog/pages/list.ts") && !from.test("src/ui/components/data-table/data-table.ts"));
  assert.ok(to.test("src/ui/components/button/button.ts") && to.test("src/ui/format/format.ts"));
  assert.ok(toNot.test("src/ui/index.ts"), "src/ui/index.ts debe quedar permitido");
  assert.ok(!toNot.test("src/ui/components/index.ts") && !toNot.test("src/ui/format/index.ts"), "solo src/ui/index.ts es la API pública");
});

// [EP00-TBR-014-CA6] Pure comparison between the module list of the config and the fixed table.
// extra: in the config but not in the table; missing: in the table but not in the config.
function compareModules(configured, expected) {
  return {
    extra: configured.filter((m) => !expected.includes(m)),
    missing: expected.filter((m) => !configured.includes(m)),
  };
}

// Message for people (in Spanish): says which name is extra and which is missing.
function mismatchMessage({ extra, missing }) {
  const parts = [];
  if (extra.length) parts.push(`sobra en .dependency-cruiser.cjs: ${extra.join(", ")}`);
  if (missing.length) parts.push(`falta en .dependency-cruiser.cjs: ${missing.join(", ")}`);
  return parts.length ? `la lista de módulos no coincide con la tabla fijada en scripts/arch-check.test.mjs (${parts.join("; ")})` : "";
}

// Module list of the config, read from its boundary-<module> rules (the same source the generator uses).
const configuredModules = () =>
  config.forbidden.map((r) => r.name).filter((n) => n.startsWith(BOUNDARY_PREFIX)).map((n) => n.slice(BOUNDARY_PREFIX.length));

describe("[EP00-TBR-014-CA6] module list of .dependency-cruiser.cjs against the fixed table", () => {
  // Self-checks with synthetic lists (design R7): the comparison and its message name each extra and missing name.
  it("[EP00-TBR-014-CA6] compareModules reports nothing when both lists match (order does not matter)", () => {
    const result = compareModules([...MODULES].reverse(), MODULES);
    assert.deepEqual(result, { extra: [], missing: [] });
    assert.equal(mismatchMessage(result), "");
  });

  it("[EP00-TBR-014-CA6] compareModules names the extra module", () => {
    const result = compareModules([...MODULES, "sales"], MODULES);
    assert.deepEqual(result, { extra: ["sales"], missing: [] });
    assert.match(mismatchMessage(result), /sobra en \.dependency-cruiser\.cjs: sales/);
    assert.doesNotMatch(mismatchMessage(result), /falta/);
  });

  it("[EP00-TBR-014-CA6] compareModules names the missing module", () => {
    const result = compareModules(MODULES.filter((m) => m !== "inventory"), MODULES);
    assert.deepEqual(result, { extra: [], missing: ["inventory"] });
    assert.match(mismatchMessage(result), /falta en \.dependency-cruiser\.cjs: inventory/);
    assert.doesNotMatch(mismatchMessage(result), /sobra/);
  });

  it("[EP00-TBR-014-CA6] compareModules names both when an old name replaces a new one", () => {
    const result = compareModules(MODULES.map((m) => (m === "purchasing" ? "compras" : m)), MODULES);
    assert.deepEqual(result, { extra: ["compras"], missing: ["purchasing"] });
    const message = mismatchMessage(result);
    assert.match(message, /sobra en \.dependency-cruiser\.cjs: compras/);
    assert.match(message, /falta en \.dependency-cruiser\.cjs: purchasing/);
  });

  it("[EP00-TBR-014-CA6] compareModules names every module of the old table as extra and every new one as missing", () => {
    assert.deepEqual(compareModules(LEGACY_MODULES, MODULES), { extra: LEGACY_MODULES, missing: MODULES });
  });

  // The real check: it fails in `arch:test` (the first step of `arch:check`) when the config and the table differ.
  it("[EP00-TBR-001-CA2][EP00-TBR-014-CA6] the boundary rules of .dependency-cruiser.cjs cover exactly the fixed table", () => {
    const configured = configuredModules();
    const repeated = configured.filter((m, i) => configured.indexOf(m) !== i);
    assert.deepEqual(repeated, [], `módulos repetidos en .dependency-cruiser.cjs: ${repeated.join(", ")}`);
    const result = compareModules(configured, MODULES);
    assert.ok(result.extra.length === 0 && result.missing.length === 0, mismatchMessage(result));
  });
});

// The cases above run depcruise directly; this pins `npm run arch:check` to that same command.
// Only the default "err" reporter sets a non-zero exit code: an output-type override would let arch:check pass with violations.
// [EP00-TBR-014-CA6] The tests run first, so a config that differs from the table stops arch:check before depcruise.
test("[EP00-TBR-001-CA2][EP00-TBR-014-CA3][EP00-TBR-014-CA6] npm run arch:check runs the tests, then depcruise on src with the real config and default reporter", () => {
  const { scripts } = JSON.parse(readFileSync(join(FRONT, "package.json"), "utf8"));
  const steps = (scripts["arch:check"] ?? "").split("&&").map((s) => s.trim());
  assert.deepEqual(steps, ["npm run arch:test", "depcruise src --config .dependency-cruiser.cjs"]);
  const tested = (scripts["arch:test"] ?? "").split(/\s+/);
  for (const f of ["scripts/arch-check.test.mjs", "scripts/new-module.test.mjs"]) assert.ok(tested.includes(f), `arch:test no corre ${f}`);
});
