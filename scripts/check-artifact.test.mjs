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
  // (~11 s), and a 2 MB bundle would block CI. scanArtifact runs in a child killed after HOSTILE_KILL_MS and only the
  // scan is timed (not Node's start-up), so the 2 s bound leaves a wide margin for a slow CI runner.
  const HOSTILE_LIMIT_MS = 2_000;
  const HOSTILE_KILL_MS = 45_000;
  const HOSTILE = [
    ["~210 KB of repeated eyJ", () => "eyJ".repeat(70_000)],
    ["~210 KB of repeated eyJ split by one dot", () => `${"eyJ".repeat(35_000)}.${"eyJ".repeat(35_000)}`],
  ];
  for (const [title, hostile] of HOSTILE) {
    test(`[EP00-TBR-002-CA3] reviews a hostile file (${title}) in under 2 s and still finds the service_role JWT after it`, () => {
      assert.ok(existsSync(SCRIPT), "no existe el script scripts/check-artifact.mjs");
      const path = "browser/chunk-HOSTILE.js";
      const dir = makeArtifact({ [path]: `${hostile()}\nconst k="${triggerOf("service-role-jwt")}";\n` });
      const code = [
        `const m = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)});`,
        `const list = m.loadPatternList(${JSON.stringify(LIST)});`,
        `const t0 = performance.now();`,
        `const findings = m.scanArtifact(${JSON.stringify(dir)}, list);`,
        `process.stdout.write(JSON.stringify({ ms: performance.now() - t0, findings }));`,
      ].join("\n");
      const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: FRONT, encoding: "utf8", timeout: HOSTILE_KILL_MS, killSignal: "SIGKILL" });
      if (r.status === null) assert.fail(`la revisión del archivo hostil no terminó en ${HOSTILE_KILL_MS / 1000} s (señal ${r.signal}): la búsqueda de JWT no está acotada`);
      assert.equal(r.status, 0, `scanArtifact falló con el archivo hostil\nstderr: ${r.stderr}`);
      const { ms, findings } = JSON.parse(r.stdout);
      assert.deepEqual(findings.map((f) => `${f.path}:${f.line}|${f.rule}`), [`${path}:2|service-role-jwt`], `el resultado debe ser exacto: ${JSON.stringify(findings)}`);
      assert.ok(ms < HOSTILE_LIMIT_MS, `revisar el archivo hostil (${title}) tardó ${Math.round(ms)} ms; el límite es ${HOSTILE_LIMIT_MS} ms (la búsqueda de JWT debe ser lineal)`);
    });
  }

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
