// Black-box tests for scripts/check-artifact.mjs and scripts/forbidden-artifact-patterns.json (EP00-TBR-002),
// written from the criteria and the design (docs/diseno/EP00-TBR-002.md §8.3, §8.4, §8.6 and §8.9)
// before the script exists.
// [EP00-TBR-002-CA3] The artifact check reviews dist/the-brain-front/ (browser/ and its root) against the list of
// forbidden patterns (names, contents, exceptions), fails on any finding, never prints a secret in full,
// fails closed (missing artifact, bad arguments, symlinks, unreadable files) and passes a clean artifact.
// [EP00-TBR-002-CA3] R3: the mandatory minimum of the list is copied here on purpose. Emptying the list means
// editing this file too, and that shows in the diff. Each minimum rule is also planted in a fake dist.
// [EP00-TBR-002-CA1] package.json has typecheck (R1) plus ci:test and artifact:check with the exact text of §8.6.
// Synthetic secrets are assembled at runtime so no key-like string is committed (RG-4). No real data.
// Fixtures live under tmp/ (ignored by git) and are removed afterwards.
// Run: node --test scripts/check-artifact.test.mjs
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(FRONT, "scripts", "check-artifact.mjs");
const LIST = join(FRONT, "scripts", "forbidden-artifact-patterns.json");
const TMP = join(FRONT, "tmp");
const CHILD_TIMEOUT_MS = 60_000;

// [EP00-TBR-002-CA3] R3 · Mandatory minimum (design §8.4). Literal copy: same id, kind and name, or same kind and role.
const MINIMUM = {
  names: [
    { id: "vercel-config", kind: "file", name: "vercel.json" },
    { id: "vercel-dir", kind: "dir", name: ".vercel" },
    { id: "netlify-config", kind: "file", name: "netlify.toml" },
    { id: "firebase-config", kind: "file", name: "firebase.json" },
    { id: "env-file", kind: "file", name: ".env" },
  ],
  contents: [
    { id: "private-key-block", kind: "regex" },
    { id: "service-role-jwt", kind: "jwt-role", role: "service_role" },
    { id: "supabase-secret-key", kind: "regex" },
    { id: "postgres-url-with-password", kind: "regex" },
  ],
};
const MINIMUM_IDS = [...MINIMUM.names, ...MINIMUM.contents].map((r) => r.id);

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

// A failing review: exit != 0, not a crash, a summary and the expected path + id on one line.
function assertFinding(r, path, id, line) {
  assert.notEqual(r.status, 0, `se esperaba un código distinto de 0 por ${id} en ${path}\n${r.output}`);
  assert.doesNotMatch(r.output, STACK_TRACE_RE, `la revisión no debe terminar con una traza\n${r.output}`);
  assert.ok(names(r.output, path, id, line), `la salida debe nombrar ${path}${line ? `:${line}` : ""} y ${id} en una línea\n${r.output}`);
  assert.match(r.output, SUMMARY_RE, `falta el resumen «check-artifact: N hallazgo(s)…»\n${r.output}`);
}

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
    const m = CLEAN_RE.exec(r.output);
    assert.ok(m, `falta «check-artifact: 0 hallazgos en N archivo(s) de <dir>; listo para subir»\n${r.output}`);
    assert.equal(Number(m[1]), Object.keys(files).length, `el conteo de archivos revisados no coincide\n${r.output}`);
  });
});

describe("[EP00-TBR-002-CA3] forbidden names (mandatory minimum)", () => {
  for (const rule of MINIMUM.names) {
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

  test("[EP00-TBR-002-CA3] reviews contents of binary files", () => {
    const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0xff]), Buffer.from(`\n${triggerOf("service-role-jwt")}\n`), Buffer.from([0, 1, 2])]);
    const r = scan(makeArtifact({ "browser/media/logo.png": bytes }));
    assertFinding(r, "browser/media/logo.png", "service-role-jwt");
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
      assert.notEqual(r.status, 0, `un artefacto ausente o vacío nunca pasa\n${r.output}`);
      assert.match(r.output, /No existe el artefacto en /, `falta «No existe el artefacto en <dir>; corre npm run build»\n${r.output}`);
      assert.match(r.output, /npm run build/, r.output);
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
      assert.notEqual(r.status, 0, `debe rechazar los argumentos\n${r.output}`);
      assert.match(r.stderr, /--dir/, `stderr debe mostrar el uso (con --dir)\nstderr: ${r.stderr}`);
      assert.doesNotMatch(r.output, /hallazgo/, `no debe revisar nada\n${r.output}`);
      assert.doesNotMatch(r.output, /vercel-config/, `no debe revisar nada\n${r.output}`);
      assert.doesNotMatch(r.stderr, STACK_TRACE_RE, `el rechazo no debe ser una traza\n${r.stderr}`);
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
    const hits = (realList().exceptions ?? []).filter((e) => MINIMUM_IDS.includes(e.rule)).map((e) => `${e.rule} → ${e.path}`);
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
