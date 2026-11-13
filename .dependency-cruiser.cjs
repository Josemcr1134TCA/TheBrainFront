/**
 * Frontend architecture rules, adapted from the harness template
 * (the-brain-harness: plantillas-ci/dependency-cruiser.cjs and docs/reglas-ci.md; DEC-0005 point 5).
 * The template is for the backend (domain/application/infrastructure, Prisma, Hub). Here the same idea applies:
 * boundaries between modules, an independent design system, and no backend or Hub code in the browser.
 *
 * Assumed layout: src/app/<module>/ for each of the 8 modules (names fixed by DEC-0017 of the harness),
 * with src/app/<module>/index.ts as the public API of the module and the folders pages/, components/, data/ and model/
 * (DEC-0012 of the harness: not hexagonal; only data/ talks to the API). src/ui/ is the design system.
 * Usage: npm run arch:check (runs in CI).
 */
const MODULES = ["catalog", "replenishment", "purchasing", "inventory", "commercial", "intelligence", "integration", "administration"];

module.exports = {
  forbidden: [
    ...MODULES.map((m) => ({
      name: `boundary-${m}`,
      comment: `Nobody imports internals of ${m}; only its public API (src/app/${m}/index.ts).`,
      severity: "error",
      from: { path: "^src/", pathNot: `^src/app/${m}/` },
      to: { path: `^src/app/${m}/`, pathNot: `^src/app/${m}/index\\.ts$` },
    })),
    {
      name: "ui-independent",
      comment: "The design system (src/ui/) does not know the app: it imports nothing from src/app/.",
      severity: "error",
      from: { path: "^src/ui/" },
      to: { path: "^src/app/" },
    },
    {
      name: "ui-public-api",
      comment: "Anything in src/ outside src/ui/ imports the design system only through its public API (src/ui/index.ts, plus the generated tokens/), never its internals (DA-3, EP00-TBR-004).",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/ui/" },
      to: { path: "^src/ui/", pathNot: "^src/ui/(index\\.ts$|tokens/)" },
    },
    {
      name: "no-backend-in-front",
      comment: "The browser uses no Nest, Prisma or PostgreSQL drivers: data goes through TheBrainApi.",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "node_modules/(@nestjs|@prisma|prisma|pg|postgres)/" },
    },
    {
      name: "hub-only-via-api",
      comment: "The front never calls the Hub or Compaql: only TheBrainApi, which holds the anti-corruption layer.",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "(hub-client|HubClient|compaql)" },
    },
    {
      name: "http-only-in-data",
      comment: "Only the data/ folder of each module talks to TheBrainApi (DEC-0012 of the harness). core/ and app.config.ts only configure HTTP.",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/app/([^/]+/data/|core/|app\\.config\\.ts$)" },
      to: { path: "node_modules/@angular/common/.*http" },
    },
    {
      name: "module-layers",
      comment: "data/ and model/ do not know the view: they do not import pages/ or components/ (DEC-0012 of the harness).",
      severity: "error",
      from: { path: "^src/app/[^/]+/(data|model)/" },
      to: { path: "^src/app/[^/]+/(pages|components)/" },
    },
    {
      name: "views-no-adapter",
      comment: "pages/ and components/ only know the port: they do not import concrete adapters (*.adapter.ts), fixtures (*.fixture.ts), data providers (*.providers.ts) or the data-mode switch; these live directly in data/ (EP00-TBR-003). This includes the identity adapter, fixtures and providers in core/data/ (EP00-TBR-005).",
      severity: "error",
      from: { path: "^src/app/[^/]+/(pages|components)/" },
      to: { path: "^src/app/([^/]+/data/[^/]+\\.(adapter|fixture|providers)|core/data/(data-mode|in-memory-failure))\\.ts$" },
    },
    {
      name: "no-cycles",
      comment: "No circular dependencies.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.(spec|test)\\.ts$" },
    tsConfig: { fileName: "tsconfig.app.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default"] },
  },
};
