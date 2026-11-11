// Black-box tests for .github/workflows/ci.yml (EP00-TBR-002), written from the criteria and the design
// (docs/diseno/EP00-TBR-002.md §8.5 and §8.9) before the new workflow exists.
// [EP00-TBR-002-CA1] Every PR runs, on the whole project, ds:check (ds:validate), typecheck (tsc), tests,
// arch:check and the build, in one job that reports to the PR.
// [EP00-TBR-002-CA2] Automatic part only: one required job "frontend" with no job-level "if", "needs" or matrix
// (a skipped job counts as passed), no continue-on-error, no step-level "if", a timeout and concurrency per PR.
// Branch protection itself is verified by hand (E1, M1, M3 of §8.9), not here.
// [EP00-TBR-002-CA3] artifact:check runs after the build and only then upload-artifact sends dist/the-brain-front/.
// The workflow is read as plain text (no YAML dependency, design §8.1). A person applies ci.yml (AJ-1), so these
// tests fail until H1 lands; the self-checks below prove the assertions against the §8.5 sample meanwhile.
// Run: node --test scripts/ci-workflow.test.mjs
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = join(FRONT, ".github", "workflows", "ci.yml");

const JOB_ID = "frontend";
const MAX_TIMEOUT_MINUTES = 30;
const EXPECTED_RUNS = [
  "npm ci",
  "npm run ds:check",
  "npm run typecheck",
  "npm run arch:check",
  "npm test -- --watch=false",
  "npm run build",
  "npm run artifact:check",
];
const UPLOAD_ACTION = "actions/upload-artifact@v4";
const ARTIFACT_PATH = "dist/the-brain-front/";
const FORBIDDEN_PR_FILTERS = ["paths", "paths-ignore", "branches", "branches-ignore"];

// ---------------------------------------------------------------------------------------------
// Minimal reader for the YAML subset used by ci.yml: block mappings, "- " sequences, inline scalars
// and one-line flow lists. Anything else simply does not match and the assertions fail closed.
// ---------------------------------------------------------------------------------------------

// Drops a trailing comment that starts outside quotes.
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

// Meaningful lines (no blanks, no comments) with their indentation and 1-based line number.
function parseLines(text) {
  return text
    .split(/\r?\n/)
    .map((raw, i) => ({ raw: stripComment(raw).replace(/\s+$/, ""), n: i + 1 }))
    .filter((l) => l.raw.trim() !== "")
    .map((l) => ({ indent: /^ */.exec(l.raw)[0].length, text: l.raw.trim(), n: l.n }));
}

const unquote = (v) => (/^(["']).*\1$/.test(v) ? v.slice(1, -1) : v);

function keyValue(text) {
  const m = /^([A-Za-z0-9_"'-]+):(?:\s+(.*))?$/.exec(text);
  return m ? { key: unquote(m[1]), value: unquote((m[2] ?? "").trim()) } : null;
}

// Lines nested under lines[i] (strictly deeper indentation).
function childBlock(lines, i) {
  const out = [];
  for (let j = i + 1; j < lines.length && lines[j].indent > lines[i].indent; j++) out.push(lines[j]);
  return out;
}

// Direct children of a block as { key, value, block } entries.
function entries(block) {
  if (block.length === 0) return [];
  const base = Math.min(...block.map((l) => l.indent));
  const out = [];
  block.forEach((l, i) => {
    if (l.indent !== base) return;
    const kv = keyValue(l.text);
    out.push({ key: kv?.key ?? null, value: kv?.value ?? l.text, line: l, block: childBlock(block, i) });
  });
  return out;
}

const topLevel = (lines) => entries(lines);
const find = (list, key) => list.find((e) => e.key === key) ?? null;

function flowList(value, block) {
  const v = value.trim();
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(",").map((s) => unquote(s.trim())).filter(Boolean);
  if (v) return [unquote(v)];
  return entries(block).map((e) => unquote(e.line.text.replace(/^-\s*/, "")));
}

// Steps of a "steps:" block: each item keeps its own fields and its "with:" map.
function parseSteps(block) {
  if (block.length === 0) return [];
  const base = Math.min(...block.map((l) => l.indent));
  const items = [];
  for (const l of block) {
    if (l.indent === base && l.text.startsWith("- ")) items.push([{ indent: base + 2, text: l.text.slice(2).trim(), n: l.n }]);
    else if (items.length) items.at(-1).push(l);
  }
  return items.map((lines) => {
    const step = { fields: {}, with: {}, line: lines[0].n };
    let inWith = false;
    for (const l of lines) {
      const kv = keyValue(l.text);
      if (!kv) continue;
      if (l.indent === base + 2) { step.fields[kv.key] = kv.value; inWith = kv.key === "with"; }
      else if (inWith) step.with[kv.key] = kv.value;
    }
    return step;
  });
}

const cleanText = (text) => parseLines(text).map((l) => l.text).join("\n");
const jobsOf = (text) => entries(find(topLevel(parseLines(text)), "jobs")?.block ?? []);
const jobOf = (text) => find(jobsOf(text), JOB_ID);
const stepsOf = (text) => parseSteps(find(entries(jobOf(text)?.block ?? []), "steps")?.block ?? []);

// ---------------------------------------------------------------------------------------------
// Checks. Each one returns the list of problems (messages for people, in Spanish); [] means OK.
// ---------------------------------------------------------------------------------------------

// [CA1, R6] pull_request with no filters (the check always reports), push to main, no privileged triggers.
function triggerProblems(text) {
  const problems = [];
  const top = topLevel(parseLines(text));
  const on = find(top, "on") ?? find(top, "true");
  if (!on) return ["falta el bloque «on:» en la raíz"];
  const events = entries(on.block);
  const pr = find(events, "pull_request");
  if (!pr) problems.push("«on:» no tiene pull_request");
  else {
    const filters = entries(pr.block).map((e) => e.key).filter((k) => FORBIDDEN_PR_FILTERS.includes(k));
    if (filters.length) problems.push(`pull_request tiene filtros que pueden dejar el check sin reportar: ${filters.join(", ")}`);
    if (pr.value && pr.value !== "{}" && pr.value !== "null") problems.push(`pull_request tiene un valor inesperado: ${pr.value}`);
  }
  const push = find(events, "push");
  if (!push) problems.push("«on:» no tiene push");
  else {
    const branches = find(entries(push.block), "branches");
    const list = branches ? flowList(branches.value, branches.block) : [];
    if (JSON.stringify(list) !== JSON.stringify(["main"])) problems.push(`push debe ser solo a main; ramas: ${JSON.stringify(list)}`);
  }
  const clean = cleanText(text);
  for (const banned of ["pull_request_target", "workflow_run"]) {
    if (new RegExp(`\\b${banned}\\b`).exec(clean)) problems.push(`el workflow no puede usar ${banned}`);
  }
  return problems;
}

// [R6] Root permissions are exactly contents: read, nothing writes, and checkout does not keep the token.
function permissionProblems(text) {
  const problems = [];
  const permissions = find(topLevel(parseLines(text)), "permissions");
  if (!permissions) problems.push("falta «permissions:» en la raíz");
  else {
    const list = entries(permissions.block).map((e) => e.line.text);
    if (permissions.value || JSON.stringify(list) !== JSON.stringify(["contents: read"])) {
      problems.push(`«permissions:» de la raíz debe ser exactamente «contents: read»; es: ${permissions.value || list.join(", ")}`);
    }
  }
  if (/:\s*write(?:-all)?\b|\bwrite-all\b/.exec(cleanText(text))) problems.push("hay un permiso de escritura en el workflow");
  const checkout = stepsOf(text).find((s) => (s.fields.uses ?? "").startsWith("actions/checkout@"));
  if (!checkout) problems.push("no hay paso actions/checkout");
  else if (checkout.with["persist-credentials"] !== "false") problems.push("actions/checkout debe llevar persist-credentials: false");
  return problems;
}

// [CA2, R5, R6] One job, id and name "frontend", with no job-level if/needs/matrix and a bounded timeout.
function jobProblems(text) {
  const problems = [];
  const jobs = jobsOf(text);
  const ids = jobs.map((j) => j.key);
  if (JSON.stringify(ids) !== JSON.stringify([JOB_ID])) problems.push(`debe haber un solo job, «${JOB_ID}»; hay: ${ids.join(", ") || "ninguno"}`);
  const job = jobOf(text);
  if (!job) return problems;
  const fields = entries(job.block);
  const name = find(fields, "name");
  if (name?.value !== JOB_ID) problems.push(`el job debe tener name: ${JOB_ID} (nombre estable del check requerido); tiene: ${name?.value ?? "ninguno"}`);
  for (const key of ["if", "needs", "strategy"]) {
    if (find(fields, key)) problems.push(`el job no puede tener «${key}:» (un job omitido o renombrado desbloquea la integración)`);
  }
  const timeout = find(fields, "timeout-minutes");
  if (!timeout) problems.push("falta timeout-minutes en el job");
  else if (!/^\d+$/.test(timeout.value) || Number(timeout.value) < 1 || Number(timeout.value) > MAX_TIMEOUT_MINUTES) {
    problems.push(`timeout-minutes debe ser un entero entre 1 y ${MAX_TIMEOUT_MINUTES}; es: ${timeout.value}`);
  }
  return problems;
}

// [R6] One run per PR: group by PR number, fall back to the commit on main, cancel only the previous run.
function concurrencyProblems(text) {
  const problems = [];
  const concurrency = find(topLevel(parseLines(text)), "concurrency");
  if (!concurrency) return ["falta «concurrency:» en la raíz"];
  const fields = entries(concurrency.block);
  const group = find(fields, "group")?.value ?? "";
  if (!group.includes("github.event.pull_request.number")) problems.push(`concurrency.group debe agrupar por github.event.pull_request.number; es: ${group || "nada"}`);
  if (!/\bgithub\.(?:sha|run_id)\b/.test(group)) problems.push(`en main el grupo debe ser el commit (github.sha) para no cancelar nada; es: ${group || "nada"}`);
  if (find(fields, "cancel-in-progress")?.value !== "true") problems.push("concurrency debe tener cancel-in-progress: true");
  return problems;
}

// [CA1, CA3] The run steps are exactly the expected commands, in order, and the upload comes last.
function stepProblems(text) {
  const problems = [];
  const steps = stepsOf(text);
  if (steps.length === 0) return [`el job «${JOB_ID}» no tiene pasos`];
  const runs = steps.filter((s) => "run" in s.fields).map((s) => s.fields.run);
  if (JSON.stringify(runs) !== JSON.stringify(EXPECTED_RUNS)) {
    problems.push(`los comandos no son los esperados en orden.\nesperados: ${EXPECTED_RUNS.join(" → ")}\nencontrados: ${runs.join(" → ")}`);
  }
  const uploadAt = steps.findIndex((s) => s.fields.uses === UPLOAD_ACTION);
  const checkAt = steps.findIndex((s) => s.fields.run === "npm run artifact:check");
  if (uploadAt < 0) problems.push(`falta el paso ${UPLOAD_ACTION}`);
  else if (checkAt < 0 || uploadAt < checkAt) problems.push("la subida del artefacto debe ir después de npm run artifact:check");
  else if (uploadAt !== steps.length - 1) problems.push("la subida del artefacto debe ser el último paso");
  return problems;
}

// [CA3] The upload sends dist/the-brain-front/ and fails when there is nothing to send.
function uploadProblems(text) {
  const problems = [];
  const uploads = stepsOf(text).filter((s) => (s.fields.uses ?? "").startsWith("actions/upload-artifact@"));
  if (uploads.length !== 1) return [`debe haber exactamente un paso actions/upload-artifact; hay ${uploads.length}`];
  const [upload] = uploads;
  if (upload.fields.uses !== UPLOAD_ACTION) problems.push(`se espera ${UPLOAD_ACTION}; es: ${upload.fields.uses}`);
  if (upload.with.path !== ARTIFACT_PATH) problems.push(`upload-artifact debe subir ${ARTIFACT_PATH}; sube: ${upload.with.path ?? "nada"}`);
  if (upload.with["if-no-files-found"] !== "error") problems.push("upload-artifact debe llevar if-no-files-found: error");
  return problems;
}

// [CA2, R6] Nothing turns a failure into a pass or skips a step, and no secret reaches the workflow.
function guardProblems(text) {
  const problems = [];
  for (const l of parseLines(text)) {
    const t = l.text.replace(/^-\s+/, "");
    if (/^continue-on-error:/.test(t)) problems.push(`línea ${l.n}: continue-on-error no está permitido`);
    if (/^if:/.test(t)) problems.push(`línea ${l.n}: «if:» no está permitido (un paso o job omitido cuenta como superado)`);
    if (/\bsecrets\./.test(l.text)) problems.push(`línea ${l.n}: el workflow no puede leer secrets.*`);
  }
  return problems;
}

const CHECKS = { triggerProblems, permissionProblems, jobProblems, concurrencyProblems, stepProblems, uploadProblems, guardProblems };
// Criterion each check backs (used in the self-check titles).
const TAGS = {
  triggerProblems: "[EP00-TBR-002-CA1]",
  permissionProblems: "[EP00-TBR-002-CA2]",
  jobProblems: "[EP00-TBR-002-CA2]",
  concurrencyProblems: "[EP00-TBR-002-CA2]",
  stepProblems: "[EP00-TBR-002-CA1][EP00-TBR-002-CA3]",
  uploadProblems: "[EP00-TBR-002-CA3]",
  guardProblems: "[EP00-TBR-002-CA2]",
};

// ---------------------------------------------------------------------------------------------
// Self-checks: the §8.5 sample passes every check, and each mutation is caught by its check.
// ---------------------------------------------------------------------------------------------
const SAMPLE = [
  'name: ci',
  'on:',
  '  pull_request:',
  '  push:',
  '    branches: [main]',
  'permissions:',
  '  contents: read',
  '# One run per PR (a new push cancels the previous run of that PR); pushes to main group by commit and never cancel.',
  'concurrency:',
  '  group: ci-${{ github.event.pull_request.number || github.sha }}',
  '  cancel-in-progress: true',
  'jobs:',
  '  # Required status check of main (EP00-TBR-002). Renaming this job or adding a job-level "if" breaks branch protection.',
  '  frontend:',
  '    name: frontend',
  '    runs-on: ubuntu-latest',
  '    timeout-minutes: 15',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '        with:',
  '          persist-credentials: false',
  '      - uses: actions/setup-node@v4',
  '        with:',
  '          node-version-file: .nvmrc',
  '          cache: npm',
  '      - name: Instalar dependencias',
  '        run: npm ci',
  '      - name: Validación estática · design system (ds:check, incluye ds:validate)',
  '        run: npm run ds:check',
  '      - name: Validación estática · tipos de la app y de las pruebas (tsc)',
  '        run: npm run typecheck',
  '      - name: Fronteras · reglas de arquitectura (arch:check)',
  '        run: npm run arch:check',
  '      - name: Pruebas',
  '        run: npm test -- --watch=false',
  '      - name: Build',
  '        run: npm run build',
  '      - name: Artefacto portátil · sin configuración de nube ni secretos (artifact:check)',
  '        run: npm run artifact:check',
  '      - name: Subir el artefacto como resultado de la CI (no se publica en ningún hosting)',
  '        uses: actions/upload-artifact@v4',
  '        with:',
  '          name: the-brain-front-dist',
  '          path: dist/the-brain-front/',
  '          if-no-files-found: error',
  '          retention-days: 14',
  '',
].join("\n");

function mutate(from, to) {
  assert.ok(SAMPLE.includes(from), `la muestra no contiene el texto a mutar: ${from}`);
  return SAMPLE.replace(from, to);
}

const MUTATIONS = [
  ["triggerProblems", "a paths filter on pull_request", mutate("  pull_request:\n", "  pull_request:\n    paths: ['src/**']\n")],
  ["triggerProblems", "a branches filter on pull_request", mutate("  pull_request:\n", "  pull_request:\n    branches: [main]\n")],
  ["triggerProblems", "a pull_request_target trigger", mutate("  push:\n", "  pull_request_target:\n  push:\n")],
  ["triggerProblems", "push to every branch", mutate("    branches: [main]\n", "    branches: ['**']\n")],
  ["permissionProblems", "contents: write", mutate("  contents: read\n", "  contents: write\n")],
  ["permissionProblems", "an extra root permission", mutate("  contents: read\n", "  contents: read\n  pull-requests: write\n")],
  ["permissionProblems", "checkout without persist-credentials: false", mutate("        with:\n          persist-credentials: false\n", "")],
  ["jobProblems", "a renamed check", mutate("    name: frontend\n", "    name: build\n")],
  ["jobProblems", "a second job", mutate("jobs:\n", "jobs:\n  setup:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n")],
  ["jobProblems", "a job-level needs", mutate("    timeout-minutes: 15\n", "    timeout-minutes: 15\n    needs: [setup]\n")],
  ["jobProblems", "a job-level if", mutate("    timeout-minutes: 15\n", "    timeout-minutes: 15\n    if: github.actor != 'bot'\n")],
  ["jobProblems", "a matrix (renames the check)", mutate("    timeout-minutes: 15\n", "    timeout-minutes: 15\n    strategy:\n      matrix:\n        node: [24]\n")],
  ["jobProblems", "a timeout above the limit", mutate("    timeout-minutes: 15\n", "    timeout-minutes: 120\n")],
  ["jobProblems", "no timeout", mutate("    timeout-minutes: 15\n", "")],
  ["concurrencyProblems", "grouping by ref", mutate("ci-${{ github.event.pull_request.number || github.sha }}", "ci-${{ github.ref }}")],
  ["concurrencyProblems", "no cancel-in-progress", mutate("  cancel-in-progress: true\n", "  cancel-in-progress: false\n")],
  ["stepProblems", "tests after the build", mutate("        run: npm test -- --watch=false\n      - name: Build\n        run: npm run build\n", "        run: npm run build\n      - name: Build\n        run: npm test -- --watch=false\n")],
  ["stepProblems", "a build that ignores its failure", mutate("        run: npm run build\n", "        run: npm run build || true\n")],
  ["stepProblems", "no typecheck step", mutate("        run: npm run typecheck\n", "        run: echo skip\n")],
  ["stepProblems", "the upload before artifact:check", mutate("        run: npm run artifact:check\n", "        uses: actions/upload-artifact@v4\n      - run: npm run artifact:check\n")],
  ["uploadProblems", "if-no-files-found: warn", mutate("          if-no-files-found: error\n", "          if-no-files-found: warn\n")],
  ["uploadProblems", "uploading all of dist/", mutate("          path: dist/the-brain-front/\n", "          path: dist/\n")],
  ["guardProblems", "continue-on-error on a step", mutate("        run: npm run arch:check\n", "        run: npm run arch:check\n        continue-on-error: true\n")],
  ["guardProblems", "a step-level if", mutate("      - name: Build\n", "      - name: Build\n        if: success()\n")],
  ["guardProblems", "a secret in the environment", mutate("        run: npm run build\n", "        run: npm run build\n        env:\n          TOKEN: ${{ secrets.DEPLOY_TOKEN }}\n")],
];

describe("[EP00-TBR-002-CA1][EP00-TBR-002-CA2][EP00-TBR-002-CA3] self-checks of the ci.yml reader", () => {
  test("[EP00-TBR-002-CA1][EP00-TBR-002-CA2][EP00-TBR-002-CA3] the §8.5 sample passes every check (comments are ignored)", () => {
    for (const [name, check] of Object.entries(CHECKS)) {
      assert.deepEqual(check(SAMPLE), [], `${name} rechaza la muestra de §8.5`);
    }
  });

  for (const [name, title, text] of MUTATIONS) {
    test(`${TAGS[name]} ${name} catches ${title}`, () => {
      assert.ok(CHECKS[name](text).length > 0, `${name} no detecta: ${title}`);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// The real workflow. It is applied by a person (H1); until then these tests fail on purpose.
// ---------------------------------------------------------------------------------------------
function workflowText() {
  assert.ok(existsSync(WORKFLOW), "no existe .github/workflows/ci.yml");
  return readFileSync(WORKFLOW, "utf8");
}
const report = (problems) => `.github/workflows/ci.yml no cumple §8.5:\n- ${problems.join("\n- ")}`;

describe("[EP00-TBR-002-CA1][EP00-TBR-002-CA2][EP00-TBR-002-CA3] .github/workflows/ci.yml", () => {
  test("[EP00-TBR-002-CA1] runs on every pull_request with no path or branch filter and on push to main, never on pull_request_target", () => {
    const problems = triggerProblems(workflowText());
    assert.deepEqual(problems, [], report(problems));
  });

  test("[EP00-TBR-002-CA2] root permissions are exactly contents: read, nothing writes and checkout drops the token", () => {
    const problems = permissionProblems(workflowText());
    assert.deepEqual(problems, [], report(problems));
  });

  test("[EP00-TBR-002-CA2] has one job, frontend, named frontend, with no if, needs or matrix and a timeout of 1 to 30 minutes", () => {
    const problems = jobProblems(workflowText());
    assert.deepEqual(problems, [], report(problems));
  });

  test("[EP00-TBR-002-CA2] concurrency groups by PR number, falls back to the commit and cancels the previous run", () => {
    const problems = concurrencyProblems(workflowText());
    assert.deepEqual(problems, [], report(problems));
  });

  test("[EP00-TBR-002-CA1][EP00-TBR-002-CA3] runs npm ci, ds:check, typecheck, arch:check, tests, build and artifact:check in order, then uploads", () => {
    const problems = stepProblems(workflowText());
    assert.deepEqual(problems, [], report(problems));
  });

  test("[EP00-TBR-002-CA3] uploads dist/the-brain-front/ with upload-artifact@v4 and if-no-files-found: error", () => {
    const problems = uploadProblems(workflowText());
    assert.deepEqual(problems, [], report(problems));
  });

  test("[EP00-TBR-002-CA2] has no continue-on-error, no if and no secrets", () => {
    const problems = guardProblems(workflowText());
    assert.deepEqual(problems, [], report(problems));
  });
});
