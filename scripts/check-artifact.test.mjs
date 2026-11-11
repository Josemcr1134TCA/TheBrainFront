// Black-box tests for scripts/check-artifact.mjs and scripts/forbidden-artifact-patterns.json (EP00-TBR-002),
// written from the criteria and the design (docs/diseno/EP00-TBR-002.md §8.3, §8.4, §8.6 and §8.9)
// before the script exists.
// [EP00-TBR-002-CA3] The artifact check reviews dist/the-brain-front/ (browser/ and its root) against the list of
// forbidden patterns (names, contents, exceptions), fails on any finding, never prints a secret in full,
// fails closed (missing artifact, bad arguments, symlinks, unreadable files) and passes a clean artifact.
// [EP00-TBR-002-CA3] R3: the mandatory minimum of the list is copied here on purpose. Emptying the list means
// editing this file too, and that shows in the diff. Each minimum rule is also planted in a fake dist.
// [EP00-TBR-002-CA3] T3 (after reading T2) pins the dev rules of docs/estado/EP00-TBR-002.md: (1) each finding is
// { rule, path, line, sample }, findings go to stderr, the exit code is 1 and N counts only files; (2) in exceptions
// "*" does not cross "/", "**" does and paths are case sensitive, while forbidden names ignore case.
// [EP00-TBR-002-CA3] Round 1 adds tests for the review findings approved by the dev (docs/estado/EP00-TBR-002.md):
// S1 linear JWT search, S2 entry guard through symlinks, S3 unsupported file types, Q1 globstar folder boundaries and
// S6/Q2 broad exception paths. They are written before the fix, so they fail on commit d46985c.
// [EP00-TBR-002-CA3] Round 1, phase a2 · L1: the PO, owner of the list (PO-2), approved in Slack (option a, all of it
// in this story) widening the list with the S5 names and the S4 contents and fixes. Those tests are written before
// the list and the script change, so the positive ones fail on commit d33a3c8 and the near-miss controls pass.
// [EP00-TBR-002-CA3] Round 2 adds tests for the round 1 re-review findings approved by the dev: H-1 (stricter S6 rule),
// H-2/Q12 (JWT hidden behind a failed candidate), H-3/Q13 (keys glued to another word), Q10 (short sk-ant-) and Q14
// (exception paths that never match). They are written before the fix, so the positive ones fail on commit 21d254f.
// [EP00-TBR-002-CA3] Round 3 re-review (after the fix on 0eb5fc9) pins H-4: lines are counted by "\n" only, as grep -n
// and git count them, and stay exact in every layout, while many findings on many lines stay linear. It adds two N-4
// controls and pins that a key-shaped run of ~8 MB still fails the review (finding Q18). All of them pass on 0eb5fc9;
// each one kills a mutant that the suite let live.
// [EP00-TBR-002-CA1] package.json has typecheck (R1) plus ci:test and artifact:check with the exact text of §8.6.
// Synthetic secrets are assembled at runtime so no key-like string is committed (RG-4). No real data.
// Fixtures live under tmp/ (ignored by git) and are removed afterwards.
// Run: node --test scripts/check-artifact.test.mjs
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(FRONT, "scripts", "check-artifact.mjs");
const LIST = join(FRONT, "scripts", "forbidden-artifact-patterns.json");
const TMP = join(FRONT, "tmp");
const CHILD_TIMEOUT_MS = 60_000;

// [EP00-TBR-002-CA3] L1 · S5 names approved by the PO. Format of `name` (the one the list already uses for wrangler.*,
// *.pem and id_rsa*, so `names` needs no new field): a glob matched against the whole base name of a file, in any
// folder of the artifact, ignoring case, where "*" stands for zero or more characters other than "/". So "*.tfstate"
// and "*-firebase-adminsdk-*.json" go into `name` as written here. `samples` are planted at the root, in browser/ and
// in browser/assets/i18n/, in three spellings.
const mixedCase = (s) => [...s].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join("");
const literalSamples = (name) => [name, name.toUpperCase(), mixedCase(name)];
const L1_NAMES = [
  { id: "vercel-legacy-config", kind: "file", name: "now.json" },
  { id: "vercel-ignore", kind: "file", name: ".vercelignore" },
  { id: "cloudflare-routes", kind: "file", name: "_routes.json" },
  { id: "cloudflare-worker", kind: "file", name: "_worker.js" },
  { id: "fly-config", kind: "file", name: "fly.toml" },
  { id: "render-config", kind: "file", name: "render.yaml" },
  { id: "firebase-app-hosting", kind: "file", name: "apphosting.yaml" },
  { id: "npm-config", kind: "file", name: ".npmrc" },
  { id: "netrc-file", kind: "file", name: ".netrc" },
  { id: "git-credentials", kind: "file", name: ".git-credentials" },
  { id: "terraform-state", kind: "file", name: "*.tfstate", samples: ["terraform.tfstate", "PROD.TFSTATE", "synthetic-env.TfState"] },
  {
    id: "firebase-admin-sdk-key",
    kind: "file",
    name: "*-firebase-adminsdk-*.json",
    samples: ["synthetic-project-firebase-adminsdk-ab1cd-0123456789.json", "SYNTH-FIREBASE-ADMINSDK-X1Y2Z-ABC.JSON", "synth-app-Firebase-AdminSdk-q9w8e-ff00.Json"],
  },
].map((r) => ({ ...r, samples: r.samples ?? literalSamples(r.name) }));
const L1_NAME_IDS = new Set(L1_NAMES.map((r) => r.id));
// [EP00-TBR-002-CA3] L1 · S4 content rules approved by the PO (new ids). The PGP block is a fix of private-key-block.
const L1_CONTENTS = [
  { id: "npm-token", kind: "regex" },
  { id: "anthropic-api-key", kind: "regex" },
  { id: "ai-provider-secret-key", kind: "regex" },
];

// [EP00-TBR-002-CA3] R3 · Mandatory minimum (design §8.4). Literal copy: same id, kind and name, or same kind and role.
// L1 adds every new name and content rule, so none of them can leave the list or get an exception in silence (PO-2).
const MINIMUM = {
  names: [
    { id: "vercel-config", kind: "file", name: "vercel.json" },
    { id: "vercel-dir", kind: "dir", name: ".vercel" },
    { id: "netlify-config", kind: "file", name: "netlify.toml" },
    { id: "firebase-config", kind: "file", name: "firebase.json" },
    { id: "env-file", kind: "file", name: ".env" },
    ...L1_NAMES.map(({ id, kind, name }) => ({ id, kind, name })),
  ],
  contents: [
    { id: "private-key-block", kind: "regex" },
    { id: "service-role-jwt", kind: "jwt-role", role: "service_role" },
    { id: "supabase-secret-key", kind: "regex" },
    { id: "postgres-url-with-password", kind: "regex" },
    ...L1_CONTENTS,
  ],
};
const MINIMUM_IDS = [...MINIMUM.names, ...MINIMUM.contents].map((r) => r.id);
// Exceptions of a list that touch a rule of the minimum. The validator accepts them on content rules (design §8.3);
// this test rejects them in the real list, so weakening the minimum means editing this file too (R3).
const minimumExceptionHits = (list) =>
  (Array.isArray(list?.exceptions) ? list.exceptions : []).filter((e) => MINIMUM_IDS.includes(e?.rule)).map((e) => `${e.rule} → ${e.path}`);

// ---------------------------------------------------------------------------------------------
// Synthetic triggers, assembled at runtime (nothing key-like is committed).
// ---------------------------------------------------------------------------------------------
const b64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (payload) => [b64url({ alg: "HS256", typ: "JWT" }), b64url(payload), "c3ludGhldGlj" + "Q".repeat(31)].join(".");
const DASHES = "-".repeat(5);
const pemBlock = (label) =>
  [`${DASHES}${"BEG" + "IN"} ${label}${" KEY"}${DASHES}`, "U3ludGhldGljVGVzdE9ubHk".repeat(3), `${DASHES}${"EN" + "D"} ${label}${" KEY"}${DASHES}`].join("\n");

const TRIGGERS = [
  { id: "private-key-block", label: "a PKCS#8 block", value: () => pemBlock("PRIV" + "ATE") },
  { id: "private-key-block", label: "an OpenSSH block", value: () => pemBlock("OPENSSH PRIV" + "ATE") },
  { id: "service-role-jwt", label: "a JWT with role service_role", value: () => jwt({ iss: "supabase", ref: "synthetictestref", role: "service" + "_role", iat: 1700000000, exp: 2000000000 }) },
  { id: "supabase-secret-key", label: "an sb_secret_ key", value: () => "sb_" + "secret_" + "SyntheticTestValue" + "0".repeat(14) },
  { id: "postgres-url-with-password", label: "a postgres URL with password", value: () => "postgres" + "ql://" + "synthetic_user:" + "Synthetic" + "Pass" + "123" + "@db.example.invalid:5432/app" },
];
const triggerOf = (id) => TRIGGERS.find((t) => t.id === id).value();

// Longest piece of a trigger the output may show (design: at most 6 characters plus «…»; 8 leaves a margin).
const MAX_SHOWN = 8;
function leakedPieces(output, secret) {
  const pieces = [];
  for (let i = 0; i + MAX_SHOWN + 1 <= secret.length; i++) {
    const piece = secret.slice(i, i + MAX_SHOWN + 1);
    if (output.includes(piece)) pieces.push(piece);
  }
  return pieces;
}

// ---------------------------------------------------------------------------------------------
// Fixtures: a fake dist/the-brain-front/ written at runtime under tmp/.
// ---------------------------------------------------------------------------------------------
const MAIN_JS = "browser/main-SYNTH0001.js";
// The clean bundle mentions provider names and words on purpose: a mention is not a finding (R2).
// The anon JWT is public by design and must pass (design §8.3, jwt-role).
const CLEAN_FILES = () => ({
  "browser/index.html": "<!doctype html><html><head><title>The Brain</title></head><body><app-root></app-root></body></html>\n",
  [MAIN_JS]: [
    "/* synthetic bundle */",
    `const hosts=["vercel.json","netlify.toml","firebase"];const note="BEGIN";`,
    `const anon="${jwt({ iss: "supabase", ref: "synthetictestref", role: "anon", iat: 1700000000, exp: 2000000000 })}";`,
    "export{hosts,note,anon};",
  ].join("\n"),
  "browser/favicon.ico": Buffer.from([0, 0, 1, 0, 1, 0, 16, 16]),
  "3rdpartylicenses.txt": "Synthetic license notice for tests.\n",
});

const created = [];
after(() => {
  for (const dir of created) {
    try { chmodSync(dir, 0o755); } catch { /* already gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
  try { rmdirSync(TMP); } catch { /* not empty (another test file is running) or already gone */ }
});

function makeDir(prefix = "artifact-") {
  mkdirSync(TMP, { recursive: true });
  const dir = mkdtempSync(join(TMP, prefix));
  created.push(dir);
  return dir;
}

// files: relative path -> string | Buffer; a path ending in "/" is an empty folder. `clean: false` skips the base files.
function makeArtifact(files = {}, { clean = true } = {}) {
  const dir = makeDir();
  const all = clean ? { ...CLEAN_FILES(), ...files } : files;
  for (const [path, content] of Object.entries(all)) {
    const abs = join(dir, path);
    if (path.endsWith("/")) { mkdirSync(abs, { recursive: true }); continue; }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

// Runs the script like npm does; a child that hangs fails the test with a clear message.
function check(args) {
  assert.ok(existsSync(SCRIPT), "no existe el script scripts/check-artifact.mjs (lo escribe constructor-logica en T2)");
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: FRONT, encoding: "utf8", timeout: CHILD_TIMEOUT_MS, killSignal: "SIGKILL" });
  if (r.error?.code === "ETIMEDOUT" || r.status === null) {
    assert.fail(`check-artifact.mjs no terminó (señal ${r.signal}, límite ${CHILD_TIMEOUT_MS / 1000} s)\n${r.stdout ?? ""}${r.stderr ?? ""}`);
  }
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  return { status: r.status, stdout, stderr, output: `${stdout}\n${stderr}` };
}
const scan = (dir) => check(["--dir", dir]);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STACK_TRACE_RE = /^\s+at .+:\d+(?::\d+)?\)?\s*$/m;
const SUMMARY_RE = /check-artifact: (\d+) hallazgo\(s\)/;
const CLEAN_RE = /check-artifact: 0 hallazgos en (\d+) archivo\(s\) de .+; listo para subir/;

// True when one output line names the relative path (as a token, optional :line) and the rule id.
function names(output, path, id, line) {
  const pathRe = new RegExp(`(?:^|\\s)${escapeRe(path)}/?${line ? `:${line}` : "(?::\\d+)?"}(?=\\s|$)`);
  return output.split("\n").some((l) => pathRe.test(l) && l.includes(id));
}

// A failing review (dev rule 1): exit code 1, not a crash, the finding (path + id on one line) and the summary on
// stderr, and nothing that says the artifact is ready.
function assertFinding(r, path, id, line) {
  assert.equal(r.status, 1, `se esperaba el código 1 por ${id} en ${path}\n${r.output}`);
  assert.doesNotMatch(r.output, STACK_TRACE_RE, `la revisión no debe terminar con una traza\n${r.output}`);
  assert.ok(names(r.stderr, path, id, line), `stderr debe nombrar ${path}${line ? `:${line}` : ""} y ${id} en una línea\nstderr: ${r.stderr}`);
  assert.match(r.stderr, SUMMARY_RE, `falta en stderr el resumen «check-artifact: N hallazgo(s)…»\nstderr: ${r.stderr}`);
  assert.doesNotMatch(r.output, /listo para subir/, `un artefacto con hallazgos nunca está listo para subir\n${r.output}`);
}
const SUMMARY_FILES_RE = /check-artifact: \d+ hallazgo\(s\) en (\d+) archivo\(s\)/;

// ---------------------------------------------------------------------------------------------
// Module API. Importing is first probed in a child: a missing guard must not run the review here.
// ---------------------------------------------------------------------------------------------
const PROBE = (() => {
  if (!existsSync(SCRIPT)) return { missing: true };
  const code = `const m = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); process.stdout.write(JSON.stringify(Object.keys(m).sort()));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: FRONT, encoding: "utf8", timeout: CHILD_TIMEOUT_MS, killSignal: "SIGKILL" });
  return { missing: false, status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
})();
let api = null;
let importFailure = null;
if (!PROBE.missing && PROBE.status === 0 && PROBE.stderr === "") {
  try { api = await import(pathToFileURL(SCRIPT).href); } catch (e) { importFailure = e; }
}
function exported(name) {
  assert.ok(!PROBE.missing, "no existe el script scripts/check-artifact.mjs (lo escribe constructor-logica en T2)");
  assert.ok(api, `no se pudo importar check-artifact.mjs sin efectos: ${importFailure?.message ?? PROBE.stderr}`);
  assert.equal(typeof api[name], "function", `check-artifact.mjs debe exportar ${name}`);
  return api[name];
}

function realList() {
  assert.ok(existsSync(LIST), "no existe scripts/forbidden-artifact-patterns.json (lo escribe constructor-logica en T2)");
  return JSON.parse(readFileSync(LIST, "utf8"));
}
let listForTitles = null;
try { listForTitles = JSON.parse(readFileSync(LIST, "utf8")); } catch { /* reported by the list tests */ }

// ---------------------------------------------------------------------------------------------
// Self-checks of the helpers above, against the output format of design §8.3 (they pass before T2).
// ---------------------------------------------------------------------------------------------
describe("[EP00-TBR-002-CA3] self-checks of the test helpers", () => {
  const SAMPLE_OUTPUT = [
    "ERROR  browser/vercel.json  · vercel-config · configuración de Vercel; el artefacto debe servir en cualquier hosting",
    `ERROR  ${MAIN_JS}:2  · private-key-block · -----B… (valor oculto)`,
    "ERROR  browser/.vercel/  · vercel-dir · carpeta de proyecto de Vercel",
    "ERROR  vercel.json  · vercel-config · configuración de Vercel",
    "check-artifact: 4 hallazgo(s) en 14 archivo(s) de dist/the-brain-front",
  ].join("\n");
  // The three regex rules of the minimum, as written in design §8.3 (assembled so no key-like text is committed).
  const PATTERNS = {
    "private-key-block": `${DASHES}${"BEG" + "IN"} (?:[A-Z0-9]+ )*PRIV${"ATE"} KEY${DASHES}`,
    "supabase-secret-key": "\\bsb_secret_[A-Za-z0-9_-]{20,}",
    "postgres-url-with-password": "postgres(?:ql)?://[^\\s:@/'\"`]+:[^\\s@/'\"`]+@",
  };

  test("[EP00-TBR-002-CA3] names() matches the path as a token, with an optional line and trailing slash", () => {
    assert.ok(names(SAMPLE_OUTPUT, "browser/vercel.json", "vercel-config"));
    assert.ok(names(SAMPLE_OUTPUT, "vercel.json", "vercel-config"));
    assert.ok(!names("ERROR  browser/vercel.json  · vercel-config", "vercel.json", "vercel-config"), "la raíz no debe confundirse con browser/");
    assert.ok(names(SAMPLE_OUTPUT, MAIN_JS, "private-key-block", 2));
    assert.ok(!names(SAMPLE_OUTPUT, MAIN_JS, "private-key-block", 3));
    assert.ok(names(SAMPLE_OUTPUT, "browser/.vercel", "vercel-dir"));
    assert.ok(!names(SAMPLE_OUTPUT, "browser/assets/vercel.json", "vercel-config"));
    assert.ok(!names(SAMPLE_OUTPUT, "browser/vercel.json", "netlify-config"), "la ruta y el id deben ir en la misma línea");
  });

  test("[EP00-TBR-002-CA3] minimumExceptionHits() catches an exception that tries to cover a rule of the minimum", () => {
    const ex = (rule) => ({ rule, path: "browser/vendor-*.js", reason: "caso sintético", decision: "DEC-0000" });
    assert.deepEqual(minimumExceptionHits({ exceptions: [ex("private-key-block"), ex("github-token"), ex("service-role-jwt")] }), ["private-key-block → browser/vendor-*.js", "service-role-jwt → browser/vendor-*.js"]);
    assert.deepEqual(minimumExceptionHits({ exceptions: [ex("github-token")] }), []);
    assert.deepEqual(minimumExceptionHits({}), []);
  });

  test("[EP00-TBR-002-CA3] the summary patterns read the format of §8.3", () => {
    assert.equal(Number(SUMMARY_RE.exec(SAMPLE_OUTPUT)?.[1]), 4);
    assert.equal(Number(CLEAN_RE.exec("check-artifact: 0 hallazgos en 4 archivo(s) de tmp/artifact-ab; listo para subir")?.[1]), 4);
  });

  test("[EP00-TBR-002-CA3] leakedPieces() allows a masked sample and catches a longer piece", () => {
    for (const t of TRIGGERS) assert.deepEqual(leakedPieces(SAMPLE_OUTPUT, t.value()), [], `${t.id}: la muestra enmascarada no es una fuga`);
    const secret = triggerOf("supabase-secret-key");
    assert.ok(leakedPieces(`x ${secret.slice(0, MAX_SHOWN + 1)}…`, secret).length > 0, "debe detectar más de MAX_SHOWN caracteres");
  });

  test("[EP00-TBR-002-CA3] the synthetic triggers have the shapes of §8.3 and the clean bundle has none", () => {
    for (const t of TRIGGERS.filter((x) => x.id in PATTERNS)) {
      assert.match(t.value(), new RegExp(PATTERNS[t.id], "u"), `${t.label} no tiene la forma de ${t.id}`);
    }
    const [head, body] = triggerOf("service-role-jwt").split(".");
    assert.ok(head.startsWith("eyJ") && body.startsWith("eyJ"), "el JWT sintético debe tener la forma eyJ….eyJ….…");
    assert.equal(JSON.parse(Buffer.from(body, "base64url").toString("utf8")).role, "service_role");
    const bundle = CLEAN_FILES()[MAIN_JS];
    for (const [id, source] of Object.entries(PATTERNS)) assert.doesNotMatch(bundle, new RegExp(source, "u"), `el control limpio no debe tener ${id}`);
    const roles = [...bundle.matchAll(/eyJ[\w-]*\.(eyJ[\w-]*)\.[\w-]+/g)].map((m) => JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")).role);
    assert.deepEqual(roles, ["anon"], "el control limpio solo lleva un JWT anon");
  });
});

// ---------------------------------------------------------------------------------------------
// Hostile inputs (round 1 · S1, round 2 · H-2, round 3 · N-1): only the scan is timed, never Node's start-up.
// ---------------------------------------------------------------------------------------------
const HOSTILE_LIMIT_MS = 2_000;
const HOSTILE_KILL_MS = 45_000;
// Runs scanArtifact with the real list in a child killed after `killMs` and times only the scan.
function timedScan(dir, title, killMs = HOSTILE_KILL_MS) {
  assert.ok(existsSync(SCRIPT), "no existe el script scripts/check-artifact.mjs");
  const code = [
    `const m = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)});`,
    `const list = m.loadPatternList(${JSON.stringify(LIST)});`,
    `const t0 = performance.now();`,
    `const findings = m.scanArtifact(${JSON.stringify(dir)}, list);`,
    `process.stdout.write(JSON.stringify({ ms: performance.now() - t0, findings }));`,
  ].join("\n");
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: FRONT, encoding: "utf8", timeout: killMs, killSignal: "SIGKILL", maxBuffer: 64 * 1024 * 1024 });
  if (r.status === null) assert.fail(`la revisión del archivo hostil (${title}) no terminó en ${killMs / 1000} s (señal ${r.signal}): la búsqueda no está acotada`);
  assert.equal(r.status, 0, `scanArtifact falló con el archivo hostil (${title})\nstderr: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------
describe("[EP00-TBR-002-CA3] check-artifact passes a clean artifact", () => {
  test("[EP00-TBR-002-CA3] exits 0 on a clean artifact that mentions providers in text and carries an anon JWT", () => {
    const files = CLEAN_FILES();
    const dir = makeArtifact();
    const r = scan(dir);
    assert.equal(r.status, 0, `un artefacto limpio debe pasar\n${r.output}`);
    const m = CLEAN_RE.exec(r.stdout);
    assert.ok(m, `falta en stdout «check-artifact: 0 hallazgos en N archivo(s) de <dir>; listo para subir»\n${r.output}`);
    assert.equal(Number(m[1]), Object.keys(files).length, `el conteo de archivos revisados no coincide\n${r.output}`);
    assert.doesNotMatch(r.stderr, /ERROR|hallazgo\(s\)/, `un artefacto limpio no escribe hallazgos en stderr\nstderr: ${r.stderr}`);
  });

  // Dev rule 1: N counts only files, never folders (empty, nested or hidden).
  test("[EP00-TBR-002-CA3] counts only files in N, not folders", () => {
    const extra = { "browser/assets/": "", "browser/assets/i18n/": "", "browser/.well-known/": "", "browser/media/a/b/logo.svg": "<svg/>\n" };
    const r = scan(makeArtifact(extra));
    assert.equal(r.status, 0, r.output);
    assert.equal(Number(CLEAN_RE.exec(r.stdout)?.[1]), Object.keys(CLEAN_FILES()).length + 1, `N debe contar solo archivos\n${r.output}`);
  });

  test("[EP00-TBR-002-CA3] counts only files in N when there are findings", () => {
    const r = scan(makeArtifact({ "browser/.vercel/project.json": "{}\n", "browser/assets/": "" }));
    assertFinding(r, "browser/.vercel", "vercel-dir");
    assert.equal(Number(SUMMARY_FILES_RE.exec(r.stderr)?.[1]), Object.keys(CLEAN_FILES()).length + 1, `N debe contar solo archivos\nstderr: ${r.stderr}`);
  });
});

describe("[EP00-TBR-002-CA3] forbidden names (mandatory minimum)", () => {
  // The L1 names are planted below, in every folder and spelling.
  for (const rule of MINIMUM.names.filter((r) => !L1_NAME_IDS.has(r.id))) {
    const path = `browser/${rule.name}`;
    test(`[EP00-TBR-002-CA3] fails and names ${path} with ${rule.id} when it is planted`, () => {
      const planted = rule.kind === "dir" ? { [`${path}/project.json`]: '{"projectId":"synthetic"}\n' } : { [path]: "synthetic=1\n" };
      const r = scan(makeArtifact(planted));
      assertFinding(r, path, rule.id);
    });
  }

  // R3 negative cases with vercel.json planted in other places and spellings.
  const VARIANTS = [
    ["nested in browser/assets/", { "browser/assets/vercel.json": "{}\n" }, "browser/assets/vercel.json", "vercel-config"],
    ["at the root of the artifact, outside browser/", { "vercel.json": "{}\n" }, "vercel.json", "vercel-config"],
    ["with mixed case (Vercel.JSON)", { "browser/Vercel.JSON": "{}\n" }, "browser/Vercel.JSON", "vercel-config"],
    ["as the .vercel/ folder with project.json", { "browser/.vercel/project.json": "{}\n" }, "browser/.vercel", "vercel-dir"],
    ["as an empty .vercel/ folder", { "browser/.vercel/": "" }, "browser/.vercel", "vercel-dir"],
  ];
  for (const [title, planted, path, id] of VARIANTS) {
    test(`[EP00-TBR-002-CA3] fails on vercel.json ${title}`, () => {
      assertFinding(scan(makeArtifact(planted)), path, id);
    });
  }

  // Dev rule 2: forbidden names do not distinguish upper and lower case, also with a "*" in the rule.
  const CASE_VARIANTS = [
    [".ENV at the root", { ".ENV": "A=1\n" }, ".ENV", "env-file"],
    ["NETLIFY.TOML", { "browser/NETLIFY.TOML": "[build]\n" }, "browser/NETLIFY.TOML", "netlify-config"],
    ["Firebase.Json", { "browser/assets/Firebase.Json": "{}\n" }, "browser/assets/Firebase.Json", "firebase-config"],
    ["a .VERCEL/ folder", { "browser/.VERCEL/project.json": "{}\n" }, "browser/.VERCEL", "vercel-dir"],
    ["WRANGLER.TOML (rule with *)", { "browser/WRANGLER.TOML": "name='x'\n" }, "browser/WRANGLER.TOML", "cloudflare-wrangler"],
    ["Cert.PEM (rule with *)", { "browser/assets/Cert.PEM": "x\n" }, "browser/assets/Cert.PEM", "pem-file"],
  ];
  for (const [title, planted, path, id] of CASE_VARIANTS) {
    test(`[EP00-TBR-002-CA3] forbidden names ignore case: fails on ${title}`, () => {
      assertFinding(scan(makeArtifact(planted)), path, id);
    });
  }

  test("[EP00-TBR-002-CA3] reports every finding and counts them in the summary", () => {
    const r = scan(makeArtifact({ "browser/vercel.json": "{}\n", "netlify.toml": "[build]\n", "browser/assets/notes.txt": `x\n${triggerOf("supabase-secret-key")}\n` }));
    assert.notEqual(r.status, 0);
    assert.ok(names(r.output, "browser/vercel.json", "vercel-config"), r.output);
    assert.ok(names(r.output, "netlify.toml", "netlify-config"), r.output);
    assert.ok(names(r.output, "browser/assets/notes.txt", "supabase-secret-key", 2), r.output);
    assert.equal(Number(SUMMARY_RE.exec(r.output)?.[1]), 3, `el resumen debe contar 3 hallazgos\n${r.output}`);
  });
});

describe("[EP00-TBR-002-CA3] every name rule of the real list fires", () => {
  const rules = listForTitles?.names ?? [];
  test("[EP00-TBR-002-CA3] the real list has name rules to plant", () => {
    assert.ok(realList().names?.length > 0, "la lista real no tiene reglas de nombre");
  });
  for (const rule of rules) {
    const base = String(rule.name ?? "").replaceAll("*", "synth");
    const path = `browser/assets/${base}`;
    test(`[EP00-TBR-002-CA3] ${rule.id} fires on ${path}`, () => {
      const planted = rule.kind === "dir" ? { [`${path}/state.json`]: "{}\n" } : { [path]: "synthetic=1\n" };
      assertFinding(scan(makeArtifact(planted)), path, rule.id);
    });
  }
});

describe("[EP00-TBR-002-CA3] forbidden contents (mandatory minimum)", () => {
  for (const t of TRIGGERS) {
    test(`[EP00-TBR-002-CA3] fails on ${t.id} (${t.label}) with its line and never prints the value in full`, () => {
      const secret = t.value();
      const r = scan(makeArtifact({ [MAIN_JS]: `/* synthetic bundle */\nconst k="${secret}";\nexport{k};\n` }));
      assertFinding(r, MAIN_JS, t.id, 2);
      const leaked = leakedPieces(r.output, secret);
      assert.deepEqual(leaked, [], `la salida muestra más de ${MAX_SHOWN} caracteres seguidos del secreto sintético`);
    });
  }

  test("[EP00-TBR-002-CA3] reviews contents outside browser/ (3rdpartylicenses.txt)", () => {
    const r = scan(makeArtifact({ "3rdpartylicenses.txt": `notice\n${triggerOf("private-key-block")}\n` }));
    assertFinding(r, "3rdpartylicenses.txt", "private-key-block", 2);
  });

  test("[EP00-TBR-002-CA3] reviews contents inside hidden folders", () => {
    const r = scan(makeArtifact({ "browser/.cache/blob.txt": `${triggerOf("postgres-url-with-password")}\n` }));
    assertFinding(r, "browser/.cache/blob.txt", "postgres-url-with-password", 1);
  });

  test("[EP00-TBR-002-CA3] counts lines right with CRLF line endings", () => {
    const r = scan(makeArtifact({ "browser/assets/notes.txt": `one\r\ntwo\r\n${triggerOf("postgres-url-with-password")}\r\n` }));
    assertFinding(r, "browser/assets/notes.txt", "postgres-url-with-password", 3);
  });

  test("[EP00-TBR-002-CA3] finds a secret at the end of a 20 MB one-line minified bundle", () => {
    const secret = triggerOf("supabase-secret-key");
    const r = scan(makeArtifact({ "browser/chunk-SYNTH0002.js": `${"var a=1;".repeat(2_500_000)}const k="${secret}";` }));
    assertFinding(r, "browser/chunk-SYNTH0002.js", "supabase-secret-key", 1);
    assert.deepEqual(leakedPieces(r.output, secret), [], "la salida no muestra el secreto");
  });

  // Round 1 · S1 (security finding): the JWT search must stay linear. ~200 KB of "eyJ" made the regex quadratic
  // (~11 s), and a 2 MB bundle would block CI. timedScan (defined at module level, see «Hostile inputs» below) runs
  // scanArtifact in a child and times only the scan, so the 2 s bound leaves a wide margin for a slow CI runner.
  // Round 2 · H-2/Q12 adds ~2 MB of "eyJ." repeated: every dotted triple is a JWT candidate, so testing each one
  // without skipping must stay linear.
  const HOSTILE = [
    ["~210 KB of repeated eyJ", () => "eyJ".repeat(70_000)],
    ["~210 KB of repeated eyJ split by one dot", () => `${"eyJ".repeat(35_000)}.${"eyJ".repeat(35_000)}`],
    ["~2 MB of repeated eyJ.", () => "eyJ.".repeat(500_000)],
  ];
  for (const [title, hostile] of HOSTILE) {
    test(`[EP00-TBR-002-CA3] reviews a hostile file (${title}) in under 2 s and still finds the service_role JWT after it`, () => {
      const path = "browser/chunk-HOSTILE.js";
      const dir = makeArtifact({ [path]: `${hostile()}\nconst k="${triggerOf("service-role-jwt")}";\n` });
      const { ms, findings } = timedScan(dir, title);
      assert.deepEqual(findings.map((f) => `${f.path}:${f.line}|${f.rule}`), [`${path}:2|service-role-jwt`], `el resultado debe ser exacto: ${JSON.stringify(findings)}`);
      assert.ok(ms < HOSTILE_LIMIT_MS, `revisar el archivo hostil (${title}) tardó ${Math.round(ms)} ms; el límite es ${HOSTILE_LIMIT_MS} ms (la búsqueda de JWT debe ser lineal)`);
    });
  }

  // Round 2 · H-2/Q12: the same ~2 MB of "eyJ." glued by a dot to a service_role JWT on the same line. 500 000 is not a
  // multiple of 3, so a search that skips two parts after a failed candidate lands past the JWT header and misses it.
  test("[EP00-TBR-002-CA3] H-2: finds a service_role JWT glued after ~2 MB of eyJ. on the same line, in under 2 s", () => {
    const path = "browser/chunk-HOSTILE.js";
    const secret = triggerOf("service-role-jwt");
    const { ms, findings } = timedScan(makeArtifact({ [path]: `${"eyJ.".repeat(500_000)}${secret}\n` }), "eyJ. glued to the JWT");
    assert.deepEqual(findings.map((f) => `${f.path}:${f.line}|${f.rule}`), [`${path}:1|service-role-jwt`], `el JWT service_role pegado tras la corrida de eyJ. debe detectarse: ${JSON.stringify(findings)}`);
    assert.ok(findings[0].sample.startsWith(secret.slice(0, 6)), `sample debe empezar donde empieza el JWT: ${JSON.stringify(findings[0])}`);
    assert.deepEqual(leakedPieces(JSON.stringify(findings), secret), [], "sample no puede mostrar el secreto");
    assert.ok(ms < HOSTILE_LIMIT_MS, `revisar el archivo hostil tardó ${Math.round(ms)} ms; el límite es ${HOSTILE_LIMIT_MS} ms (la búsqueda de JWT debe ser lineal)`);
  });

  // Round 2 · H-2/Q12 (security H-2, quality Q12): a failed candidate must not hide the JWT that starts inside it.
  // "eyJa.eyJb.<jwt>" and "a.eyJfoo.<jwt>" are found on their own line; the same prefixes before an anon JWT give nothing.
  test("[EP00-TBR-002-CA3] H-2: finds a service_role JWT hidden after eyJa.eyJb. and after a.eyJfoo., each on its exact line", () => {
    const scanArtifact = exported("scanArtifact");
    const list = exported("loadPatternList")(LIST);
    const secret = triggerOf("service-role-jwt");
    const anon = jwt({ iss: "supabase", ref: "synthetictestref", role: "anon", iat: 1700000000, exp: 2000000000 });
    const lead1 = `${"eyJ" + "a"}.${"eyJ" + "b"}.`;
    const lead2 = `a.${"eyJ" + "foo"}.`;
    const lines = ["/* synthetic */", `const k="${lead1}${secret}";`, `const a="${lead1}${anon}";`, `const h="${lead2}${secret}";`, `const b="${lead2}${anon}";`];
    const findings = scanArtifact(makeArtifact({ [MAIN_JS]: `${lines.join("\n")}\n` }), list);
    assert.deepEqual(findings.map((f) => `${f.path}:${f.line}|${f.rule}`), [2, 4].map((n) => `${MAIN_JS}:${n}|service-role-jwt`), `se esperaba el JWT service_role en las líneas 2 y 4 y nada más: ${JSON.stringify(findings)}`);
    for (const f of findings) assert.ok(f.sample.startsWith(secret.slice(0, 6)), `sample debe empezar donde empieza el JWT: ${JSON.stringify(f)}`);
    assert.deepEqual(leakedPieces(JSON.stringify(findings), secret), [], "sample no puede mostrar el secreto");
  });

  // Round 2 re-review: the fix of H-2 skips decoding payloads too short to hold {"role":"<role>"}. The shortest JSON
  // payload with role service_role is 23 bytes, 31 base64url characters; it and the next lengths (32 and 34 characters)
  // must still be found, so the shortcut can never cut a real one. The shortest anon payload gives nothing (control).
  test("[EP00-TBR-002-CA3] finds a service_role JWT with the shortest possible payload (31, 32 and 34 characters) and nothing for a minimal anon one", () => {
    const scanArtifact = exported("scanArtifact");
    const list = exported("loadPatternList")(LIST);
    const header = b64url({ alg: "HS256", typ: "JWT" });
    const signature = "c3ludGhldGlj" + "Q".repeat(31);
    const raw = (json) => [header, Buffer.from(json).toString("base64url"), signature].join(".");
    const role = "service" + "_role";
    const payloads = [`{"role":"${role}"}`, `{"role":"${role}"} `, `{"role":"${role}"}  `];
    assert.deepEqual(payloads.map((p) => Buffer.from(p).toString("base64url").length), [31, 32, 34], "autocomprobación: las cargas deben medir 31, 32 y 34 caracteres");
    for (const p of payloads) assert.equal(JSON.parse(p).role, role, "autocomprobación: cada carga es JSON válido con el rol");
    const secrets = payloads.map(raw);
    const lines = ["/* synthetic */", ...secrets.map((s, n) => `const k${n}="${s}";`), `const a="${raw('{"role":"anon"}')}";`];
    const findings = scanArtifact(makeArtifact({ [MAIN_JS]: `${lines.join("\n")}\n` }), list);
    assert.deepEqual(findings.map((f) => `${f.path}:${f.line}|${f.rule}`), [2, 3, 4].map((n) => `${MAIN_JS}:${n}|service-role-jwt`), `se esperaba el JWT service_role mínimo en las líneas 2, 3 y 4 y nada más: ${JSON.stringify(findings)}`);
    for (const secret of secrets) assert.deepEqual(leakedPieces(JSON.stringify(findings), secret), [], "sample no puede mostrar el secreto");
  });

  // Round 1 re-review · S1: the linear JWT search splits runs of token characters at the dots, so it must still find a
  // service_role JWT that is not alone in its run: after a dotted prefix, after an anon JWT joined by a dot, and glued
  // after word characters. The sample must start where the JWT starts (offsets inside the run).
  test("[EP00-TBR-002-CA3] finds a service_role JWT inside a dotted run, right after an anon JWT and glued after word characters", () => {
    const scanArtifact = exported("scanArtifact");
    const list = exported("loadPatternList")(LIST);
    const secret = triggerOf("service-role-jwt");
    const anon = jwt({ iss: "supabase", ref: "synthetictestref", role: "anon", iat: 1700000000, exp: 2000000000 });
    const lines = ["/* synthetic */", `cfg.api.${secret};`, `const k="${anon}.${secret}";`, `const h="Bearer_${secret}";`, `const a="${anon}";`];
    const findings = scanArtifact(makeArtifact({ [MAIN_JS]: `${lines.join("\n")}\n` }), list);
    assert.deepEqual(findings.map((f) => `${f.path}:${f.line}|${f.rule}`), [2, 3, 4].map((n) => `${MAIN_JS}:${n}|service-role-jwt`), `se esperaba el JWT service_role en las líneas 2, 3 y 4 y nada más: ${JSON.stringify(findings)}`);
    for (const f of findings) assert.ok(f.sample.startsWith(secret.slice(0, 6)), `sample debe empezar donde empieza el JWT: ${JSON.stringify(f)}`);
    assert.deepEqual(leakedPieces(JSON.stringify(findings), secret), [], "sample no puede mostrar el secreto");
  });

  test("[EP00-TBR-002-CA3] reviews contents of binary files", () => {
    const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0xff]), Buffer.from(`\n${triggerOf("service-role-jwt")}\n`), Buffer.from([0, 1, 2])]);
    const r = scan(makeArtifact({ "browser/media/logo.png": bytes }));
    assertFinding(r, "browser/media/logo.png", "service-role-jwt");
  });
});

// ---------------------------------------------------------------------------------------------
// Round 1, phase a2 · L1 (S4 and S5): list extension approved by the PO. Synthetic triggers assembled at runtime.
// ---------------------------------------------------------------------------------------------
const pgpBlock = (kind) =>
  [`${DASHES}${"BEG" + "IN"} PGP ${kind} KEY BLOCK${DASHES}`, "", "lQ" + "U3ludGhldGljVGVzdE9ubHk".repeat(3), `${DASHES}${"EN" + "D"} PGP ${kind} KEY BLOCK${DASHES}`].join("\n");
const wrapInString = (s) => `const k="${s}";`;
// `secret` is what the output may not show; `line` is the text planted on line 2 of the bundle.
const L1_TRIGGERS = [
  { id: "npm-token", label: "an npm_ token (npm_ + 36 alphanumerics)", value: () => "np" + "m_" + "SyntheticNpmToken" + "0".repeat(19) },
  { id: "anthropic-api-key", label: "an sk-ant- key", value: () => "sk" + "-ant-" + "api03-" + "SyntheticAnthropicTestValue" + "Q".repeat(60) + "-" + "x".repeat(6) + "AA" },
  { id: "ai-provider-secret-key", label: "a legacy sk- key (sk- + 48 alphanumerics)", value: () => "sk" + "-" + "SyntheticOpenAiTestValue" + "0".repeat(24) },
  { id: "ai-provider-secret-key", label: "a project sk-proj- key with _ and -", value: () => "sk" + "-proj-" + "Synthetic_Project-Key" + "Z".repeat(100) },
  { id: "ai-provider-secret-key", label: "an sk- key at the minimum length (32 characters after sk-)", value: () => "sk" + "-" + "Synth32" + "0".repeat(25) },
  { id: "private-key-block", label: "a PGP private key block (fix)", value: () => pgpBlock("PRIV" + "ATE") },
  { id: "google-api-key", label: "a Google key that ends in - right before a quote (fix of the final \\b)", value: () => "AI" + "za" + "SyntheticGoogleKey" + "0".repeat(16) + "-" },
  { id: "github-token", label: "a GitHub token glued after a word character (fix)", value: () => "gh" + "p_" + "SyntheticGitHubToken" + "0".repeat(16), line: (s) => `const k="TOKEN_${s}";` },
  { id: "github-token", label: "a GitHub token glued before a word character (fix)", value: () => "gh" + "p_" + "SyntheticGitHubToken" + "0".repeat(16), line: (s) => `const k="${s}x1";` },
].map((t) => ({ line: wrapInString, ...t }));
// Near misses that must keep giving 0 findings, before and after the extension. "sk-" is short, so the rule needs
// at least 32 characters after "sk-" and no letter or digit right before "s" (task-…, disk-…).
const NEAR_MISS_JS = () =>
  [
    "/* synthetic near misses */",
    `const cls=["task-list","disk-usage","task-list-item-checkbox-container-with-long-suffix","disk-usage-indicator-progress-bar-segment-label"];`,
    `const env=["npm_config_registry","npm_package_version","npm_lifecycle_event"];`,
    `const short=["sk-short-1234","${"sk" + "-" + "Synth31" + "0".repeat(24)}","ghp_short","AIzaShort"];`,
    `const pub=${JSON.stringify(pgpBlock("PUB" + "LIC"))};`,
    `const sig="${DASHES}${"BEG" + "IN"} PGP SIGNATURE${DASHES}";`,
    "export{cls,env,short,pub,sig};",
  ].join("\n");
const NEAR_MISS_NAMES = ["browser/worker-SYNTH0003.js", "browser/assets/routes.json", "browser/assets/snow.json", "browser/assets/npmrc.txt"];

describe("[EP00-TBR-002-CA3] list extension approved by the PO (L1: S4 contents and fixes, S5 names)", () => {
  // One feasible reading of each rule, used only to prove the synthetic data has the intended shape. The list may use
  // other patterns as long as the tests below pass.
  const REFERENCE = {
    "npm-token": /\bnpm_[A-Za-z0-9]{36}/u,
    "anthropic-api-key": /(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{32,}/u,
    "ai-provider-secret-key": /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{32,}/u,
    "private-key-block": new RegExp(`${DASHES}${"BEG" + "IN"} (?:[A-Z0-9]+ )*PRIV${"ATE"} KEY(?: BLOCK)?${DASHES}`, "u"),
    "google-api-key": /AIza[0-9A-Za-z_-]{35}/u,
    "github-token": /gh[pousr]_[A-Za-z0-9]{36}/u,
  };
  // The two patterns as they stand on d46985c, to prove the fixes target their boundaries.
  const CURRENT = {
    "google-api-key": /\bAIza[0-9A-Za-z_-]{35}\b/u,
    "github-token": /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})\b/u,
  };

  test("[EP00-TBR-002-CA3] self-check: the L1 triggers have the intended shapes and the near misses have none", () => {
    for (const t of L1_TRIGGERS) assert.match(t.line(t.value()), REFERENCE[t.id], `${t.label} no tiene la forma de ${t.id}`);
    assert.match(L1_TRIGGERS[0].value(), /^npm_[A-Za-z0-9]{36}$/u, "el token npm_ debe tener 36 alfanuméricos");
    assert.match(L1_TRIGGERS[2].value(), /^sk-[A-Za-z0-9]{48}$/u, "la llave sk- clásica debe tener 48 alfanuméricos");
    assert.equal(L1_TRIGGERS[4].value().length - "sk-".length, 32, "la llave sk- mínima debe tener 32 caracteres tras sk-");
    for (const t of L1_TRIGGERS.filter((x) => x.id in CURRENT)) {
      assert.doesNotMatch(t.line(t.value()), CURRENT[t.id], `${t.label}: el patrón actual ya lo detecta, el caso no prueba el ajuste`);
    }
    for (const [id, re] of Object.entries(REFERENCE)) assert.doesNotMatch(NEAR_MISS_JS(), re, `los casos cercanos no deben tener la forma de ${id}`);
    assert.ok(NEAR_MISS_JS().includes(`${"BEG" + "IN"} PGP PUB`), "el control lleva un bloque PGP público");
  });

  for (const rule of L1_NAMES) {
    const paths = [rule.samples[0], `browser/${rule.samples[1]}`, `browser/assets/i18n/${rule.samples[2]}`];
    test(`[EP00-TBR-002-CA3] S5: ${rule.id} (${rule.name}) fires by name in any folder and ignoring case: ${paths.join(", ")}`, () => {
      const r = scan(makeArtifact(Object.fromEntries(paths.map((p) => [p, "synthetic=1\n"]))));
      for (const path of paths) assertFinding(r, path, rule.id);
    });
  }

  for (const t of L1_TRIGGERS) {
    test(`[EP00-TBR-002-CA3] S4: fails on ${t.id} (${t.label}) with its line and never prints the value in full`, () => {
      const secret = t.value();
      const r = scan(makeArtifact({ [MAIN_JS]: `/* synthetic bundle */\n${t.line(secret)}\nexport{k};\n` }));
      assertFinding(r, MAIN_JS, t.id, 2);
      assert.deepEqual(leakedPieces(r.output, secret), [], `la salida muestra más de ${MAX_SHOWN} caracteres seguidos del secreto sintético`);
    });
  }

  test("[EP00-TBR-002-CA3] S4 control: task-list, disk-usage, npm_config_*, short sk- strings and a PGP public block give 0 findings", () => {
    const r = scan(makeArtifact({ "browser/chunk-NEARMISS.js": NEAR_MISS_JS() }));
    assert.equal(r.status, 0, `los casos cercanos no son secretos y deben pasar\n${r.output}`);
    assert.match(r.stdout, CLEAN_RE, r.output);
  });

  test("[EP00-TBR-002-CA3] S5 control: worker-*.js, routes.json, snow.json and npmrc.txt give 0 findings", () => {
    const r = scan(makeArtifact(Object.fromEntries(NEAR_MISS_NAMES.map((p) => [p, "export{};\n"]))));
    assert.equal(r.status, 0, `estos nombres no están prohibidos y deben pasar\n${r.output}`);
    assert.match(r.stdout, CLEAN_RE, r.output);
  });
});

// ---------------------------------------------------------------------------------------------
// Round 2 · H-3/Q13 and Q10 (docs/estado/EP00-TBR-002.md, «re-revisión v1»). Written before the fix, on 21d254f.
// ---------------------------------------------------------------------------------------------
const R2_GOOGLE = () => "AI" + "za" + "SyntheticGoogleKey" + "0".repeat(17); // AIza + 35
const R2_AWS = () => "AK" + "IA" + "SYNTHETICTEST" + "012"; // AKIA + 16
const R2_STRIPE = () => "sk" + "_live_" + "SyntheticStripeKey" + "0".repeat(6); // sk_live_ + 24
// H-3: keys glued to another word. `line` is the text planted on line 2 of the bundle.
const R2_GLUED = [
  { id: "google-api-key", label: "KEY_AIza… (glued after an underscore)", value: R2_GOOGLE, line: (s) => `const k="KEY_${s}";` },
  { id: "google-api-key", label: "xAIza… (glued after a letter)", value: R2_GOOGLE, line: (s) => `const k="x${s}";` },
  { id: "aws-access-key-id", label: "K_AKIA… (glued after an underscore)", value: R2_AWS, line: (s) => `const k="K_${s}";` },
  { id: "aws-access-key-id", label: "AKIA… followed by an alphanumeric", value: R2_AWS, line: (s) => `const k="${s}x";` },
  { id: "stripe-secret-key", label: "xsk_live_… (glued after a letter)", value: R2_STRIPE, line: (s) => `const k="x${s}";` },
  { id: "stripe-secret-key", label: "sk_live_…_x (followed by _x)", value: R2_STRIPE, line: (s) => `const k="${s}_x";` },
];
// H-3 near misses: prefixes cut short, bodies one character short and AKIA inside a long word without the right
// length. 0 findings before and after the fix.
const R2_NEAR_MISS_JS = () =>
  [
    "/* synthetic near misses */",
    `const g=["${"AI" + "z" + "SyntheticGoogleKey" + "0".repeat(18)}","${"AI" + "za" + "SyntheticGoogleKey" + "0".repeat(16)}","KEY_${"AI" + "za" + "Short"}"];`,
    `const a=["${"K" + "IA" + "SYNTHETICTEST" + "0123"}","${"AK" + "IA" + "SYNTHETICTEST" + "01"}","K_${"AK" + "IA" + "SYNTHETICTEST" + "01"}","MAKIAVELLIANSCHEMEsAndPlots","AKIAVELLIAN","${"AK" + "IA"}bcdefghijklmnopq"];`,
    `const s=["${"k" + "_live_" + "SyntheticStripeKey" + "0".repeat(6)}","${"sk" + "_live_" + "SyntheticStripeKey0"}","x${"sk" + "_live_" + "SyntheticStripeKey0"}","sk_lives","risk_level"];`,
    "export{g,a,s};",
  ].join("\n");

// Q10: "sk-ant-" plus 28 to 31 characters. Expected id: ai-provider-secret-key. Reason: anthropic-api-key keeps the
// 32-character minimum the PO approved in L1, and these strings already have the shape of ai-provider-secret-key
// ("sk-" plus at least 32 characters: "ant-" and 28 more); what hides them is only its exclusion of "sk-ant-". The fix
// proposed in the re-review, (?!ant-[A-Za-z0-9_-]{32,}), gives exactly that: from 28 characters on, one finding.
const skAnt = (n) => "sk" + "-ant-" + "Synth" + "0".repeat(n - 5);

describe("[EP00-TBR-002-CA3] round 2: keys glued to another word (H-3/Q13) and short sk-ant- (Q10)", () => {
  // The three patterns as they stand on 21d254f, to prove each case targets a boundary of the current rule.
  const CURRENT = {
    "google-api-key": /\bAIza[0-9A-Za-z_-]{35}/u,
    "aws-access-key-id": /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u,
    "stripe-secret-key": /\b[sr]k_(?:live|test)_[0-9A-Za-z]{20,}\b/u,
  };
  // The loosest reading, with no boundary at all. The glued cases must have this shape and the near misses must not,
  // so the controls hold whatever boundary the fix keeps. Note: "xAIza…" and "xsk_live_…" are glued after a letter, so
  // the (?<![A-Za-z0-9]) recommended by the security review would still miss them; only "K_AKIA…" allows it.
  const REFERENCE = {
    "google-api-key": /AIza[0-9A-Za-z_-]{35}/u,
    "aws-access-key-id": /(?:AKIA|ASIA)[0-9A-Z]{16}/u,
    "stripe-secret-key": /[sr]k_(?:live|test)_[0-9A-Za-z]{20,}/u,
  };

  test("[EP00-TBR-002-CA3] self-check: the H-3 cases escape the current patterns, and the near misses and Q10 have the intended shapes", () => {
    for (const t of R2_GLUED) {
      assert.doesNotMatch(t.line(t.value()), CURRENT[t.id], `${t.label}: el patrón actual ya lo detecta, el caso no prueba el ajuste`);
      assert.match(t.line(t.value()), REFERENCE[t.id], `${t.label} no tiene la forma de ${t.id}`);
    }
    assert.match(R2_GOOGLE(), /^AIza[0-9A-Za-z_-]{35}$/u);
    assert.match(R2_AWS(), /^AKIA[0-9A-Z]{16}$/u);
    assert.match(R2_STRIPE(), /^sk_live_[0-9A-Za-z]{24}$/u);
    for (const [id, re] of Object.entries(REFERENCE)) {
      assert.doesNotMatch(R2_NEAR_MISS_JS(), re, `los casos cercanos no deben tener la forma de ${id}`);
      assert.doesNotMatch(R2_NEAR_MISS_JS(), CURRENT[id], `los casos cercanos no deben tener la forma actual de ${id}`);
    }
    for (const n of [28, 29, 30, 31]) assert.equal(skAnt(n).length - "sk-ant-".length, n);
  });

  for (const t of R2_GLUED) {
    test(`[EP00-TBR-002-CA3] H-3: fails on ${t.id} glued to another word: ${t.label}, with its line and never the value in full`, () => {
      const secret = t.value();
      const r = scan(makeArtifact({ [MAIN_JS]: `/* synthetic bundle */\n${t.line(secret)}\nexport{k};\n` }));
      assertFinding(r, MAIN_JS, t.id, 2);
      assert.deepEqual(leakedPieces(r.output, secret), [], `la salida muestra más de ${MAX_SHOWN} caracteres seguidos del secreto sintético`);
    });
  }

  test("[EP00-TBR-002-CA3] H-3 control: prefixes cut short, bodies one character short and AKIA inside a long word without the right length give 0 findings", () => {
    const r = scan(makeArtifact({ "browser/chunk-NEARMISS2.js": R2_NEAR_MISS_JS() }));
    assert.equal(r.status, 0, `los casos cercanos no son secretos y deben pasar\n${r.output}`);
    assert.match(r.stdout, CLEAN_RE, r.output);
  });

  test("[EP00-TBR-002-CA3] Q10: sk-ant- followed by 28 to 31 characters is one ai-provider-secret-key finding per line", () => {
    const scanArtifact = exported("scanArtifact");
    const list = exported("loadPatternList")(LIST);
    const sizes = [28, 29, 30, 31];
    const lines = ["/* synthetic */", ...sizes.map((n, i) => `const k${i}="${skAnt(n)}";`)];
    const findings = scanArtifact(makeArtifact({ [MAIN_JS]: `${lines.join("\n")}\n` }), list);
    assert.deepEqual(findings.map((f) => `${f.line}|${f.rule}`), sizes.map((_, i) => `${i + 2}|ai-provider-secret-key`), `cada sk-ant- corta debe dar un solo hallazgo de ai-provider-secret-key: ${JSON.stringify(findings)}`);
    for (const n of sizes) assert.deepEqual(leakedPieces(JSON.stringify(findings), skAnt(n)), [], "sample no puede mostrar el secreto");
  });

  test("[EP00-TBR-002-CA3] Q10 control: sk-ant- followed by 32 or more characters is only anthropic-api-key (no double finding)", () => {
    const scanArtifact = exported("scanArtifact");
    const list = exported("loadPatternList")(LIST);
    const sizes = [32, 33, 40, 95];
    const lines = ["/* synthetic */", ...sizes.map((n, i) => `const k${i}="${skAnt(n)}";`)];
    const findings = scanArtifact(makeArtifact({ [MAIN_JS]: `${lines.join("\n")}\n` }), list);
    assert.deepEqual(findings.map((f) => `${f.line}|${f.rule}`), sizes.map((_, i) => `${i + 2}|anthropic-api-key`), `cada sk-ant- larga debe dar un solo hallazgo, de anthropic-api-key: ${JSON.stringify(findings)}`);
  });
});

// ---------------------------------------------------------------------------------------------
// Round 3 · N-1, N-2/Q16 (docs/estado/EP00-TBR-002.md, «re-revisión v2»). Written before the fix, on 8cc6fac.
// ---------------------------------------------------------------------------------------------
// One synthetic trigger per content rule of the real list, planted alone on its line (assembled at runtime).
const L1_VALUE = (id) => L1_TRIGGERS.find((t) => t.id === id).value();
const TRIGGER_BY_RULE = {
  "private-key-block": () => pemBlock("PRIV" + "ATE"),
  "service-role-jwt": () => triggerOf("service-role-jwt"),
  "supabase-secret-key": () => triggerOf("supabase-secret-key"),
  "supabase-service-role-env": () => "SUPABASE_" + "SERVICE_ROLE_KEY",
  "vercel-token-env": () => "VERCEL_" + "TOKEN",
  "postgres-url-with-password": () => triggerOf("postgres-url-with-password"),
  "github-token": () => "gh" + "p_" + "SyntheticGitHubToken" + "0".repeat(16),
  "aws-access-key-id": R2_AWS,
  "stripe-secret-key": R2_STRIPE,
  "slack-token": () => "xo" + "xb-" + "Synthetic" + "0".repeat(10),
  "google-api-key": R2_GOOGLE,
  "npm-token": () => L1_VALUE("npm-token"),
  "anthropic-api-key": () => L1_VALUE("anthropic-api-key"),
  "ai-provider-secret-key": () => L1_VALUE("ai-provider-secret-key"),
};
// N-1: hostile inputs of about 2 MB per content rule of the real list: repeated prefixes, long near misses and runs
// with no closing. `expect` is the exact result of the hostile line alone (line 1) with the whole list. Each test also
// plants the rule's trigger on line 2, so the review must still find it right after the hostile line.
const BEGIN = `${DASHES}${"BEG" + "IN"} `;
const HOSTILE_BY_RULE = {
  "private-key-block": [
    ["a BEGIN header followed by ~1 M words and no PRIVATE KEY", () => BEGIN + "A ".repeat(1_000_000), []],
    ["the BEGIN header repeated", () => BEGIN.repeat(190_000), []],
  ],
  "service-role-jwt": [
    ["eyJa. repeated (parts too short to hold a role)", () => "eyJa.".repeat(400_000), []],
    ["a dotted triple with a ~2 MB payload that is not JSON", () => `eyJa.eyJ${"A".repeat(2_000_000)}.c2ln`, []],
  ],
  "supabase-secret-key": [
    ["sb_secret_ with 19 characters, repeated (one short)", () => (`sb_${"secret_"}${"x".repeat(19)} `).repeat(70_000), []],
    ["-sb_secret_ repeated (one run, one key-shaped match)", () => `-sb_${"secret_"}`.repeat(190_000), ["supabase-secret-key"]],
  ],
  "supabase-service-role-env": [
    ["SUPABASE_SERVICE_ROLE_ repeated (no closing boundary)", () => `SUPABASE_${"SERVICE_ROLE_"}`.repeat(95_000), []],
    ["SUPABASE_SERVICE_ROLE_KEYx repeated", () => ` SUPABASE_${"SERVICE_ROLE_KEY"}x`.repeat(80_000), []],
  ],
  "vercel-token-env": [
    ["VERCEL_OIDC_TOKENx repeated", () => ` VERCEL_${"OIDC_TOKEN"}x`.repeat(105_000), []],
    ["VERCEL_ repeated", () => "VERCEL_".repeat(285_000), []],
  ],
  "postgres-url-with-password": [
    ["a postgres URL whose password never closes with @", () => `postgres${"://"}a:${"b:".repeat(1_000_000)}`, []],
    ["postgresql:// repeated", () => `postgresql${"://"}`.repeat(150_000), []],
    ["a postgres URL whose user never closes with :", () => `postgres${"://"}${"a".repeat(2_000_000)}`, []],
  ],
  "github-token": [
    ["github_pat_ with 59 characters, repeated (one short)", () => (`github_${"pat_"}${"a".repeat(59)}-`).repeat(29_000), []],
    ["ghp_ repeated", () => `gh${"p_"}`.repeat(500_000), []],
  ],
  "aws-access-key-id": [
    ["AKIA repeated (only the first one has a boundary before it)", () => `AK${"IA"}`.repeat(500_000), ["aws-access-key-id"]],
    ["AKIA with 15 characters, repeated (one short)", () => (`AK${"IA"}${"A".repeat(15)}-`).repeat(100_000), []],
  ],
  "stripe-secret-key": [
    ["sk_live_ repeated", () => `sk${"_live_"}`.repeat(250_000), []],
    ["rk_test_ with 19 characters, repeated (one short)", () => (`rk${"_test_"}${"a".repeat(19)}-`).repeat(75_000), []],
  ],
  "slack-token": [
    ["xoxb- repeated (one run, one token-shaped match)", () => `xo${"xb-"}`.repeat(400_000), ["slack-token"]],
    ["xoxb- with 9 characters, repeated (one short)", () => (` xo${"xb-"}${"a".repeat(9)}.`).repeat(130_000), []],
  ],
  "google-api-key": [
    ["AIza repeated (~50 000 key-shaped matches on one line)", () => `AI${"za"}`.repeat(500_000), ["google-api-key"]],
    ["AIza with 34 characters, repeated (one short)", () => (`AI${"za"}${"a".repeat(34)}.`).repeat(52_000), []],
  ],
  "npm-token": [
    ["npm_ repeated", () => `np${"m_"}`.repeat(500_000), []],
    ["npm_ with 35 characters, repeated (one short)", () => (`-np${"m_"}${"a".repeat(35)}_`).repeat(50_000), []],
  ],
  "anthropic-api-key": [
    // Q10: "sk-ant-" plus 31 characters is not anthropic-api-key but is ai-provider-secret-key (sk- plus 35).
    ["sk-ant- with 31 characters, repeated (Q10: ai-provider-secret-key, ~52 000 matches)", () => (`sk${"-ant-"}${"a".repeat(31)} `).repeat(52_000), ["ai-provider-secret-key"]],
    ["sk-ant- with 24 characters, repeated", () => (`-sk${"-ant-"}${"a".repeat(24)} `).repeat(60_000), []],
  ],
  "ai-provider-secret-key": [
    // N-1 (security re-review: 19.8 s with 0.5 MB). The run is one anthropic-api-key; its last "sk-" is followed by
    // "ant-" and 28 more characters, so by Q10 it is also one ai-provider-secret-key on the same line.
    ["sk-ant- repeated (N-1)", () => `sk${"-ant-"}`.repeat(300_000), ["anthropic-api-key", "ai-provider-secret-key"]],
    ["sk- with 31 characters, repeated (one short)", () => (`-sk${"-"}${"a".repeat(31)}.`).repeat(55_000), []],
  ],
};
// A failing hostile test fails in at most this time, even on the quadratic version (the limit itself stays 2 s).
const R3_KILL_MS = 20_000;

describe("[EP00-TBR-002-CA3] round 3 · N-1: every content rule of the real list reviews a ~2 MB hostile input in under 2 s", () => {
  test("[EP00-TBR-002-CA3] N-1: every content rule of the real list has a trigger and hostile inputs here (a new rule must add its own)", () => {
    const ids = (realList().contents ?? []).map((r) => r.id);
    assert.deepEqual(ids.filter((id) => !(id in HOSTILE_BY_RULE) || !(id in TRIGGER_BY_RULE)), [], "cada regla de contenido de la lista real necesita un disparador y casos hostiles en esta prueba");
    assert.deepEqual(Object.keys(HOSTILE_BY_RULE).filter((id) => !ids.includes(id)), [], "hay casos hostiles para reglas que ya no están en la lista");
  });

  test("[EP00-TBR-002-CA3] N-1 self-check: hostile inputs measure about 2 MB and each trigger has the shape of its rule", () => {
    const list = realList();
    for (const [id, cases] of Object.entries(HOSTILE_BY_RULE)) {
      for (const [title, make] of cases) {
        const n = make().length;
        assert.ok(n >= 1_900_000 && n <= 2_200_000, `${id} · ${title}: mide ${n} caracteres; deben ser unos 2 MB`);
        assert.ok(!make().includes("\n"), `${id} · ${title}: el caso hostil debe ir en una sola línea`);
      }
      const rule = list.contents.find((r) => r.id === id);
      if (rule?.kind === "regex") assert.match(TRIGGER_BY_RULE[id](), new RegExp(rule.pattern, "u"), `el disparador de ${id} no tiene la forma de la regla`);
    }
  });

  for (const [id, cases] of Object.entries(HOSTILE_BY_RULE)) {
    for (const [title, make, expect] of cases) {
      test(`[EP00-TBR-002-CA3] N-1: ${id} · ${title}: reviewed in under 2 s with the exact result, and the ${id} trigger on the next line is still found`, () => {
        const path = "browser/chunk-HOSTILE.js";
        const trigger = TRIGGER_BY_RULE[id]();
        const dir = makeArtifact({ [path]: `${make()}\nconst k="${trigger}";\n` });
        const { ms, findings } = timedScan(dir, `${id} · ${title}`, R3_KILL_MS);
        const got = findings.map((f) => `${f.path}:${f.line}|${f.rule}`).sort();
        const want = [...expect.map((r) => `${path}:1|${r}`), `${path}:2|${id}`].sort();
        assert.deepEqual(got, want, `${id} · ${title}: el resultado debe ser exacto: ${JSON.stringify(findings)}`);
        assert.deepEqual(leakedPieces(JSON.stringify(findings), trigger), [], "sample no puede mostrar el secreto");
        assert.ok(ms < HOSTILE_LIMIT_MS, `${id} · ${title}: la revisión tardó ${Math.round(ms)} ms; el límite es ${HOSTILE_LIMIT_MS} ms`);
      });
    }
  }

  // Every match used to cost a count of the lines before it, so ~50 000 matches in 2 MB grow as matches × size. One
  // finding per rule and line stays the result; the time must stay linear for every rule at once.
  test("[EP00-TBR-002-CA3] N-1: ~2 MB of every trigger repeated on one line gives one finding per content rule, in under 2 s", () => {
    const path = "browser/chunk-DENSE.js";
    const ids = realList().contents.map((r) => r.id);
    const header = pemBlock("PRIV" + "ATE").split("\n")[0];
    const unit = `${ids.map((id) => (id === "private-key-block" ? header : TRIGGER_BY_RULE[id]())).join(" ")} `;
    const line = unit.repeat(Math.ceil(2_000_000 / unit.length));
    const { ms, findings } = timedScan(makeArtifact({ [path]: `${line}\n` }), "dense triggers", R3_KILL_MS);
    assert.deepEqual(findings.map((f) => `${f.path}:${f.line}|${f.rule}`).sort(), ids.map((id) => `${path}:1|${id}`).sort(), `se esperaba un hallazgo por regla en la línea 1: ${JSON.stringify(findings.slice(0, 20))}`);
    assert.ok(ms < HOSTILE_LIMIT_MS, `la revisión de ${line.length} caracteres con todas las reglas repetidas tardó ${Math.round(ms)} ms; el límite es ${HOSTILE_LIMIT_MS} ms`);
  });
});

// N-2/Q16: aws-access-key-id gets a leading boundary that excludes [A-Za-z0-9+/] before AKIA, so a base64 blob (WASM,
// fonts, images inlined in a bundle) does not give false positives. The dev accepted losing "xAKIA…" (glued after a
// letter); "K_AKIA…", "AKIA…x" and a quoted "AKIA…" are still found.
const AWS_BODY = () => "SYNTHETICTEST" + "012";
const AWS_IN_BASE64 = [
  ["a synthetic base64 blob ending in …AUEEah right before AKIA", (k) => `const b="AGFzbQEAAAABBgFgAX8BfwMCAQAHBwEDcnVu${"AUEEah"}${k}Bx9+/a0Q==";`],
  ["a letter before AKIA: xAKIA… (the dev accepted losing it)", (k) => `const k="x${k}";`],
  ["a digit before AKIA", (k) => `const k="9${k}";`],
  ["a + before AKIA", (k) => `const k="QUJD+${k}";`],
  ["a / before AKIA", (k) => `const k="QUJD/${k}";`],
  ["a / before ASIA", (_, s) => `const k="QUJD/${s}";`],
];
const AWS_KEPT = [
  ["K_AKIA… (after an underscore)", (k) => `const k="K_${k}";`],
  ["AKIA…x (followed by a letter)", (k) => `const k="${k}x";`],
  ['a quoted "AKIA…"', (k) => `const k="${k}";`],
  ["AKIA… at the start of a line", (k) => `${k};`],
  ["ASIA… after a space", (_, s) => `key: ${s}`],
];

describe("[EP00-TBR-002-CA3] round 3 · N-2/Q16: aws-access-key-id does not fire inside base64", () => {
  const akia = () => "AK" + "IA" + AWS_BODY();
  const asia = () => "AS" + "IA" + AWS_BODY();
  const CURRENT = /(?:AKIA|ASIA)[0-9A-Z]{16}/u; // the rule as it stands on 8cc6fac

  test("[EP00-TBR-002-CA3] N-2 self-check: every base64 case matches the current rule, so each one proves the fix", () => {
    assert.match(akia(), /^AKIA[0-9A-Z]{16}$/u);
    for (const [title, line] of [...AWS_IN_BASE64, ...AWS_KEPT]) assert.match(line(akia(), asia()), CURRENT, `${title}: no tiene la forma de la regla actual`);
  });

  test("[EP00-TBR-002-CA3] N-2: AKIA or ASIA right after a letter, a digit, + or / (base64, including xAKIA… that the dev accepted losing) gives 0 findings", () => {
    const scanArtifact = exported("scanArtifact");
    const list = exported("loadPatternList")(LIST);
    const lines = ["/* synthetic base64 */", ...AWS_IN_BASE64.map(([, line]) => line(akia(), asia()))];
    const findings = scanArtifact(makeArtifact({ [MAIN_JS]: `${lines.join("\n")}\n` }), list);
    assert.deepEqual(findings.map((f) => `${f.line}|${f.rule}`), [], `AKIA pegado a [A-Za-z0-9+/] es base64, no una llave: ${JSON.stringify(findings)}`);
  });

  test("[EP00-TBR-002-CA3] N-2 control: K_AKIA…, AKIA…x, a quoted AKIA…, AKIA… at the start of a line and ASIA… after a space are one finding each", () => {
    const scanArtifact = exported("scanArtifact");
    const list = exported("loadPatternList")(LIST);
    const lines = ["/* synthetic */", ...AWS_KEPT.map(([, line]) => line(akia(), asia()))];
    const findings = scanArtifact(makeArtifact({ [MAIN_JS]: `${lines.join("\n")}\n` }), list);
    assert.deepEqual(findings.map((f) => `${f.line}|${f.rule}`), AWS_KEPT.map((_, i) => `${i + 2}|aws-access-key-id`), `cada llave AWS con límite debe seguir siendo un hallazgo: ${JSON.stringify(findings)}`);
    assert.deepEqual(leakedPieces(JSON.stringify(findings), akia()), [], "sample no puede mostrar la llave");
  });
});

// ---------------------------------------------------------------------------------------------
// Round 3 re-review · H-4 (fixed on 0eb5fc9): the line of a finding comes from the positions of "\n" and a binary search.
// Lines are counted by "\n" only, as grep -n and git count them: CRLF is one break and a lone "\r" is none, as before
// H-4. Written after the fix; each case kills a mutant of the line count that the suite let live (an off-by-one upper
// bound, adjacent "\n" skipped, a lone "\r" counted, and the quadratic count that H-4 replaced).
// ---------------------------------------------------------------------------------------------
describe("[EP00-TBR-002-CA3] round 3 re-review · H-4: exact line numbers, counted by line feeds, in linear time", () => {
  const trigger = (id) => (id === "private-key-block" ? pemBlock("PRIV" + "ATE").split("\n")[0] : TRIGGER_BY_RULE[id]());

  test("[EP00-TBR-002-CA3] H-4: CRLF, a lone CR, no final newline, first and last line, blank lines, several matches on one line, rules out of order and an empty file", () => {
    const scanArtifact = exported("scanArtifact");
    const list = exported("loadPatternList")(LIST);
    const ids = ["vercel-token-env", "github-token", "postgres-url-with-password", "supabase-secret-key", "aws-access-key-id", "service-role-jwt", "private-key-block"];
    const [vt, gh, pg, sb, aws, sr, pk] = ids.map(trigger);
    // path -> [content, expected "line|rule" of that file]
    const CASES = {
      "browser/lines/crlf.txt": [`one\r\ntwo\r\n${pg}\r\n${vt}\r\n`, ["3|postgres-url-with-password", "4|vercel-token-env"]],
      "browser/lines/lone-cr.txt": [`one\rtwo\r${pg}\r${vt}\n${sb}\rx`, ["1|postgres-url-with-password", "1|vercel-token-env", "2|supabase-secret-key"]],
      "browser/lines/no-final-newline.txt": [`one\ntwo\n${vt}`, ["3|vercel-token-env"]],
      "browser/lines/first-and-only.txt": [gh, ["1|github-token"]],
      "browser/lines/blank-lines.txt": [`\n\n${vt}\n\n\n${vt}\n`, ["3|vercel-token-env", "6|vercel-token-env"]],
      "browser/lines/several-per-line.txt": [`${vt} ${vt} ${gh} ${vt}\n${gh} ${vt}`, ["1|vercel-token-env", "1|github-token", "2|github-token", "2|vercel-token-env"]],
      "browser/lines/out-of-order.txt": [
        [gh, vt, `${sr} ${gh}`, "", `${vt} ${sr} ${aws}`, `${pk} ${sb}`].join("\n"),
        ["1|github-token", "2|vercel-token-env", "3|service-role-jwt", "3|github-token", "5|vercel-token-env", "5|service-role-jwt", "5|aws-access-key-id", "6|private-key-block", "6|supabase-secret-key"],
      ],
      "browser/lines/lf-cr.txt": [`a\n\r${vt}\n\r\n${vt}`, ["2|vercel-token-env", "4|vercel-token-env"]],
      "browser/lines/empty.txt": ["", []],
    };
    const files = Object.fromEntries(Object.entries(CASES).map(([path, [content]]) => [path, content]));
    const got = scanArtifact(makeArtifact(files), list).map((f) => `${f.path}:${f.line}|${f.rule}`).sort();
    const want = Object.entries(CASES).flatMap(([path, [, lines]]) => lines.map((l) => `${path}:${l}`)).sort();
    assert.deepEqual(got, want, `las líneas se cuentan por «\\n» y deben ser exactas: ${JSON.stringify(got)}`);
  });

  // Every finding used to cost a count of all the lines before it: 8cc6fac took ~1.2 s for 10 000 findings on 10 000
  // lines and grows with the square (about a minute for the case below). Until now the suite only had findings on one line.
  test("[EP00-TBR-002-CA3] H-4: ~2 MB with one finding on each of its 64 000 lines reports every line, exact, in under 2 s", () => {
    const path = "browser/chunk-LINES.js";
    const ids = ["vercel-token-env", "supabase-service-role-env", "github-token", "aws-access-key-id", "slack-token"];
    const triggers = ids.map(trigger);
    const n = 64_000;
    const body = Array.from({ length: n }, (_, i) => `k${i % ids.length}="${triggers[i % ids.length]}";`).join("\n");
    assert.ok(body.length >= 1_900_000 && body.length <= 2_200_000, `autocomprobación: el archivo mide ${body.length} caracteres; deben ser unos 2 MB`);
    const { ms, findings } = timedScan(makeArtifact({ [path]: `${body}\n` }), "one finding per line", R3_KILL_MS);
    const got = findings.map((f) => `${f.path}:${f.line}|${f.rule}`).sort();
    const want = Array.from({ length: n }, (_, i) => `${path}:${i + 1}|${ids[i % ids.length]}`).sort();
    const first = want.findIndex((w, i) => got[i] !== w);
    assert.equal(first, -1, `cada línea debe dar su hallazgo con su número exacto; primera diferencia: se esperaba ${want[first]} y llegó ${got[first]}`);
    assert.equal(got.length, n, `se esperaban ${n} hallazgos y llegaron ${got.length}`);
    assert.ok(ms < HOSTILE_LIMIT_MS, `la revisión de ${n} líneas con un hallazgo cada una tardó ${Math.round(ms)} ms; el límite es ${HOSTILE_LIMIT_MS} ms`);
  });
});

// Round 3 re-review · finding Q18 (low, open since d46985c): a run of about 5.6 M characters or more right after a key
// prefix overflows the regex backtracking stack of V8 in the rules with an open quantifier ({20,}, {32,}, (…)*), and the
// script dies with a RangeError trace instead of a finding. It still exits 1, so the artifact is never uploaded. This
// test pins only that it fails closed; any fix (bounded quantifiers, or a finding per failed rule) keeps it green.
describe("[EP00-TBR-002-CA3] round 3 re-review · Q18: a key-shaped run of several MB fails closed", () => {
  test("[EP00-TBR-002-CA3] Q18: a ~8 MB key-shaped run (sb_secret_ and 8 M characters) still fails the review and is never ready to upload", () => {
    const r = scan(makeArtifact({ "browser/chunk-LONGRUN.js": `/* synthetic */\nconst k="${"sb_" + "secret_"}${"a".repeat(8_000_000)}";\n` }));
    assert.equal(r.status, 1, `una corrida con forma de llave debe hacer fallar la revisión\n${r.output.slice(0, 2_000)}`);
    assert.doesNotMatch(r.output, /listo para subir/, `un artefacto con una llave nunca está listo para subir\n${r.output.slice(0, 2_000)}`);
    assert.ok(!r.output.includes("a".repeat(MAX_SHOWN + 1)), "la salida no puede mostrar el valor");
  });
});

describe("[EP00-TBR-002-CA3] check-artifact fails closed", () => {
  const MISSING_CASES = [
    ["a folder that does not exist", () => join(makeDir(), "does-not-exist")],
    ["an empty folder", () => makeDir()],
    ["a folder without browser/index.html", () => makeArtifact({ [MAIN_JS]: "export{};\n", "3rdpartylicenses.txt": "x\n" }, { clean: false })],
  ];
  for (const [title, dirOf] of MISSING_CASES) {
    test(`[EP00-TBR-002-CA3] fails with a Spanish message and no stack trace on ${title}`, () => {
      const r = scan(dirOf());
      assert.equal(r.status, 1, `un artefacto ausente o vacío nunca pasa: código 1\n${r.output}`);
      assert.match(r.stderr, /No existe el artefacto en .+; corre npm run build/, `falta en stderr «No existe el artefacto en <dir>; corre npm run build»\n${r.output}`);
      assert.doesNotMatch(r.output, STACK_TRACE_RE, `no debe terminar con una traza\n${r.output}`);
      assert.doesNotMatch(r.output, /listo para subir/, r.output);
    });
  }

  // Each case carries a dirty artifact when it can, to prove that nothing was reviewed.
  const USAGE_CASES = [
    ["an unknown option", () => ["--unknown"]],
    ["--dir without a value", () => ["--dir"]],
    ["an option to swap the pattern list", () => ["--list", join(makeDir(), "empty.json"), "--dir", makeArtifact({ "browser/vercel.json": "{}\n" })]],
    ["an unknown option after a valid --dir", () => ["--dir", makeArtifact({ "browser/vercel.json": "{}\n" }), "--unknown"]],
    ["a positional argument", () => [makeArtifact({ "browser/vercel.json": "{}\n" })]],
  ];
  for (const [title, argsOf] of USAGE_CASES) {
    test(`[EP00-TBR-002-CA3] rejects ${title} with usage on stderr and reviews nothing`, () => {
      const r = check(argsOf());
      assert.equal(r.status, 1, `debe rechazar los argumentos con el código 1\n${r.output}`);
      assert.match(r.stderr, /--dir/, `stderr debe mostrar el uso (con --dir)\nstderr: ${r.stderr}`);
      assert.doesNotMatch(r.output, /hallazgo/, `no debe revisar nada\n${r.output}`);
      assert.doesNotMatch(r.output, /vercel-config/, `no debe revisar nada\n${r.output}`);
      assert.doesNotMatch(r.stderr, STACK_TRACE_RE, `el rechazo no debe ser una traza\n${r.stderr}`);
    });
  }

  // The list path is fixed next to the script, so a broken list is tested on a copy of the script under tmp/:
  // <copy>/scripts/check-artifact.mjs, <copy>/scripts/forbidden-artifact-patterns.json and the default
  // <copy>/dist/the-brain-front/ (no --dir), dirty on purpose to prove that nothing is reviewed.
  function copyWithList(listText) {
    const root = makeDir("list-");
    mkdirSync(join(root, "scripts"));
    copyFileSync(SCRIPT, join(root, "scripts", "check-artifact.mjs"));
    if (listText !== undefined) writeFileSync(join(root, "scripts", "forbidden-artifact-patterns.json"), listText);
    const dist = join(root, "dist", "the-brain-front");
    for (const [path, content] of Object.entries({ ...CLEAN_FILES(), "browser/vercel.json": "{}\n" })) {
      mkdirSync(dirname(join(dist, path)), { recursive: true });
      writeFileSync(join(dist, path), content);
    }
    const r = spawnSync(process.execPath, [join(root, "scripts", "check-artifact.mjs")], { cwd: root, encoding: "utf8", timeout: CHILD_TIMEOUT_MS, killSignal: "SIGKILL" });
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", output: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
  }

  test("[EP00-TBR-002-CA3] the copy with the real list reviews the default dist/the-brain-front/ (control)", () => {
    assert.ok(existsSync(SCRIPT), "no existe el script scripts/check-artifact.mjs");
    assertFinding(copyWithList(readFileSync(LIST, "utf8")), "browser/vercel.json", "vercel-config");
  });

  const BAD_LISTS = [
    ["a missing list", undefined],
    ["a list that is not JSON", "{ names: [ "],
    ["a list with empty names", JSON.stringify({ ...listForTitles, names: [] })],
    ["a list with an exception on a name rule", JSON.stringify({ ...listForTitles, exceptions: [{ rule: "vercel-config", path: "browser/vercel.json", reason: "caso sintético", decision: "DEC-0000" }] })],
  ];
  for (const [title, listText] of BAD_LISTS) {
    test(`[EP00-TBR-002-CA3] fails with exit code 1 on ${title} and reviews nothing`, () => {
      assert.ok(existsSync(SCRIPT), "no existe el script scripts/check-artifact.mjs");
      const r = copyWithList(listText);
      assert.equal(r.status, 1, r.output);
      assert.match(r.stderr, /lista de patrones prohibidos/, `stderr debe explicar en español el problema de la lista\nstderr: ${r.stderr}`);
      assert.doesNotMatch(r.output, /vercel-config ·|hallazgo\(s\)|listo para subir/, `con una lista inválida no se revisa nada\n${r.output}`);
      assert.doesNotMatch(r.output, STACK_TRACE_RE, r.output);
    });
  }

  test("[EP00-TBR-002-CA3] fails on a symlinked file inside the artifact", (t) => {
    const outside = join(makeDir("outside-"), "target.js");
    writeFileSync(outside, "export{};\n");
    const dir = makeArtifact();
    try { symlinkSync(outside, join(dir, "browser", "linked.js")); } catch (e) { t.skip(`no se pueden crear enlaces simbólicos aquí: ${e.code}`); return; }
    assertFinding(scan(dir), "browser/linked.js", "symlink");
  });

  test("[EP00-TBR-002-CA3] fails on a symlinked folder and does not follow it", (t) => {
    const outside = makeDir("outside-");
    writeFileSync(join(outside, "vercel.json"), "{}\n");
    const dir = makeArtifact();
    try { symlinkSync(outside, join(dir, "browser", "linked"), "dir"); } catch (e) { t.skip(`no se pueden crear enlaces simbólicos aquí: ${e.code}`); return; }
    const r = scan(dir);
    assertFinding(r, "browser/linked", "symlink");
    assert.doesNotMatch(r.output, /browser\/linked\/vercel\.json/, `no debe seguir el enlace\n${r.output}`);
  });

  test("[EP00-TBR-002-CA3] fails on a file it cannot read", (t) => {
    if (process.platform === "win32" || process.getuid?.() === 0) { t.skip("sin permisos POSIX o corriendo como root"); return; }
    const dir = makeArtifact({ "browser/locked.js": "export{};\n" });
    const locked = join(dir, "browser", "locked.js");
    chmodSync(locked, 0o000);
    try {
      assertFinding(scan(dir), "browser/locked.js", "unreadable");
    } finally {
      chmodSync(locked, 0o644);
    }
  });

  // Round 1 · S3 (security finding): FIFOs, sockets and devices are neither files nor folders. They must not be
  // skipped in silence: each one is an «unsupported-type» finding. Only through the CLI, so a script that tried to
  // read the FIFO would hit the child timeout instead of hanging this process.
  test("[EP00-TBR-002-CA3] fails with unsupported-type on a FIFO inside the artifact instead of skipping it", (t) => {
    if (process.platform === "win32") { t.skip("mkfifo no existe en Windows"); return; }
    const dir = makeArtifact();
    const fifo = spawnSync("mkfifo", [join(dir, "browser", "pipe")], { encoding: "utf8" });
    if (fifo.error || fifo.status !== 0) { t.skip(`no se pudo crear un FIFO aquí: ${fifo.error?.code ?? fifo.stderr}`); return; }
    assertFinding(scan(dir), "browser/pipe", "unsupported-type");
  });

  // Round 1 · S2 (security finding): the entry guard compared process.argv[1] with the module path without resolving
  // symlinks, so a call through a symlinked path exited 0 without reviewing anything (fails open). Both cases carry a
  // dirty artifact: exit 0 here means nothing was reviewed.
  const runScript = (scriptPath, args, cwd) => {
    const r = spawnSync(process.execPath, [scriptPath, ...args], { cwd, encoding: "utf8", timeout: CHILD_TIMEOUT_MS, killSignal: "SIGKILL" });
    if (r.status === null) assert.fail(`check-artifact.mjs no terminó (señal ${r.signal}, límite ${CHILD_TIMEOUT_MS / 1000} s)`);
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", output: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
  };

  test("[EP00-TBR-002-CA3] runs the review when invoked through a symlinked folder (copy under tmp/, dirty default dist)", (t) => {
    if (process.platform === "win32") { t.skip("los enlaces simbólicos en Windows piden permisos especiales"); return; }
    assert.ok(existsSync(SCRIPT), "no existe el script scripts/check-artifact.mjs");
    const base = makeDir("guard-");
    const real = join(base, "real");
    mkdirSync(join(real, "scripts"), { recursive: true });
    copyFileSync(SCRIPT, join(real, "scripts", "check-artifact.mjs"));
    copyFileSync(LIST, join(real, "scripts", "forbidden-artifact-patterns.json"));
    const dist = join(real, "dist", "the-brain-front");
    for (const [path, content] of Object.entries({ ...CLEAN_FILES(), "browser/vercel.json": "{}\n" })) {
      mkdirSync(dirname(join(dist, path)), { recursive: true });
      writeFileSync(join(dist, path), content);
    }
    try { symlinkSync(real, join(base, "link"), "dir"); } catch (e) { t.skip(`no se pueden crear enlaces simbólicos aquí: ${e.code}`); return; }
    const r = runScript(join(base, "link", "scripts", "check-artifact.mjs"), [], base);
    assertFinding(r, "browser/vercel.json", "vercel-config");
  });

  test("[EP00-TBR-002-CA3] runs the review when the script file itself is reached through a symlink", (t) => {
    if (process.platform === "win32") { t.skip("los enlaces simbólicos en Windows piden permisos especiales"); return; }
    assert.ok(existsSync(SCRIPT), "no existe el script scripts/check-artifact.mjs");
    const link = join(makeDir("guard-"), "check-artifact.mjs");
    try { symlinkSync(SCRIPT, link, "file"); } catch (e) { t.skip(`no se pueden crear enlaces simbólicos aquí: ${e.code}`); return; }
    const r = runScript(link, ["--dir", makeArtifact({ "browser/vercel.json": "{}\n" })], FRONT);
    assertFinding(r, "browser/vercel.json", "vercel-config");
  });
});

describe("[EP00-TBR-002-CA3] the real pattern list", () => {
  test("[EP00-TBR-002-CA3] exists, parses as JSON and has names, contents and exceptions", () => {
    const list = realList();
    for (const key of ["names", "contents", "exceptions"]) assert.ok(Array.isArray(list[key]), `la lista debe tener el arreglo «${key}»`);
  });

  test("[EP00-TBR-002-CA3] contains the mandatory minimum copied in this test (R3)", () => {
    const list = realList();
    const missing = [];
    for (const want of MINIMUM.names) {
      const got = (list.names ?? []).find((r) => r.id === want.id);
      if (!got || got.kind !== want.kind || got.name !== want.name) missing.push(`names/${want.id} (${want.kind} ${want.name})`);
    }
    for (const want of MINIMUM.contents) {
      const got = (list.contents ?? []).find((r) => r.id === want.id);
      if (!got || got.kind !== want.kind || (want.role && got.role !== want.role)) missing.push(`contents/${want.id} (${want.kind}${want.role ? ` ${want.role}` : ""})`);
    }
    assert.deepEqual(missing, [], `falta el mínimo obligatorio en forbidden-artifact-patterns.json: ${missing.join(", ")}`);
  });

  test("[EP00-TBR-002-CA3] no exception weakens a rule of the mandatory minimum", () => {
    const hits = minimumExceptionHits(realList());
    assert.deepEqual(hits, [], `hay excepciones sobre reglas del mínimo: ${hits.join(", ")}`);
  });

  test("[EP00-TBR-002-CA3] loadPatternList reads it and validatePatternList finds no errors", () => {
    const loadPatternList = exported("loadPatternList");
    const validatePatternList = exported("validatePatternList");
    const list = loadPatternList(LIST);
    assert.deepEqual(list, realList(), "loadPatternList debe devolver el contenido de la lista");
    assert.deepEqual(validatePatternList(list), [], "la lista real no debe tener errores");
  });
});

describe("[EP00-TBR-002-CA3] validatePatternList rejects invalid lists", () => {
  const KEY_PATTERN = () => `${DASHES}${"BEG" + "IN"} (?:[A-Z0-9]+ )*PRIV${"ATE"} KEY${DASHES}`;
  const validList = () => ({
    version: 1,
    names: [
      { id: "vercel-config", kind: "file", name: "vercel.json", reason: "configuración de Vercel" },
      { id: "vercel-dir", kind: "dir", name: ".vercel", reason: "carpeta de proyecto de Vercel" },
    ],
    contents: [
      { id: "private-key-block", kind: "regex", pattern: KEY_PATTERN(), reason: "llave privada" },
      { id: "service-role-jwt", kind: "jwt-role", role: "service_role", reason: "llave service_role de Supabase" },
    ],
    exceptions: [],
  });
  const exception = (fields) => ({ rule: "private-key-block", path: "browser/vendor-*.js", reason: "caso sintético", decision: "DEC-0000", ...fields });

  test("[EP00-TBR-002-CA3] accepts a valid list, with and without a well-formed exception (control)", () => {
    const validatePatternList = exported("validatePatternList");
    assert.deepEqual(validatePatternList(validList()), [], "una lista válida no debe tener errores");
    const withException = { ...validList(), exceptions: [exception({})] };
    assert.deepEqual(validatePatternList(withException), [], "una excepción bien formada sobre una regla de contenido es válida");
  });

  const INVALID = [
    ["empty names", (l) => { l.names = []; }],
    ["missing names", (l) => { delete l.names; }],
    ["empty contents", (l) => { l.contents = []; }],
    ["a repeated id inside names", (l) => { l.names.push({ ...l.names[0] }); }],
    ["a repeated id across names and contents", (l) => { l.contents[1].id = "vercel-config"; }],
    ["a name rule without reason", (l) => { delete l.names[0].reason; }],
    ["a content rule without reason", (l) => { delete l.contents[0].reason; }],
    ["an unknown name kind", (l) => { l.names[0].kind = "glob"; }],
    ["an unknown content kind", (l) => { l.contents[0].kind = "substring"; }],
    ["a regex that does not compile", (l) => { l.contents[0].pattern = "(unclosed"; }],
    ["an exception on a name rule", (l) => { l.exceptions = [exception({ rule: "vercel-config" })]; }],
    ["an exception on an unknown id", (l) => { l.exceptions = [exception({ rule: "no-such-rule" })]; }],
    ["an exception with path *", (l) => { l.exceptions = [exception({ path: "*" })]; }],
    ["an exception with path **", (l) => { l.exceptions = [exception({ path: "**" })]; }],
    ["an exception with path **/*", (l) => { l.exceptions = [exception({ path: "**/*" })]; }],
    ["an exception without reason", (l) => { l.exceptions = [exception({ reason: undefined })]; delete l.exceptions[0].reason; }],
    ["an exception without decision", (l) => { l.exceptions = [exception({ decision: undefined })]; delete l.exceptions[0].decision; }],
    ["an exception with path */**", (l) => { l.exceptions = [exception({ path: "*/**" })]; }],
    ["an exception with path **/**", (l) => { l.exceptions = [exception({ path: "**/**" })]; }],
    ["an exception with path ** wrapped in spaces", (l) => { l.exceptions = [exception({ path: " ** " })]; }],
    ["an exception with an empty path", (l) => { l.exceptions = [exception({ path: "" })]; }],
    ["an exception with an empty decision", (l) => { l.exceptions = [exception({ decision: " " })]; }],
    ["an exception that is not an object", (l) => { l.exceptions = ["private-key-block"]; }],
    ["exceptions that are not an array", (l) => { l.exceptions = { rule: "private-key-block" }; }],
    ["an exception on a name rule of the minimum (env-file)", (l) => { l.names.push({ id: "env-file", kind: "file", name: ".env", reason: "archivo de entorno" }); l.exceptions = [exception({ rule: "env-file", path: "browser/.env" })]; }],
    ["a jwt-role rule without role", (l) => { delete l.contents[1].role; }],
    ["a regex rule without pattern", (l) => { delete l.contents[0].pattern; }],
    ["a name rule without name", (l) => { delete l.names[0].name; }],
    ["an empty list object", (l) => { Object.keys(l).forEach((k) => delete l[k]); }],
  ];
  for (const [title, breakList] of INVALID) {
    test(`[EP00-TBR-002-CA3] reports ${title}`, () => {
      const validatePatternList = exported("validatePatternList");
      const list = validList();
      breakList(list);
      const errors = validatePatternList(list);
      assert.ok(Array.isArray(errors), "validatePatternList debe devolver la lista de errores");
      assert.ok(errors.length >= 1, `se esperaba al menos un error para: ${title}`);
    });
  }

  // Round 1 · S6/Q2 (approved by the dev): an exception must name the files it exempts. Rule pinned here:
  // (a) the last segment of the path may not contain "**", and (b) its name, read before the first "." (a leading "."
  // aside), must have at least one literal character other than "*". So "*.js", "*.*", "*", "**" and an empty last
  // segment are too broad, while "vendor-*.js", "*-vendor.js" and "vendor.min.js" name a file.
  const BROAD_EXCEPTIONS = ["**/*.js", "browser/**", "*.*", "**/*.*", "browser/*", "**/*.min.js", "browser/vendor**", "browser/.*", "browser/vendor/"];
  for (const path of BROAD_EXCEPTIONS) {
    test(`[EP00-TBR-002-CA3] rejects a broad exception path (last segment without a literal name before its first dot, or with **): ${path}`, () => {
      const validatePatternList = exported("validatePatternList");
      const errors = validatePatternList({ ...validList(), exceptions: [exception({ path })] });
      assert.ok(Array.isArray(errors) && errors.length >= 1, `la excepción «${path}» exime demasiado y debe rechazarse; errores: ${JSON.stringify(errors)}`);
    });
  }
  const NARROW_EXCEPTIONS = ["browser/vendor-*.js", "browser/**/vendor.js", "**/main-*.js", "browser/*-vendor.js", "browser/vendor.min.js", "browser/vendor/**/lib-*.js"];
  for (const path of NARROW_EXCEPTIONS) {
    test(`[EP00-TBR-002-CA3] accepts a narrow exception path whose last segment names a file (control): ${path}`, () => {
      const validatePatternList = exported("validatePatternList");
      assert.deepEqual(validatePatternList({ ...validList(), exceptions: [exception({ path })] }), [], `la excepción acotada «${path}» debe aceptarse`);
    });
  }

  // Round 2 · H-1 (security re-review; new rule approved by the dev): rule (b) gets stricter. The name of the last
  // segment (before its first ".", a leading "." aside) must hold a run of at least 3 characters [A-Za-z0-9] in a row.
  // Rule (a) stays: no "**" in the last segment. Every NARROW_EXCEPTIONS and EXCEPTION_SEMANTICS path above already
  // meets it ("lib-*.js" has exactly 3), so none of them changes.
  const H1_BROAD = ["**/*-*.js", "**/*-*.*", "**/*e*", "browser/*-*.*", "browser/a*b.js", "browser/ab-*.js", "browser/a-b-c-*.js", "browser/a_b_c-*.js", "browser/.ab*"];
  for (const path of H1_BROAD) {
    test(`[EP00-TBR-002-CA3] H-1: rejects an exception whose name has no run of 3 characters [A-Za-z0-9]: ${path}`, () => {
      const validatePatternList = exported("validatePatternList");
      const errors = validatePatternList({ ...validList(), exceptions: [exception({ path })] });
      assert.ok(Array.isArray(errors) && errors.length >= 1, `la excepción «${path}» casi no nombra archivos y debe rechazarse; errores: ${JSON.stringify(errors)}`);
    });
  }
  // Controls: boundary cases at exactly 3 characters pass, and rule (a) still rejects "**" even next to a long name.
  const H1_NARROW = ["browser/abc-*.js", "browser/*-a1B*.js"];
  for (const path of H1_NARROW) {
    test(`[EP00-TBR-002-CA3] H-1 control: accepts an exception whose name holds exactly 3 characters [A-Za-z0-9] in a row: ${path}`, () => {
      const validatePatternList = exported("validatePatternList");
      assert.deepEqual(validatePatternList({ ...validList(), exceptions: [exception({ path })] }), [], `la excepción acotada «${path}» debe aceptarse`);
    });
  }
  for (const path of ["browser/vendor-**.js", "browser/**vendor.js"]) {
    test(`[EP00-TBR-002-CA3] H-1 control: rule (a) still rejects ** in the last segment next to a long name: ${path}`, () => {
      const validatePatternList = exported("validatePatternList");
      const errors = validatePatternList({ ...validList(), exceptions: [exception({ path })] });
      assert.ok(Array.isArray(errors) && errors.length >= 1, `la excepción «${path}» lleva «**» en el último tramo y debe rechazarse; errores: ${JSON.stringify(errors)}`);
    });
  }

  // Round 2 · Q14: paths are matched as written against "browser/…" relative paths with no trim, so an exception with
  // spaces around it, or that starts with "/" or "./", never matches and must be rejected instead of accepted in silence.
  const NEVER_MATCHING = [" browser/vendor-*.js", "browser/vendor-*.js ", "/browser/vendor-*.js", "./browser/vendor-*.js"];
  for (const path of NEVER_MATCHING) {
    test(`[EP00-TBR-002-CA3] Q14: rejects an exception path that can never match: «${path}»`, () => {
      const validatePatternList = exported("validatePatternList");
      const errors = validatePatternList({ ...validList(), exceptions: [exception({ path })] });
      assert.ok(Array.isArray(errors) && errors.length >= 1, `la excepción «${path}» nunca coincide con una ruta del artefacto y debe rechazarse; errores: ${JSON.stringify(errors)}`);
    });
  }

  // Round 3 · N-4/Q17: more paths that can never match a relative "browser/…" path, written before the fix on 8cc6fac.
  // Each last segment names a file (3 alphanumerics in a row), so only the new rule can reject them: a "\", an empty
  // segment ("//"), a "." or ".." segment, or a leading "dist/" (the path is relative to dist/the-brain-front/).
  const N4_NEVER_MATCHING = [
    ["a backslash", "browser\\vendor-*.js"],
    ["a backslash between folders", "browser\\lazy/vendor-*.js"],
    ["an empty segment (//)", "browser//vendor-*.js"],
    ["a . segment in the middle", "browser/./vendor-*.js"],
    ["a leading .. segment", "../main-*.js"],
    ["a .. segment in the middle", "browser/../main-*.js"],
    ["a leading dist/ (the most likely mistake)", "dist/the-brain-front/browser/main-*.js"],
    ["a leading dist/ with **", "dist/**/main-*.js"],
  ];
  for (const [title, path] of N4_NEVER_MATCHING) {
    test(`[EP00-TBR-002-CA3] N-4: rejects an exception path that can never match, with ${title}: «${path}»`, () => {
      const validatePatternList = exported("validatePatternList");
      const errors = validatePatternList({ ...validList(), exceptions: [exception({ path })] });
      assert.ok(Array.isArray(errors) && errors.length >= 1, `la excepción «${path}» nunca coincide con una ruta del artefacto y debe rechazarse; errores: ${JSON.stringify(errors)}`);
    });
  }
  // Controls: upper case stays allowed (paths are case sensitive, that is not a form error), and a folder or name that
  // only starts with a dot, or a top folder that only starts with "dist", is a real path.
  // Round 3 re-review: a first segment that only starts with a dot, and a dist/ folder below the root (only a leading
  // "dist/" is the mistake). They kill two mutants the suite let live: startsWith(".") and includes("dist/").
  const N4_ACCEPTED = ["BROWSER/vendor-*.js", "browser/.well-known/abc-*.js", "distro/vendor-*.js", ".well-known/abc-*.js", "browser/assets/dist/lib-*.js"];
  for (const path of N4_ACCEPTED) {
    test(`[EP00-TBR-002-CA3] N-4 control: accepts «${path}» (upper case, segments that only start with a dot or with dist, or dist/ below the root)`, () => {
      const validatePatternList = exported("validatePatternList");
      assert.deepEqual(validatePatternList({ ...validList(), exceptions: [exception({ path })] }), [], `la excepción «${path}» tiene buena forma y debe aceptarse`);
    });
  }
});

describe("[EP00-TBR-002-CA3] module API", () => {
  test("[EP00-TBR-002-CA3] importing the module runs nothing and exports loadPatternList, validatePatternList and scanArtifact", () => {
    assert.ok(!PROBE.missing, "no existe el script scripts/check-artifact.mjs (lo escribe constructor-logica en T2)");
    assert.equal(PROBE.status, 0, `importar no debe fallar; stderr: ${PROBE.stderr}`);
    assert.equal(PROBE.stderr, "", "importar no debe escribir en stderr");
    const keys = JSON.parse(PROBE.stdout);
    for (const name of ["loadPatternList", "validatePatternList", "scanArtifact"]) assert.ok(keys.includes(name), `debe exportar ${name}; exporta: ${keys.join(", ")}`);
  });

  test("[EP00-TBR-002-CA3] scanArtifact returns no findings for a clean artifact and the rule id for a dirty one", () => {
    const scanArtifact = exported("scanArtifact");
    const list = exported("loadPatternList")(LIST);
    const clean = scanArtifact(makeArtifact(), list);
    assert.ok(Array.isArray(clean), "scanArtifact debe devolver la lista de hallazgos");
    assert.equal(clean.length, 0, `un artefacto limpio no tiene hallazgos: ${JSON.stringify(clean)}`);
    const dirty = scanArtifact(makeArtifact({ "browser/vercel.json": "{}\n" }), list);
    assert.ok(dirty.length >= 1 && JSON.stringify(dirty).includes("vercel-config"), `se esperaba vercel-config: ${JSON.stringify(dirty)}`);
  });

  // Dev rule 1: every finding is exactly { rule, path, line, sample }.
  test("[EP00-TBR-002-CA3] scanArtifact returns findings shaped { rule, path, line, sample } and never the full secret", () => {
    const scanArtifact = exported("scanArtifact");
    const list = exported("loadPatternList")(LIST);
    const secret = triggerOf("service-role-jwt");
    const findings = scanArtifact(makeArtifact({ "browser/assets/vercel.json": "{}\n", [MAIN_JS]: `/* synthetic */\nconst k="${secret}";\n` }), list);
    assert.ok(Array.isArray(findings) && findings.length === 2, `se esperaban 2 hallazgos: ${JSON.stringify(findings)}`);
    for (const f of findings) {
      assert.deepEqual(Object.keys(f).sort(), ["line", "path", "rule", "sample"], `forma del hallazgo: ${JSON.stringify(f)}`);
      assert.equal(typeof f.rule, "string");
      assert.equal(typeof f.path, "string");
      assert.equal(typeof f.sample, "string");
      assert.ok(Number.isInteger(f.line) && f.line >= 0, `line debe ser un entero ≥ 0: ${JSON.stringify(f)}`);
      assert.ok(!f.path.startsWith("/") && !f.path.includes("\\") && !f.path.includes(TMP), `path debe ser relativo a <dir> y con «/»: ${f.path}`);
    }
    const name = findings.find((f) => f.rule === "vercel-config");
    assert.equal(name?.path, "browser/assets/vercel.json", JSON.stringify(findings));
    const content = findings.find((f) => f.rule === "service-role-jwt");
    assert.equal(content?.path, MAIN_JS, JSON.stringify(findings));
    assert.equal(content?.line, 2, JSON.stringify(findings));
    assert.deepEqual(leakedPieces(JSON.stringify(findings), secret), [], "sample no puede mostrar el secreto");
  });

  // Dev rule 2 on exceptions: "*" does not cross "/", "**" does, and paths are case sensitive.
  const withException = (path, rule = "postgres-url-with-password") => {
    const list = structuredClone(exported("loadPatternList")(LIST));
    list.exceptions = [{ rule, path, reason: "caso sintético", decision: "DEC-0000" }];
    assert.deepEqual(exported("validatePatternList")(list), [], `la excepción sintética ${path} debe ser válida`);
    return list;
  };
  // One artifact per path: on a case-insensitive disk (macOS) Vendor-1.js and vendor-1.js would be the same file.
  const exemptedPaths = (list, paths, body = `const u="${triggerOf("postgres-url-with-password")}";\n`) =>
    paths.filter((p) => !exported("scanArtifact")(makeArtifact({ [p]: body }), list).some((f) => f.path === p));
  // Round 1 (S6/Q2): paths are narrow on purpose. "browser/*.js" and "browser/vendor/**" are now rejected by the
  // validator, so the same semantics are pinned with narrow paths.
  const EXCEPTION_SEMANTICS = [
    ["* does not cross /", "browser/*-vendor.js", ["browser/a-vendor.js"], ["browser/lazy/a-vendor.js"]],
    ["* inside a hashed name does not cross /", "browser/vendor-*.js", ["browser/vendor-SYNTH.js"], ["browser/vendor-x/y.js"]],
    ["** crosses folders", "browser/vendor/**/lib-*.js", ["browser/vendor/lib-1.js", "browser/vendor/a/b/lib-2.js"], ["browser/other/lib-1.js", "browser/main-SYNTH0001.js"]],
    ["**/ crosses folders before a name", "browser/**/vendor-*.js", ["browser/a/vendor-1.js", "browser/a/b/vendor-2.js"], ["browser/a/main-1.js"]],
    ["paths are case sensitive", "browser/Vendor-*.js", ["browser/Vendor-1.js"], ["browser/vendor-1.js", "browser/VENDOR-1.js"]],
  ];
  for (const [title, path, exempt, kept] of EXCEPTION_SEMANTICS) {
    test(`[EP00-TBR-002-CA3] exception paths: ${title} (${path})`, () => {
      const list = withException(path);
      assert.deepEqual(exemptedPaths(list, [...exempt, ...kept]).sort(), [...exempt].sort(), `${path} debe exceptuar solo ${exempt.join(", ")}`);
    });
  }

  // Round 1 · Q1 (T3 finding, approved by the dev): globstar respects folder boundaries. "**/" means zero or more whole
  // folders and never matches part of a name; "**" glued to a name never crosses "/".
  // `valid: true` also asserts that the validator accepts the path; "browser**" may be rejected by S6 (a "**" in the
  // last segment), so its semantics are checked straight on scanArtifact, which does not validate.
  const GLOBSTAR = [
    ["**/ spans zero folders and keeps a partial name", "browser/**/vendor.js", true, ["browser/vendor.js"], ["browser/notvendor.js"]],
    ["**/ spans several whole folders", "browser/**/vendor.js", true, ["browser/a/b/vendor.js"], ["browser/a/notvendor.js", "browser/a/b/xvendor.js"]],
    ["**/ spans the hashed name prefix only at a folder boundary", "browser/**/vendor-*.js", true, ["browser/vendor-1.js", "browser/a/vendor-2.js"], ["browser/notvendor-1.js", "browser/xvendor-1.js"]],
    ["a leading **/ matches the root and any folder but not a partial name", "**/main-*.js", true, ["main-1.js", "browser/main-1.js", "browser/a/main-1.js"], ["browser/xmain-1.js"]],
    ["** glued to a name never crosses /", "browser**", false, [], ["browser-other/a.js"]],
  ];
  for (const [title, path, valid, exempt, kept] of GLOBSTAR) {
    test(`[EP00-TBR-002-CA3] exception paths, globstar respects folder boundaries: ${title} (${path})`, () => {
      const list = structuredClone(exported("loadPatternList")(LIST));
      list.exceptions = [{ rule: "postgres-url-with-password", path, reason: "caso sintético", decision: "DEC-0000" }];
      if (valid) assert.deepEqual(exported("validatePatternList")(list), [], `la excepción sintética ${path} debe ser válida`);
      assert.deepEqual(exemptedPaths(list, [...exempt, ...kept]).sort(), [...exempt].sort(), `${path} debe exceptuar solo ${exempt.join(", ") || "nada"}; «**/» vale cero o más carpetas completas`);
    });
  }

  test("[EP00-TBR-002-CA3] an exception exempts only its own rule in the matched file", () => {
    const list = withException("browser/vendor-*.js");
    const body = `const u="${triggerOf("postgres-url-with-password")}";\nconst k="${triggerOf("supabase-secret-key")}";\n`;
    const findings = exported("scanArtifact")(makeArtifact({ "browser/vendor-SYNTH.js": body }), list);
    assert.deepEqual(findings.map((f) => `${f.path}|${f.rule}`), ["browser/vendor-SYNTH.js|supabase-secret-key"], JSON.stringify(findings));
  });

  test("[EP00-TBR-002-CA3] an exception never covers a forbidden name, even with the same path", () => {
    const list = withException("browser/vercel.json");
    const findings = exported("scanArtifact")(makeArtifact({ "browser/vercel.json": `${triggerOf("postgres-url-with-password")}\n` }), list);
    assert.ok(findings.some((f) => f.path === "browser/vercel.json" && f.rule === "vercel-config"), `vercel.json sigue siendo hallazgo: ${JSON.stringify(findings)}`);
  });

  test("[EP00-TBR-002-CA3] an exception exempts only the files its path matches", () => {
    const scanArtifact = exported("scanArtifact");
    const list = structuredClone(exported("loadPatternList")(LIST));
    list.exceptions = [{ rule: "postgres-url-with-password", path: "browser/vendor-*.js", reason: "caso sintético", decision: "DEC-0000" }];
    assert.deepEqual(exported("validatePatternList")(list), [], "la excepción sintética debe ser válida");
    const url = triggerOf("postgres-url-with-password");
    const findings = JSON.stringify(scanArtifact(makeArtifact({ "browser/vendor-SYNTH0001.js": `const u="${url}";\n`, [MAIN_JS]: `const u="${url}";\n` }), list));
    assert.ok(findings.includes("main-SYNTH0001.js"), `el archivo sin excepción debe tener hallazgo: ${findings}`);
    assert.ok(!findings.includes("vendor-SYNTH0001.js"), `el archivo exceptuado no debe tener hallazgo: ${findings}`);
  });
});

describe("[EP00-TBR-002-CA1][EP00-TBR-002-CA3] package.json scripts (§8.6)", () => {
  const pkg = () => JSON.parse(readFileSync(join(FRONT, "package.json"), "utf8"));

  test("[EP00-TBR-002-CA1] typecheck runs tsc --noEmit on the app and on the specs (R1)", () => {
    assert.equal(pkg().scripts.typecheck, "tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.spec.json", "falta el script typecheck de §8.6 o no coincide");
  });

  test("[EP00-TBR-002-CA3] ci:test runs both suites and artifact:check chains them before the review", () => {
    const { scripts } = pkg();
    assert.equal(scripts["ci:test"], "node --test scripts/check-artifact.test.mjs scripts/ci-workflow.test.mjs", "falta el script ci:test de §8.6 o no coincide");
    assert.equal(scripts["artifact:check"], "npm run ci:test && node scripts/check-artifact.mjs", "falta el script artifact:check de §8.6 o no coincide");
  });

  test("[EP00-TBR-002-CA1] build, test, ds:* and arch:* stay as they were", () => {
    const { scripts } = pkg();
    assert.deepEqual(
      {
        build: scripts.build,
        test: scripts.test,
        "ds:check": scripts["ds:check"],
        "ds:validate": scripts["ds:validate"],
        "arch:test": scripts["arch:test"],
        "arch:check": scripts["arch:check"],
      },
      {
        build: "ng build",
        test: "ng test",
        "ds:check": "node scripts/build-tokens.mjs --check && node scripts/build-doc.mjs --check && node scripts/test-theme.mjs && npm run ds:validate",
        "ds:validate": "node scripts/validate-ui.mjs --test && node --test scripts/validate-ui.test.mjs && node scripts/validate-ui.mjs",
        "arch:test": "node --test scripts/arch-check.test.mjs scripts/new-module.test.mjs",
        "arch:check": "npm run arch:test && depcruise src --config .dependency-cruiser.cjs",
      },
      "no se tocan los scripts npm existentes",
    );
  });
});

// =============================================================================================
// EP00-TBR-019 · the artifact check gives a clear result on very long blocks (docs/diseno/EP00-TBR-019.md §8.5, as
// adjusted by §12.4; DEC-0020). Written black-box and before the fix, on c3752ac. Only added: no earlier test changes.
// [EP00-TBR-019-CA1] A block of 7 000 000 characters (more than 6 MB in decimal and binary units) after the prefix of
// every content rule gives a clear result in bounded time: the finding of the rule, or the normal result, and never a
// trace or the value. [V-1]: under 7 s per 7 M file, timed with timedScan; every CLI run ends in under 60 s; both CLI
// cases run with a 512 MB heap as a guard. AJ-6: private-key-block and postgres-url-with-password keep their open
// ranges (the PO rejected [V-4]), so on a long block they accept exactly one of two results: the normal one (branch A)
// or one scan-error of that rule (branch B). The branch seen is reported through t.diagnostic.
// [EP00-TBR-019-CA2] A seeded corpus gives the same findings with the real list and with a copy holding the current
// text of the 6 [V-3] patterns; the text of the 2 unbounded rules is pinned (AJ-5).
// [EP00-TBR-019-CA3] An unforeseen error while scanning becomes one scan-error per rule and file (DEC-0020 §2): the
// scan goes on, earlier matches stay, an lstatSync failure gives unreadable, and a final net in main exits 1 with no
// trace. Errors are injected without touching the product code: getters in a synthetic list, or a preload under tmp/.
// =============================================================================================
const LONG = 7_000_000;
const LONG_LIMIT_MS = 7_000; // [V-1] 7 s per 7 M file, the 1 s per million pace of HOSTILE_LIMIT_MS
const LONG_KILL_MS = CHILD_TIMEOUT_MS; // [V-1] 60 s per run
const LONG_PATH = "browser/chunk-LONGBLOCK.js";
const HEAP_FLAG = "--max-old-space-size=512";
const OOM_RE = /heap out of memory|Allocation failed|FATAL ERROR/i;
const SENTINEL = "synthetic-sentinel-" + "q7x2";
// [V-2] sample of a scan-error, exactly as in design §8.4 and DEC-0020 §2.
const scanErrorSample = (id, type = "RangeError") => `no se pudo revisar con la regla «${id}» (${type}); el archivo no pasa la revisión`;
const scanErrorLine = (path, id, type) => `ERROR  ${path}  · scan-error · ${scanErrorSample(id, type)}`;
const keyOf = (f) => `${f.path}:${f.line}|${f.rule}`;
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// AJ-6 · the result on a rule whose open range sits in the middle of its pattern: branch A (`normal`, sorted keys) or
// branch B (one scan-error of that rule and nothing else). Anything else fails and says what arrived.
function unboundedBranch(findings, id, path, normal) {
  const got = findings.map(keyOf).sort();
  if (sameList(got, normal)) return "A";
  if (sameList(got, [`${path}:0|scan-error`]) && findings[0].sample === scanErrorSample(id)) return "B";
  const errors = findings.filter((f) => f.rule === "scan-error");
  const why = !findings.length
    ? "una lista vacía (un catch silencioso no revisa y no avisa)"
    : errors.length && errors.length < findings.length
      ? "los dos conjuntos mezclados"
      : errors.some((f) => f.sample !== scanErrorSample(id))
        ? `un scan-error con otro texto (otra regla u otro tipo de error); se esperaba «${scanErrorSample(id)}»`
        : "un resultado distinto";
  assert.fail(`${id}: se esperaba exactamente la rama A (${normal.join(", ")}) o la rama B (un único scan-error de ${id}); llegó ${why}: ${JSON.stringify(findings).slice(0, 2_000)}`);
}

// Runs the CLI with extra Node flags (heap guard, preload) and times the whole run.
function runNode(nodeArgs, args) {
  assert.ok(existsSync(SCRIPT), "no existe el script scripts/check-artifact.mjs");
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [...nodeArgs, SCRIPT, ...args], { cwd: FRONT, encoding: "utf8", timeout: CHILD_TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: 64 * 1024 * 1024 });
  const ms = performance.now() - t0;
  if (r.error?.code === "ETIMEDOUT" || r.status === null) {
    assert.fail(`check-artifact.mjs no terminó (señal ${r.signal}, límite ${CHILD_TIMEOUT_MS / 1000} s)\n${(r.stdout ?? "").slice(0, 2_000)}${(r.stderr ?? "").slice(0, 2_000)}`);
  }
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  return { status: r.status, stdout, stderr, output: `${stdout}\n${stderr}`, ms };
}
// Writes an ES module under tmp/ and runs the CLI with it loaded first through --import.
function runWithPreload(source, args) {
  const preload = join(makeDir("preload-"), "preload.mjs");
  writeFileSync(preload, source);
  return runNode(["--import", pathToFileURL(preload).href], args);
}
const errorLines = (stderr) => stderr.split("\n").filter((l) => l.startsWith("ERROR"));

// CA1 · one long block per content rule of the real list, on line 1; the rule's trigger goes on line 2. `expect` is the
// exact list of rules found on line 1. Without `expect` the rule keeps its open range (AJ-6) and accepts branch A or B.
const LONG_BY_RULE = {
  "private-key-block": [
    ["BEGIN followed by 3.5 M words of one letter and no PRIVATE KEY", () => BEGIN + "A ".repeat(LONG / 2)],
    ["BEGIN followed by one 7 M word that never closes", () => BEGIN + "A".repeat(LONG)],
  ],
  "service-role-jwt": [["a dotted triple with a 7 M payload that is not JSON", () => `eyJa.eyJ${"A".repeat(LONG)}.c2ln`, []]],
  "supabase-secret-key": [["sb_secret_ followed by 7 M characters of its class", () => `sb_${"secret_"}${"a".repeat(LONG)}`, ["supabase-secret-key"]]],
  "supabase-service-role-env": [["SUPABASE_SERVICE_ROLE_ followed by 7 M letters (no closing boundary)", () => `SUPABASE_${"SERVICE_ROLE_"}${"A".repeat(LONG)}`, []]],
  "vercel-token-env": [["VERCEL_ followed by 7 M letters", () => `VERCEL_${"A".repeat(LONG)}`, []]],
  "postgres-url-with-password": [
    ["postgres:// followed by a 7 M user that never closes with a colon", () => `postgres${"://"}${"a".repeat(LONG)}`],
    ["postgres://a: followed by a 7 M password that never closes with an at sign", () => `postgres${"://"}a:${"b:".repeat(LONG / 2)}`],
  ],
  "github-token": [["github_pat_ followed by 7 M characters of its class", () => `github_${"pat_"}${"a".repeat(LONG)}`, ["github-token"]]],
  "aws-access-key-id": [["AKIA followed by 7 M characters of its class", () => `AK${"IA"}${"A".repeat(LONG)}`, ["aws-access-key-id"]]],
  "stripe-secret-key": [["sk_live_ followed by 7 M characters of its class", () => `sk${"_live_"}${"a".repeat(LONG)}`, ["stripe-secret-key"]]],
  "slack-token": [["xoxb- followed by 7 M characters of its class", () => `xo${"xb-"}${"a".repeat(LONG)}`, ["slack-token"]]],
  "google-api-key": [["AIza followed by 7 M characters of its class", () => `AI${"za"}${"a".repeat(LONG)}`, ["google-api-key"]]],
  "npm-token": [["npm_ followed by 7 M characters of its class", () => `np${"m_"}${"a".repeat(LONG)}`, ["npm-token"]]],
  "anthropic-api-key": [["sk-ant- followed by 7 M characters of its class", () => `sk${"-ant-"}${"a".repeat(LONG)}`, ["anthropic-api-key"]]],
  "ai-provider-secret-key": [["sk- followed by 7 M characters of its class", () => `sk${"-"}${"a".repeat(LONG)}`, ["ai-provider-secret-key"]]],
};

describe("[EP00-TBR-019-CA1] a 7 M block after the prefix of every content rule gives a clear result in under 7 s", () => {
  test("[EP00-TBR-019-CA1] every content rule of the real list has a long-block case here (a new rule must add its own)", () => {
    const ids = (realList().contents ?? []).map((r) => r.id);
    assert.deepEqual(ids.filter((id) => !(id in LONG_BY_RULE) || !(id in TRIGGER_BY_RULE)), [], "cada regla de contenido de la lista real necesita un caso de bloque largo y un disparador en esta prueba");
    assert.deepEqual(Object.keys(LONG_BY_RULE).filter((id) => !ids.includes(id)), [], "hay casos de bloque largo para reglas que ya no están en la lista");
  });

  test("[EP00-TBR-019-CA1] self-check: every block is longer than 6 MB in decimal and binary units, and sits on one line", () => {
    for (const [id, cases] of Object.entries(LONG_BY_RULE)) {
      for (const [title, make] of cases) {
        const block = make();
        assert.ok(block.length >= LONG && block.length > 6_291_456, `${id} · ${title}: mide ${block.length} caracteres; debe pasar de 6 MB`);
        assert.ok(!block.includes("\n"), `${id} · ${title}: el bloque debe ir en una sola línea`);
      }
    }
  });

  for (const [id, cases] of Object.entries(LONG_BY_RULE)) {
    for (const [title, make, expect] of cases) {
      const how = expect ? "the exact result and no scan-error" : "exactly branch A (normal result) or branch B (one scan-error of the rule)";
      test(`[EP00-TBR-019-CA1] ${id} · ${title}: ${how}, no trace, no value, in under 7 s, and the trigger on the next line`, (t) => {
        const block = make();
        const trigger = TRIGGER_BY_RULE[id]();
        const dir = makeArtifact({ [LONG_PATH]: `${block}\nconst k="${trigger}";\n` });
        const { ms, findings } = timedScan(dir, `${id} · ${title}`, LONG_KILL_MS);
        const shown = JSON.stringify(findings);
        assert.deepEqual(leakedPieces(shown, trigger), [], "sample no puede mostrar el secreto");
        assert.deepEqual(leakedPieces(shown, block.slice(0, 200)), [], "sample no puede mostrar el bloque");
        let branch = "exacto";
        if (expect) {
          const want = [...expect.map((r) => `${LONG_PATH}:1|${r}`), `${LONG_PATH}:2|${id}`].sort();
          assert.deepEqual(findings.map(keyOf).sort(), want, `${id} · ${title}: el resultado debe ser exacto y sin scan-error: ${shown.slice(0, 2_000)}`);
        } else {
          branch = `rama ${unboundedBranch(findings, id, LONG_PATH, [`${LONG_PATH}:2|${id}`])}`;
        }
        assert.ok(ms < LONG_LIMIT_MS, `${id} · ${title}: la revisión tardó ${Math.round(ms)} ms; el límite es ${LONG_LIMIT_MS} ms`);
        t.diagnostic(`${id} · ${title}: ${branch} · Node ${process.version} · ${Math.round(ms)} ms`);
      });
    }
  }

  // R4: the lookbehinds of anthropic-api-key and ai-provider-secret-key must stay linear on sk- and sk-ant- repeated.
  const LOOKBEHIND_RUNS = [
    ["sk- repeated up to 7 M characters", () => `sk${"-"}`.repeat(Math.ceil(LONG / 3)), ["ai-provider-secret-key"]],
    ["sk-ant- repeated up to 7 M characters", () => `sk${"-ant-"}`.repeat(LONG / 7), ["anthropic-api-key", "ai-provider-secret-key"]],
  ];
  for (const [title, make, expect] of LOOKBEHIND_RUNS) {
    test(`[EP00-TBR-019-CA1] R4: ${title} gives the exact result in under 7 s (the lookbehinds are not quadratic)`, (t) => {
      const block = make();
      assert.ok(block.length >= LONG, `autocomprobación: mide ${block.length} caracteres`);
      const trigger = TRIGGER_BY_RULE["ai-provider-secret-key"]();
      const { ms, findings } = timedScan(makeArtifact({ [LONG_PATH]: `${block}\nconst k="${trigger}";\n` }), title, LONG_KILL_MS);
      const want = [...expect.map((r) => `${LONG_PATH}:1|${r}`), `${LONG_PATH}:2|ai-provider-secret-key`].sort();
      assert.deepEqual(findings.map(keyOf).sort(), want, `${title}: el resultado debe ser exacto: ${JSON.stringify(findings).slice(0, 2_000)}`);
      assert.deepEqual(leakedPieces(JSON.stringify(findings), trigger), [], "sample no puede mostrar el secreto");
      assert.ok(ms < LONG_LIMIT_MS, `${title}: la revisión tardó ${Math.round(ms)} ms; el límite es ${LONG_LIMIT_MS} ms`);
      t.diagnostic(`${title}: Node ${process.version} · ${Math.round(ms)} ms`);
    });
  }

  // R6: a secret of another rule inside the long block, or glued right after it, is still found.
  test("[EP00-TBR-019-CA1] R6: a ghp_ token in the middle of a 7 M sb_secret_ block gives both findings on line 1, with masked samples", (t) => {
    const ghp = TRIGGER_BY_RULE["github-token"]();
    const half = "a".repeat(LONG / 2);
    const block = `sb_${"secret_"}${half}${ghp}${half}`;
    const { ms, findings } = timedScan(makeArtifact({ [LONG_PATH]: `${block}\n` }), "ghp_ inside the block", LONG_KILL_MS);
    assert.deepEqual(findings.map(keyOf).sort(), [`${LONG_PATH}:1|github-token`, `${LONG_PATH}:1|supabase-secret-key`], `se esperaban los dos hallazgos en la línea 1: ${JSON.stringify(findings).slice(0, 2_000)}`);
    assert.deepEqual(leakedPieces(JSON.stringify(findings), ghp), [], "sample no puede mostrar el token");
    assert.deepEqual(leakedPieces(JSON.stringify(findings), block.slice(0, 200)), [], "sample no puede mostrar el bloque");
    assert.ok(ms < LONG_LIMIT_MS, `la revisión tardó ${Math.round(ms)} ms; el límite es ${LONG_LIMIT_MS} ms`);
    t.diagnostic(`ghp_ dentro del bloque: Node ${process.version} · ${Math.round(ms)} ms`);
  });

  test("[EP00-TBR-019-CA1] R6: another rule glued right after a 7 M sb_secret_ block and the same rule on the next line are all found", (t) => {
    const pg = triggerOf("postgres-url-with-password");
    const sb = triggerOf("supabase-secret-key");
    // The second sb_secret_ on line 1 is the same rule on the same line: one finding by design (one per rule and line).
    const block = `sb_${"secret_"}${"a".repeat(LONG)}${pg} ${sb}`;
    const { ms, findings } = timedScan(makeArtifact({ [LONG_PATH]: `${block}\nconst k="${sb}";\n` }), "a rule glued after the block", LONG_KILL_MS);
    const want = [`${LONG_PATH}:1|supabase-secret-key`, `${LONG_PATH}:1|postgres-url-with-password`, `${LONG_PATH}:2|supabase-secret-key`].sort();
    assert.deepEqual(findings.map(keyOf).sort(), want, `se esperaban todos los hallazgos: ${JSON.stringify(findings).slice(0, 2_000)}`);
    for (const secret of [pg, sb, block.slice(0, 200)]) assert.deepEqual(leakedPieces(JSON.stringify(findings), secret), [], "sample no puede mostrar el secreto");
    assert.ok(ms < LONG_LIMIT_MS, `la revisión tardó ${Math.round(ms)} ms; el límite es ${LONG_LIMIT_MS} ms`);
    t.diagnostic(`regla pegada tras el bloque: Node ${process.version} · ${Math.round(ms)} ms`);
  });
});

describe("[EP00-TBR-019-CA1] the CLI end to end on a 7 M block, with a 512 MB heap", () => {
  test("[EP00-TBR-019-CA1] a 7 M sb_secret_ block exits 1 with a line naming the path and supabase-secret-key, no trace, no value, never ready to upload", (t) => {
    const path = "browser/chunk-LONGKEY.js";
    const r = runNode([HEAP_FLAG], ["--dir", makeArtifact({ [path]: `${"sb_" + "secret_"}${"a".repeat(LONG)}\n` })]);
    assert.doesNotMatch(r.output, OOM_RE, `la revisión no debe quedarse sin memoria\n${r.output.slice(0, 2_000)}`);
    assertFinding(r, path, "supabase-secret-key", 1);
    assert.doesNotMatch(r.output, /scan-error/, `con el rango acotado no debe salir scan-error\n${r.output.slice(0, 2_000)}`);
    assert.ok(!r.output.includes("a".repeat(MAX_SHOWN + 1)), "la salida no puede mostrar el valor");
    assert.ok(r.ms < CHILD_TIMEOUT_MS, `la corrida tardó ${Math.round(r.ms)} ms`);
    t.diagnostic(`CLI sb_secret_ 7 M (heap 512 MB): Node ${process.version} · ${Math.round(r.ms)} ms`);
  });

  test("[EP00-TBR-019-CA1] AJ-6: a 7 M BEGIN block with no secret gives exactly branch A (exit 0, ready to upload) or branch B (exit 1, one scan-error line)", (t) => {
    const path = "browser/chunk-LONGBEGIN.js";
    const dir = makeArtifact({ [path]: `${BEGIN}${"A ".repeat(LONG / 2)}\n` });
    const files = Object.keys(CLEAN_FILES()).length + 1;
    const r = runNode([HEAP_FLAG], ["--dir", dir]);
    assert.doesNotMatch(r.output, OOM_RE, `la revisión no debe quedarse sin memoria\n${r.output.slice(0, 2_000)}`);
    assert.doesNotMatch(r.output, STACK_TRACE_RE, `la revisión no debe terminar con una traza\n${r.output.slice(0, 2_000)}`);
    assert.deepEqual(leakedPieces(r.output, `${BEGIN}${"A ".repeat(8)}`), [], "la salida no puede mostrar el bloque");
    let branch;
    if (r.status === 0) {
      branch = "A";
      assert.equal(Number(CLEAN_RE.exec(r.stdout)?.[1]), files, `rama A: se esperaba «0 hallazgos en ${files} archivo(s) …; listo para subir»\n${r.output.slice(0, 2_000)}`);
      assert.deepEqual(errorLines(r.stderr), [], `rama A: no debe haber hallazgos\n${r.output.slice(0, 2_000)}`);
    } else {
      branch = "B";
      assert.equal(r.status, 1, `rama B: se esperaba el código 1\n${r.output.slice(0, 2_000)}`);
      assert.deepEqual(errorLines(r.stderr), [scanErrorLine(path, "private-key-block", "RangeError")], `rama B: se esperaba una sola línea de scan-error de private-key-block, sin «:línea»\n${r.output.slice(0, 2_000)}`);
      assert.match(r.stderr, new RegExp(`^check-artifact: 1 hallazgo\\(s\\) en ${files} archivo\\(s\\) de `, "m"), `rama B: falta el resumen «1 hallazgo(s) en …»\n${r.output.slice(0, 2_000)}`);
      assert.doesNotMatch(r.output, /listo para subir/, `rama B: nunca está listo para subir\n${r.output.slice(0, 2_000)}`);
    }
    assert.ok(r.ms < CHILD_TIMEOUT_MS, `la corrida tardó ${Math.round(r.ms)} ms`);
    t.diagnostic(`CLI BEGIN 7 M sin secreto (heap 512 MB): rama ${branch} · Node ${process.version} · ${Math.round(r.ms)} ms`);
  });
});

describe("[EP00-TBR-019-CA1] margin over CA1: 16 M characters", () => {
  const BIG = 16_000_000;
  const BIG_LIMIT_MS = 16_000; // the [V-1] pace, 1 s per million characters
  test("[EP00-TBR-019-CA1] sb_secret_ followed by 16 M characters gives the exact result", (t) => {
    const trigger = TRIGGER_BY_RULE["supabase-secret-key"]();
    const { ms, findings } = timedScan(makeArtifact({ [LONG_PATH]: `sb_${"secret_"}${"a".repeat(BIG)}\nconst k="${trigger}";\n` }), "sb_secret_ 16 M", LONG_KILL_MS);
    assert.deepEqual(findings.map(keyOf).sort(), [`${LONG_PATH}:1|supabase-secret-key`, `${LONG_PATH}:2|supabase-secret-key`], `el resultado debe ser exacto: ${JSON.stringify(findings).slice(0, 2_000)}`);
    assert.ok(ms < BIG_LIMIT_MS, `la revisión tardó ${Math.round(ms)} ms; el límite es ${BIG_LIMIT_MS} ms`);
    t.diagnostic(`sb_secret_ 16 M: Node ${process.version} · ${Math.round(ms)} ms`);
  });

  test("[EP00-TBR-019-CA1] AJ-6: BEGIN followed by 8 M words of one letter gives exactly branch A or branch B", (t) => {
    const trigger = TRIGGER_BY_RULE["private-key-block"]();
    const { ms, findings } = timedScan(makeArtifact({ [LONG_PATH]: `${BEGIN}${"A ".repeat(BIG / 2)}\nconst k="${trigger}";\n` }), "BEGIN 16 M", LONG_KILL_MS);
    const branch = unboundedBranch(findings, "private-key-block", LONG_PATH, [`${LONG_PATH}:2|private-key-block`]);
    assert.deepEqual(leakedPieces(JSON.stringify(findings), trigger), [], "sample no puede mostrar el secreto");
    assert.ok(ms < BIG_LIMIT_MS, `la revisión tardó ${Math.round(ms)} ms; el límite es ${BIG_LIMIT_MS} ms`);
    t.diagnostic(`BEGIN 16 M: rama ${branch} · Node ${process.version} · ${Math.round(ms)} ms`);
  });
});

// ---------------------------------------------------------------------------------------------
// CA2 · no regression. The 6 [V-3] patterns as they stand before the fix, copied on purpose (R5): any later change of
// those rules shows in this diff too (RG-1). They are patterns, not secrets.
// ---------------------------------------------------------------------------------------------
const V3_CURRENT_PATTERNS = {
  "supabase-secret-key": "\\bsb_secret_[A-Za-z0-9_-]{20,}",
  "github-token": "(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})",
  "stripe-secret-key": "[sr]k_(?:live|test)_[0-9A-Za-z]{20,}",
  "slack-token": "\\bxox[abposr]-[0-9A-Za-z-]{10,}",
  "anthropic-api-key": "(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{32,}",
  "ai-provider-secret-key": "(?<![A-Za-z0-9])sk-(?!ant-[A-Za-z0-9_-]{32})[A-Za-z0-9_-]{32,}",
};
// AJ-5 · the 2 rules the PO kept unbounded, with their current text, assembled at runtime as in the self-checks above.
const UNBOUNDED_CURRENT_PATTERNS = () => ({
  "private-key-block": `${DASHES}${"BEG" + "IN"} (?:[A-Z0-9]+ )*PRIV${"ATE"} KEY(?: BLOCK)?${DASHES}`,
  "postgres-url-with-password": "postgres(?:ql)?://[^\\s:@/'\"`]+:[^\\s@/'\"`]+@",
});
// The real list with the 6 [V-3] patterns put back to their current text; nothing else changes.
function listWithCurrentPatterns(list) {
  const copy = structuredClone(list);
  for (const rule of copy.contents) if (rule.id in V3_CURRENT_PATTERNS) rule.pattern = V3_CURRENT_PATTERNS[rule.id];
  return copy;
}
const flatFindings = (findings) => findings.map((f) => `${f.path}:${f.line}|${f.rule}|${f.sample}`);
function assertSameFindings(withReal, withCurrent, what) {
  const first = Array.from({ length: Math.max(withReal.length, withCurrent.length) }, (_, i) => i).find((i) => withReal[i] !== withCurrent[i]);
  assert.equal(first, undefined, `${what}: la lista real y los patrones actuales deben dar los mismos hallazgos (${withReal.length} frente a ${withCurrent.length}); primera diferencia en ${first}: lista real ${withReal[first]} · patrones actuales ${withCurrent[first]}`);
}

// Seeded corpus (mulberry32): the prefixes of the 6 [V-3] rules with bodies of N-1, N, N+1, 2N, 100 and 1 000
// characters, interior prefixes, leading characters that test the boundaries, several per line, LF and CRLF.
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const V3_CORPUS_RULES = [
  { id: "supabase-secret-key", prefixes: ["sb_" + "secret_"], alphabet: `${ALNUM}_-`, n: 20 },
  { id: "github-token", prefixes: ["github_" + "pat_", "gh" + "p_"], alphabet: `${ALNUM}_`, n: 60 },
  { id: "stripe-secret-key", prefixes: ["sk", "rk"].flatMap((a) => ["_live_", "_test_"].map((b) => a + b)), alphabet: ALNUM, n: 20 },
  { id: "slack-token", prefixes: [..."abposr"].map((c) => `xo${"x"}${c}-`), alphabet: `${ALNUM}-`, n: 10 },
  { id: "anthropic-api-key", prefixes: ["sk" + "-ant-"], alphabet: `${ALNUM}_-`, n: 32 },
  { id: "ai-provider-secret-key", prefixes: ["sk" + "-"], alphabet: `${ALNUM}_-`, n: 32 },
];
const CORPUS_SEED = 19;
const CORPUS_MAX_CHARS = 1_000_000;
const CORPUS_FILES = 4;
const INTERIOR = ["sk" + "-", "-xo" + "xb-", "github_" + "pat_", "sb_" + "secret_", "sk" + "-ant-", "sk" + "_live_", "gh" + "p_"];
const CUTS = [".", " ", "/", ":", "\"", "+", "@", "!", "\t"];
const LEADS = ["", "", " ", "\"", "=", "x", "_", "-", "9", "/", "."];
const SEPARATORS = [" ", " ", "\n", "\r\n", "", ".", "\"", ",", ";", "x"];
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function differentialCorpus() {
  const random = seededRandom(CORPUS_SEED);
  const pick = (items) => items[Math.floor(random() * items.length)];
  const parts = Array.from({ length: CORPUS_FILES }, () => []);
  let strings = 0;
  let total = 0;
  for (;;) {
    const rule = pick(V3_CORPUS_RULES);
    const length = random() < 0.01 ? 1_000 : pick([rule.n - 1, rule.n, rule.n + 1, 2 * rule.n, 100]);
    let body = "";
    while (body.length < length) {
      const r = random();
      body += r < 0.9 ? pick(rule.alphabet) : r < 0.96 ? pick(INTERIOR) : pick(CUTS);
    }
    const piece = `${pick(LEADS)}${pick(rule.prefixes)}${body.slice(0, length)}${pick(SEPARATORS)}`;
    if (total + piece.length > CORPUS_MAX_CHARS) break;
    parts[strings % CORPUS_FILES].push(piece);
    total += piece.length;
    strings++;
  }
  return { files: Object.fromEntries(parts.map((p, i) => [`browser/diff-${i}.js`, p.join("")])), strings, total };
}

describe("[EP00-TBR-019-CA2] no regression in what the list detects", () => {
  test("[EP00-TBR-019-CA2] AJ-5: private-key-block and postgres-url-with-password keep their current pattern, character for character", () => {
    const list = realList();
    for (const [id, pattern] of Object.entries(UNBOUNDED_CURRENT_PATTERNS())) {
      const rule = (list.contents ?? []).find((r) => r.id === id);
      assert.equal(rule?.kind, "regex", `${id} debe seguir siendo una regla regex`);
      assert.equal(rule?.pattern, pattern, `${id}: el PO rechazó [V-4]; su patrón no cambia`);
    }
  });

  test("[EP00-TBR-019-CA2] self-check: the 6 [V-3] rules exist, their current text compiles, and the seeded corpus stays under 1 MB with about 20 000 strings", () => {
    const list = realList();
    for (const [id, pattern] of Object.entries(V3_CURRENT_PATTERNS)) {
      assert.equal((list.contents ?? []).find((r) => r.id === id)?.kind, "regex", `${id} debe existir como regla regex en la lista real`);
      assert.doesNotThrow(() => new RegExp(pattern, "gu"), `${id}: el patrón actual debe compilar`);
    }
    const copy = listWithCurrentPatterns(list);
    const strip = (l) => JSON.stringify(l.contents.map(({ pattern, ...rest }) => rest));
    assert.equal(strip(copy), strip(list), "la copia solo cambia los patrones de [V-3]");
    assert.deepEqual({ ...copy, contents: null }, { ...list, contents: null }, "la copia no cambia names ni exceptions");
    const corpus = differentialCorpus();
    assert.ok(corpus.total <= CORPUS_MAX_CHARS, `el corpus mide ${corpus.total} caracteres; como mucho 1 MB`);
    assert.ok(corpus.strings >= 10_000, `el corpus tiene ${corpus.strings} cadenas; deben ser del orden de 20 000`);
    assert.equal(JSON.stringify(differentialCorpus()), JSON.stringify(corpus), "el corpus debe ser el mismo en cada corrida (semilla fija)");
  });

  test("[EP00-TBR-019-CA2] R5: the seeded corpus gives the same findings (rule, path, line, sample) with the real list and with the current [V-3] patterns", (t) => {
    const scanArtifact = exported("scanArtifact");
    const list = exported("loadPatternList")(LIST);
    const corpus = differentialCorpus();
    const dir = makeArtifact(corpus.files, { clean: false });
    const withReal = flatFindings(scanArtifact(dir, list));
    const withCurrent = flatFindings(scanArtifact(dir, listWithCurrentPatterns(list)));
    const perRule = Object.fromEntries(V3_CORPUS_RULES.map(({ id }) => [id, withCurrent.filter((k) => k.includes(`|${id}|`)).length]));
    for (const [id, count] of Object.entries(perRule)) assert.ok(count >= 100, `autocomprobación: el corpus da ${count} hallazgos de ${id}; debe ejercitar cada regla`);
    assertSameFindings(withReal, withCurrent, "corpus diferencial");
    t.diagnostic(`corpus: ${corpus.strings} cadenas, ${corpus.total} caracteres, ${withCurrent.length} hallazgos (${JSON.stringify(perRule)})`);
  });

  test("[EP00-TBR-019-CA2] R5: sk-ant- and sk- keys of every length around the minimum, alone and glued to another key, give today's result in both rules", () => {
    const scanArtifact = exported("scanArtifact");
    const list = exported("loadPatternList")(LIST);
    const sk = (n) => "sk" + "-" + "Synth" + "0".repeat(n - 5);
    const keys = [
      ...[28, 31].map((n) => [skAnt(n), "ai-provider-secret-key"]),
      ...[32, 33, 40, 100, 1_000].map((n) => [skAnt(n), "anthropic-api-key"]),
      [sk(31), null],
      ...[32, 33, 100].map((n) => [sk(n), "ai-provider-secret-key"]),
    ];
    const ghp = TRIGGER_BY_RULE["github-token"]();
    const sb = triggerOf("supabase-secret-key");
    const alone = keys.map(([key]) => `const k="${key}";`);
    const glued = keys.flatMap(([key], i) => [`const k="${key}${keys[(i + 1) % keys.length][0]}";`, `const k="${ghp}${key}";`, `const k="${key}${sb}";`, `const k="${key}-${key}";`]);
    const dir = makeArtifact({ [MAIN_JS]: `${[...alone, ...glued].join("\n")}\n` }, { clean: false });
    const findings = scanArtifact(dir, list);
    const aloneWant = keys.flatMap(([, rule], i) => (rule ? [`${MAIN_JS}:${i + 1}|${rule}`] : []));
    assert.deepEqual(findings.filter((f) => f.line <= alone.length).map(keyOf).sort(), aloneWant.sort(), `cada llave sola debe dar el hallazgo de hoy: ${JSON.stringify(findings.filter((f) => f.line <= alone.length))}`);
    const withCurrent = scanArtifact(dir, listWithCurrentPatterns(list));
    assertSameFindings(flatFindings(findings), flatFindings(withCurrent), "llaves sk- y sk-ant-");
  });
});

// ---------------------------------------------------------------------------------------------
// CA3 · unforeseen errors while scanning (design §8.4, DEC-0020 §2).
// ---------------------------------------------------------------------------------------------
function throwingRule(id, kind, field, makeError) {
  const rule = { id, kind, reason: "regla sintética que falla al leerse" };
  Object.defineProperty(rule, field, { enumerable: true, get() { throw makeError(); } });
  return rule;
}
function namedError(name) {
  const error = new Error(SENTINEL);
  error.name = name;
  return error;
}
// One rule of the real list whose pattern the preload targets; its text is not touched by [V-3].
const PRELOAD_RULE = "vercel-token-env";
// mode "always": every exec of that pattern throws. mode "second": the first exec of each scan returns as usual and the
// next one throws, so the first match is delivered and the error comes on the second (design §12.4). Wrapping
// RegExp.prototype.exec reaches String.prototype.matchAll as well as any exec loop.
const execPreload = (mode) => `
import { readFileSync } from "node:fs";
const list = JSON.parse(readFileSync(${JSON.stringify(LIST)}, "utf8"));
const source = new RegExp(list.contents.find((r) => r.id === ${JSON.stringify(PRELOAD_RULE)}).pattern, "u").source;
const exec = RegExp.prototype.exec;
RegExp.prototype.exec = function (s) {
  if (this.source === source && (${JSON.stringify(mode)} === "always" || this.lastIndex !== 0)) throw new RangeError(${JSON.stringify(SENTINEL)});
  return exec.call(this, s);
};
`;
// Makes one builtin function throw when its argument number `argIndex` ends with `target`, and pushes the change to the
// named ESM exports with module.syncBuiltinESMExports(). With `errorCode` it throws an Error with that code (like a
// failing file system call); without it, a RangeError.
const builtinPreload = (moduleName, fn, argIndex, target, errorCode) => `
import mod from ${JSON.stringify(moduleName)};
import { syncBuiltinESMExports } from "node:module";
const original = mod[${JSON.stringify(fn)}];
mod[${JSON.stringify(fn)}] = function (...args) {
  if (String(args[${argIndex}]).endsWith(${JSON.stringify(target)})) {
    const error = new ${errorCode ? "Error" : "RangeError"}(${JSON.stringify(SENTINEL)});
    ${errorCode ? `error.code = ${JSON.stringify(errorCode)};` : ""}
    throw error;
  }
  return original.apply(this, args);
};
syncBuiltinESMExports();
`;
const CA3_TARGET = "browser/chunk-SCANERR.js";
const CA3_OTHER = "browser/chunk-OTHER.js";
const ca3Files = () => ({
  [CA3_TARGET]: ["/* synthetic */", `const t="${TRIGGER_BY_RULE[PRELOAD_RULE]()}";`, `const k="${triggerOf("supabase-secret-key")}";`, `const u="${TRIGGER_BY_RULE[PRELOAD_RULE]()}";`].join("\n") + "\n",
  [CA3_OTHER]: `const u="${triggerOf("postgres-url-with-password")}";\n`,
  "browser/vercel.json": "{}\n",
});
// A failing review that fails closed and leaks nothing: exit 1, no trace, no sentinel, no planted value, never ready.
function assertClosedAndSilent(r) {
  assert.equal(r.status, 1, `la revisión debe fallar cerrada con el código 1\n${r.output.slice(0, 2_000)}`);
  assert.doesNotMatch(r.output, STACK_TRACE_RE, `no debe terminar con una traza\n${r.output.slice(0, 2_000)}`);
  assert.ok(!r.output.includes(SENTINEL), `la salida no puede mostrar error.message (centinela)\n${r.output.slice(0, 2_000)}`);
  for (const secret of [triggerOf("supabase-secret-key"), triggerOf("postgres-url-with-password")]) assert.deepEqual(leakedPieces(r.output, secret), [], "la salida no puede mostrar el valor");
  assert.doesNotMatch(r.output, /listo para subir/, `nunca está listo para subir\n${r.output.slice(0, 2_000)}`);
}

describe("[EP00-TBR-019-CA3] an unforeseen error while scanning fails closed with the rule and the file, never the value", () => {
  test("[EP00-TBR-019-CA3] self-check: the scan-error sample is the Spanish text of [V-2]", () => {
    assert.equal(scanErrorSample("supabase-secret-key"), "no se pudo revisar con la regla «supabase-secret-key» (RangeError); el archivo no pasa la revisión");
    assert.equal(scanErrorLine("browser/chunk-X.js", "supabase-secret-key", "RangeError"), "ERROR  browser/chunk-X.js  · scan-error · no se pudo revisar con la regla «supabase-secret-key» (RangeError); el archivo no pasa la revisión");
  });

  test("[EP00-TBR-019-CA3] in process: rules that throw give one scan-error per rule and file, with line 0, the filtered error name and no message, and every other finding stays", () => {
    const scanArtifact = exported("scanArtifact");
    const real = realList();
    const byId = (id) => real.contents.find((r) => r.id === id);
    const THROWING = [
      ["synthetic-throwing-pattern", "regex", "pattern", () => new TypeError(SENTINEL), "TypeError"],
      ["synthetic-throwing-role", "jwt-role", "role", () => new RangeError(SENTINEL), "RangeError"],
      ["synthetic-odd-error-name", "regex", "pattern", () => namedError("Odd name 1"), "Error"],
      ["synthetic-long-error-name", "regex", "pattern", () => namedError("Q".repeat(41)), "Error"],
      ["synthetic-max-error-name", "regex", "pattern", () => namedError("Q".repeat(40)), "Q".repeat(40)],
    ];
    const throwing = THROWING.map(([id, kind, field, make]) => throwingRule(id, kind, field, make));
    const list = {
      version: 1,
      names: real.names.filter((r) => r.id === "vercel-config"),
      contents: [byId("supabase-secret-key"), throwing[0], byId("postgres-url-with-password"), throwing[1], throwing[2], throwing[3], throwing[4], byId(PRELOAD_RULE)],
      exceptions: [],
    };
    // Every file carries a service_role JWT, so a jwt-role rule must read its role on each one.
    const sr = triggerOf("service-role-jwt");
    const files = {
      "browser/a.js": `const t="${sr}";\nconst k="${triggerOf("supabase-secret-key")}";\nconst v="${TRIGGER_BY_RULE[PRELOAD_RULE]()}";\n`,
      "browser/b.js": `const u="${triggerOf("postgres-url-with-password")}";\nconst t="${sr}";\n`,
      "browser/vercel.json": `{"t":"${sr}"}\n`,
    };
    let findings;
    assert.doesNotThrow(() => { findings = scanArtifact(makeArtifact(files, { clean: false }), list); }, "scanArtifact no debe lanzar el error de una regla: debe convertirlo en scan-error");
    const key = (f) => `${keyOf(f)}${f.rule === "scan-error" ? `|${f.sample}` : ""}`;
    const want = [
      "browser/a.js:2|supabase-secret-key",
      `browser/a.js:3|${PRELOAD_RULE}`,
      "browser/b.js:1|postgres-url-with-password",
      "browser/vercel.json:0|vercel-config",
      ...Object.keys(files).flatMap((path) => THROWING.map(([id, , , , type]) => `${path}:0|scan-error|${scanErrorSample(id, type)}`)),
    ].sort();
    assert.deepEqual(findings.map(key).sort(), want, `se esperaba un scan-error por regla y archivo y el resto de hallazgos: ${JSON.stringify(findings)}`);
    for (const f of findings) assert.deepEqual(Object.keys(f).sort(), ["line", "path", "rule", "sample"], `forma del hallazgo: ${JSON.stringify(f)}`);
    assert.ok(!JSON.stringify(findings).includes(SENTINEL), "sample no puede mostrar error.message");
  });

  test("[EP00-TBR-019-CA3] CLI: a RangeError on every exec of one rule gives one scan-error line per file, the rest of the findings and the summary, with no trace and no message", () => {
    const dir = makeArtifact(ca3Files());
    const paths = Object.keys({ ...CLEAN_FILES(), ...ca3Files() });
    const r = runWithPreload(execPreload("always"), ["--dir", dir]);
    assertClosedAndSilent(r);
    const lines = errorLines(r.stderr);
    for (const path of paths) assert.equal(lines.filter((l) => l === scanErrorLine(path, PRELOAD_RULE, "RangeError")).length, 1, `${path}: se esperaba una línea de scan-error de ${PRELOAD_RULE}\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.ok(names(r.stderr, CA3_TARGET, "supabase-secret-key", 3), `falta el hallazgo de supabase-secret-key en ${CA3_TARGET}:3\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.ok(names(r.stderr, CA3_OTHER, "postgres-url-with-password", 1), `falta el hallazgo de postgres-url-with-password en ${CA3_OTHER}:1\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.ok(names(r.stderr, "browser/vercel.json", "vercel-config"), `falta el hallazgo de vercel-config\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.ok(!lines.some((l) => l.includes(`· ${PRELOAD_RULE} ·`)), `con el error no queda ningún hallazgo suelto de ${PRELOAD_RULE}\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.equal(Number(SUMMARY_RE.exec(r.stderr)?.[1]), paths.length + 3, `el resumen debe contar ${paths.length + 3} hallazgos\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.equal(lines.length, paths.length + 3, `se esperaban ${paths.length + 3} líneas ERROR\nstderr: ${r.stderr.slice(0, 3_000)}`);
  });

  test("[EP00-TBR-019-CA3] CLI §12.3: when the error comes on the second match, the first match stays, plus the scan-error of the rule and the rest of the findings", () => {
    const dir = makeArtifact(ca3Files());
    const r = runWithPreload(execPreload("second"), ["--dir", dir]);
    assertClosedAndSilent(r);
    const lines = errorLines(r.stderr);
    assert.ok(names(r.stderr, CA3_TARGET, PRELOAD_RULE, 2), `la coincidencia anterior al error (${CA3_TARGET}:2) debe conservarse\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.ok(!names(r.stderr, CA3_TARGET, PRELOAD_RULE, 4), `la coincidencia posterior al error no sale (la absorbe el scan-error)\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.deepEqual(lines.filter((l) => l.includes("· scan-error ·")), [scanErrorLine(CA3_TARGET, PRELOAD_RULE, "RangeError")], `se esperaba un único scan-error, el del archivo con dos coincidencias\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.ok(names(r.stderr, CA3_TARGET, "supabase-secret-key", 3), `falta el hallazgo de supabase-secret-key en ${CA3_TARGET}:3\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.ok(names(r.stderr, CA3_OTHER, "postgres-url-with-password", 1), `falta el hallazgo de postgres-url-with-password\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.ok(names(r.stderr, "browser/vercel.json", "vercel-config"), `falta el hallazgo de vercel-config\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.equal(Number(SUMMARY_RE.exec(r.stderr)?.[1]), 5, `el resumen debe contar 5 hallazgos\nstderr: ${r.stderr.slice(0, 3_000)}`);
  });

  test("[EP00-TBR-019-CA3] R7: lstatSync failing on one entry gives unreadable on that path and the rest is still reviewed", () => {
    const target = "browser/chunk-LSTAT.js";
    const dir = makeArtifact({ [target]: `const k="${triggerOf("supabase-secret-key")}";\n`, [CA3_OTHER]: ca3Files()[CA3_OTHER], "browser/vercel.json": "{}\n" });
    const r = runWithPreload(builtinPreload("node:fs", "lstatSync", 0, "chunk-LSTAT.js", "EACCES"), ["--dir", dir]);
    assertClosedAndSilent(r);
    assert.ok(errorLines(r.stderr).includes(`ERROR  ${target}  · unreadable · no se pudo leer la entrada`), `se esperaba «ERROR  ${target}  · unreadable · no se pudo leer la entrada»\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.ok(names(r.stderr, CA3_OTHER, "postgres-url-with-password", 1), `el resto debe revisarse (postgres-url-with-password en ${CA3_OTHER})\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.ok(names(r.stderr, "browser/vercel.json", "vercel-config"), `el resto debe revisarse (vercel-config)\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.match(r.stderr, SUMMARY_RE, `falta el resumen\nstderr: ${r.stderr.slice(0, 3_000)}`);
  });

  test("[EP00-TBR-019-CA3] final net: an error outside the protected steps exits 1 with «error inesperado al revisar», the error name, no trace and no message", () => {
    const dir = makeArtifact({ "browser/chunk-NET.js": `const k="${triggerOf("supabase-secret-key")}";\n` });
    const r = runWithPreload(builtinPreload("node:path", "relative", 1, "chunk-NET.js"), ["--dir", dir]);
    assertClosedAndSilent(r);
    const m = /^check-artifact: error inesperado al revisar (.+) \(RangeError\); la revisión falla y no se sube nada$/m.exec(r.output);
    assert.ok(m, `se esperaba «check-artifact: error inesperado al revisar <dir> (RangeError); la revisión falla y no se sube nada»\n${r.output.slice(0, 3_000)}`);
    assert.ok(m[1].endsWith(dir.split("/").pop()), `el mensaje debe nombrar la carpeta revisada: ${m[1]}`);
    assert.doesNotMatch(r.output, /0 hallazgos/, `la red final nunca da un resultado limpio\n${r.output.slice(0, 2_000)}`);
  });
});

// ---------------------------------------------------------------------------------------------
// T3 · edge cases added in the quality review, after reading the fix (black box on CA1 and CA3; only added).
// ---------------------------------------------------------------------------------------------
// Like execPreload("always"), but every exec of the patterns of several rules throws a RangeError with the sentinel.
const execPreloadRules = (ids) => `
import { readFileSync } from "node:fs";
const list = JSON.parse(readFileSync(${JSON.stringify(LIST)}, "utf8"));
const ids = ${JSON.stringify(ids)};
const sources = new Set(list.contents.filter((r) => ids.includes(r.id)).map((r) => new RegExp(r.pattern, "u").source));
const exec = RegExp.prototype.exec;
RegExp.prototype.exec = function (s) {
  if (sources.has(this.source)) throw new RangeError(${JSON.stringify(SENTINEL)});
  return exec.call(this, s);
};
`;

describe("[EP00-TBR-019-CA1][EP00-TBR-019-CA3] T3 edge cases: CRLF, several scan-errors in one run, the file count, odd thrown values", () => {
  test("[EP00-TBR-019-CA1] CRLF: a 7 M sb_secret_ block ended by CRLF gives the exact result on lines 1 and 2, with no scan-error, in under 7 s", (t) => {
    const trigger = TRIGGER_BY_RULE["supabase-secret-key"]();
    const { ms, findings } = timedScan(makeArtifact({ [LONG_PATH]: `sb_${"secret_"}${"a".repeat(LONG)}\r\nconst k="${trigger}";\r\n` }), "sb_secret_ 7 M CRLF", LONG_KILL_MS);
    assert.deepEqual(findings.map(keyOf).sort(), [`${LONG_PATH}:1|supabase-secret-key`, `${LONG_PATH}:2|supabase-secret-key`], `con CRLF el resultado debe ser exacto: ${JSON.stringify(findings).slice(0, 2_000)}`);
    assert.ok(!JSON.stringify(findings).includes("\\r"), "sample no puede arrastrar el retorno de carro");
    assert.ok(ms < LONG_LIMIT_MS, `la revisión tardó ${Math.round(ms)} ms; el límite es ${LONG_LIMIT_MS} ms`);
    t.diagnostic(`sb_secret_ 7 M CRLF: Node ${process.version} · ${Math.round(ms)} ms`);
  });

  test("[EP00-TBR-019-CA1] R6 with a real V8 error: a 7 M BEGIN block with a secret of another rule on the next line gives branch A or B, and that secret is found in both", (t) => {
    const sb = triggerOf("supabase-secret-key");
    const { ms, findings } = timedScan(makeArtifact({ [LONG_PATH]: `${BEGIN}${"A ".repeat(LONG / 2)}\r\nconst k="${sb}";\r\n` }), "BEGIN 7 M + sb_secret_", LONG_KILL_MS);
    const got = findings.map(keyOf).sort();
    const a = [`${LONG_PATH}:2|supabase-secret-key`];
    const b = [`${LONG_PATH}:0|scan-error`, `${LONG_PATH}:2|supabase-secret-key`];
    const branch = sameList(got, a) ? "A" : sameList(got, b) && findings.find((f) => f.rule === "scan-error").sample === scanErrorSample("private-key-block") ? "B" : null;
    assert.ok(branch, `se esperaba la rama A (${a.join(", ")}) o la B (${b.join(", ")}, con el scan-error de private-key-block); llegó: ${JSON.stringify(findings).slice(0, 2_000)}`);
    assert.deepEqual(leakedPieces(JSON.stringify(findings), sb), [], "sample no puede mostrar el secreto");
    assert.ok(ms < LONG_LIMIT_MS, `la revisión tardó ${Math.round(ms)} ms; el límite es ${LONG_LIMIT_MS} ms`);
    t.diagnostic(`BEGIN 7 M + sb_secret_ en la línea 2 (CRLF): rama ${branch} · Node ${process.version} · ${Math.round(ms)} ms`);
  });

  test("[EP00-TBR-019-CA3] CLI: two rules failing on every CRLF file give one scan-error per rule and file, the other findings on their lines, and a summary that counts files, not findings", () => {
    const ids = ["vercel-token-env", "supabase-service-role-env"];
    const extra = {
      "browser/chunk-CRLF-A.js": ["/* synthetic */", `const t="${TRIGGER_BY_RULE["vercel-token-env"]()}";`, `const k="${triggerOf("supabase-secret-key")}";`, `const s="${TRIGGER_BY_RULE["supabase-service-role-env"]()}";`].join("\r\n") + "\r\n",
      "browser/chunk-CRLF-B.js": `/* synthetic */\r\nconst u="${triggerOf("postgres-url-with-password")}";\r\n`,
    };
    const paths = Object.keys({ ...CLEAN_FILES(), ...extra });
    const r = runWithPreload(execPreloadRules(ids), ["--dir", makeArtifact(extra)]);
    assertClosedAndSilent(r);
    const lines = errorLines(r.stderr);
    for (const path of paths) {
      for (const id of ids) assert.equal(lines.filter((l) => l === scanErrorLine(path, id, "RangeError")).length, 1, `${path}: se esperaba exactamente una línea de scan-error de ${id}\nstderr: ${r.stderr.slice(0, 3_000)}`);
    }
    assert.ok(names(r.stderr, "browser/chunk-CRLF-A.js", "supabase-secret-key", 3), `con CRLF, supabase-secret-key debe salir en la línea 3\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.ok(names(r.stderr, "browser/chunk-CRLF-B.js", "postgres-url-with-password", 2), `con CRLF, postgres-url-with-password debe salir en la línea 2\nstderr: ${r.stderr.slice(0, 3_000)}`);
    const want = paths.length * ids.length + 2;
    assert.equal(lines.length, want, `se esperaban ${want} líneas ERROR\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.ok(!r.stderr.includes("\r"), "la salida no puede arrastrar retornos de carro del artefacto");
    assert.equal(Number(SUMMARY_RE.exec(r.stderr)?.[1]), want, `el resumen debe contar ${want} hallazgos\nstderr: ${r.stderr.slice(0, 3_000)}`);
    assert.equal(Number(SUMMARY_FILES_RE.exec(r.stderr)?.[1]), paths.length, `«N archivo(s)» cuenta archivos (${paths.length}), no hallazgos ni scan-error\nstderr: ${r.stderr.slice(0, 3_000)}`);
  });

  test("[EP00-TBR-019-CA3] in process: a thrown value that is not an Error (text, null, undefined, a plain object) still gives a scan-error with the type «Error» and never the thrown text", () => {
    const scanArtifact = exported("scanArtifact");
    const THROWN = [
      ["synthetic-throws-text", () => `${SENTINEL} text`],
      ["synthetic-throws-null", () => null],
      ["synthetic-throws-undefined", () => undefined],
      ["synthetic-throws-object", () => ({ name: `${SENTINEL} name`, message: SENTINEL })],
    ];
    const list = { version: 1, names: [], contents: [...THROWN.map(([id, make]) => throwingRule(id, "regex", "pattern", make)), realList().contents.find((r) => r.id === "supabase-secret-key")], exceptions: [] };
    const path = "browser/chunk-THROWN.js";
    let findings;
    assert.doesNotThrow(() => { findings = scanArtifact(makeArtifact({ [path]: `/* synthetic */\r\nconst k="${triggerOf("supabase-secret-key")}";\r\n` }, { clean: false }), list); }, "scanArtifact no debe lanzar: el valor lanzado se convierte en scan-error");
    const want = [...THROWN.map(([id]) => `${path}:0|scan-error|${scanErrorSample(id, "Error")}`), `${path}:2|supabase-secret-key`].sort();
    assert.deepEqual(findings.map((f) => `${keyOf(f)}${f.rule === "scan-error" ? `|${f.sample}` : ""}`).sort(), want, `se esperaba un scan-error «(Error)» por regla y el hallazgo de la línea 2: ${JSON.stringify(findings)}`);
    assert.ok(!JSON.stringify(findings).includes(SENTINEL), "sample no puede mostrar el valor lanzado");
  });
});
