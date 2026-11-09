/**
 * Reglas de arquitectura del frontend, adaptadas de la plantilla del arnés
 * (the-brain-harness: plantillas-ci/dependency-cruiser.cjs y docs/reglas-ci.md; DEC-0005 punto 5).
 * La plantilla es del backend (domain/application/infrastructure, Prisma, Hub). Aquí rige la misma idea:
 * fronteras entre módulos, design system independiente y nada de backend ni del Hub en el navegador.
 *
 * Estructura que se asume: src/app/<modulo>/ por cada uno de los 8 módulos de CLAUDE.md del arnés,
 * con src/app/<modulo>/index.ts como API pública del módulo. src/ui/ es el design system.
 * Uso: npm run arch:check (corre en CI).
 */
const MODULOS = ["catalogo", "abastecimiento", "compras", "inventario", "comercial", "inteligencia", "integracion", "administracion"];

module.exports = {
  forbidden: [
    ...MODULOS.map((m) => ({
      name: `frontera-${m}`,
      comment: `Nadie importa internos de ${m}; solo su API pública (src/app/${m}/index.ts).`,
      severity: "error",
      from: { path: "^src/", pathNot: `^src/app/${m}/` },
      to: { path: `^src/app/${m}/`, pathNot: `^src/app/${m}/index\\.ts$` },
    })),
    {
      name: "ui-independiente",
      comment: "El design system (src/ui/) no conoce la app: no importa nada de src/app/.",
      severity: "error",
      from: { path: "^src/ui/" },
      to: { path: "^src/app/" },
    },
    {
      name: "sin-backend-en-el-front",
      comment: "El navegador no usa Nest, Prisma ni drivers de PostgreSQL: los datos pasan por TheBrainApi.",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "node_modules/(@nestjs|@prisma|prisma|pg|postgres)/" },
    },
    {
      name: "hub-solo-por-api",
      comment: "El front nunca llama al Hub ni a Compaql: solo a TheBrainApi, que tiene la capa anticorrupción.",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "(hub-client|HubClient|compaql)" },
    },
    {
      name: "sin-ciclos",
      comment: "Sin dependencias circulares.",
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
