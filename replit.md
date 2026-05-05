# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

- `artifacts/api-server` — Express API server (template).
- `artifacts/mockup-sandbox` — Vite preview server for canvas component mockups.
- `artifacts/intune-script-builder` — React + Vite web app: "Intune PowerShell Script Builder & Visualizer". Dark Microsoft/Azure-inspired theme. All client-side. Helps IT admins generate Intune Proactive Remediation scripts (detection, remediation, rollback) with execution-flow visualization and a deployment readiness checklist.
  - **Hosting**: published to GitHub Pages from `MikkelsenBrenno/PowershellTrainer` via `.github/workflows/deploy-pages.yml` (runs on push to `main` and `workflow_dispatch`). The workflow installs deps with pnpm 10 / Node 24, runs `pnpm --filter @workspace/intune-script-builder run build` with `BASE_PATH=/PowershellTrainer/`, copies `dist/public/index.html` to `404.html` for the SPA deep-link fallback, and publishes via `actions/upload-pages-artifact` + `actions/deploy-pages`. Live URL: `https://mikkelsenbrenno.github.io/PowershellTrainer/`. To enable the first deploy, set the repo's **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.
  - `vite.config.ts` uses `defineConfig(async ({ command }) => …)` so `PORT` is only required for `command === "serve"` (dev/preview), and `BASE_PATH` is optional for builds (defaults to `/PowershellTrainer/`). Replit dev still requires both env vars and is unchanged.
  - `src/lib/conditions.ts` — Discriminated-union schema for 4 condition kinds (Registry / Service / File / ScheduledTask) plus Variable schema. Helpers: `previewCondition`, `substituteVariables`, `findUnresolvedRefs`, `defaultConditionFor`, `KIND_LABELS`, `ALL_KINDS`.
  - `src/lib/script-generation.ts` — Generates Detection/Remediation/Rollback/Notes/Test scripts. Each condition emits a `$condN` block; the aggregate is `$cond1 -and/-or $cond2 ...`. Inverse mode wraps the aggregate in `-not (...)` and flips per-condition remediation actions; rollback reuses remediation with `flip = !inverseMode`. `finalize()` substitutes `{{varName}}` tokens and injects an unresolved-variables warning into the script header when needed.
  - `src/data/scenarios.ts` — 12 typed scenarios. Each `defaults` block has `conditions[]`, `combinator` (AND/OR), `inverseMode`, and `variables[]`. OneDrive uses 2 AND-combined registry checks parameterized by `{{tenantId}}`; teams-cleanup defaults inverseMode=true.
  - `src/data/gpo-mappings.ts` — 34 hand-verified GPO -> registry mappings (BitLocker, OneDrive, Teams, Edge, Chrome, Windows Update, Defender, Office, Privacy, Security). Curated entries surface as "Verified" in the lookup UI. `applyGpo` replaces the full conditions array with a single registry check derived from the entry.
  - `src/data/generated/gpo-imported.ts` — ~250 additional ADMX-backed entries compiled from Microsoft's public policy reference (Edge, Chrome, Defender, OneDrive, WUfB, Office, Privacy, Cloud Content, Lock Screen, Windows Hello, BitLocker, Firewall, RDP, Network/LSA, AutoPlay, Power, IE, AppLocker, LAPS). Authored via compact helper functions (`edge`, `chrome`, `def`, `offUser`, `offMachine`, `fw`, etc.) so each entry is a single line.
  - `src/data/gpo-lookup.ts` — `loadGpoLookup()` performs a dynamic `import("@/data/generated/gpo-imported")` (Vite splits the chunk so the data file isn't in the initial bundle), then merges curated + imported via `mergeMappings()`. Curated entries win on `(registryPath, valueName)` collisions and are stamped `verified: true`. Result is cached after first load. Categories are derived at runtime from the merged set.
  - `scripts/src/import-gpo.ts` — Importer skeleton for refreshing the generated dataset from Microsoft's "Group Policy Settings Reference Spreadsheet". Reads XLSX from `scripts/data/raw/`, normalizes via `categorize()` / `normalizeValueType()` / `normalizeHive()`, emits `gpo-from-xlsx.json`. The XLSX parsing function is a documented stub — to enable, add the `xlsx` package and replace `parseXlsx()`. Run via `pnpm --filter @workspace/scripts run import-gpo`.
  - `src/pages/builder.tsx` — Form-driven script generator using react-hook-form. Scenario selection runs `form.reset(defaultsToFormValues(...))` via a `useEffect([selectedScenarioId])` so Selects/RadioGroups visibly rehydrate. Mounts `ConditionsPanel` (useFieldArray + Add Condition dropdown) and `VariablesPanel` (collapsible with unresolved-vars badge). The Inverse / Uninstall Mode switch is highlighted in amber.
  - `src/components/conditions-panel.tsx` / `variables-panel.tsx` — `useFieldArray`-based editors. Combinator radio (AND/OR) only renders when 2+ conditions exist.
