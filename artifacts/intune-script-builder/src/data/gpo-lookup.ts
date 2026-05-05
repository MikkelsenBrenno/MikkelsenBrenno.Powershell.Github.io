/**
 * Combined GPO lookup dataset.
 *
 * Lazily loads the (large) imported dataset on first call so the initial page
 * bundle isn't penalised by the policy data. The curated set always wins on
 * conflict (matched by registry path + value name), which is why curated
 * entries display the "Verified" badge in the lookup UI.
 *
 * Usage:
 *
 *   const { entries, categories } = await loadGpoLookup();
 *
 * Once resolved, the cache is shared across all callers.
 */

import { curatedGpoMappings, type GpoMapping } from "@/data/gpo-mappings";
import { VALUE_TYPES } from "@/lib/conditions";

export interface GpoLookupDataset {
  entries: GpoMapping[];
  categories: string[];
}

let cache: Promise<GpoLookupDataset> | null = null;

/**
 * Shape of an entry in the bundled `gpo-from-xlsx.json` dataset. This file is
 * produced by either of two scripts in `@workspace/scripts`:
 *
 *   - `pnpm --filter @workspace/scripts run generate-gpo`
 *       Combinatorially expands well-known Microsoft policy namespaces into
 *       a bundled baseline (Office Trust Center per-app, IE security zones,
 *       Schannel cipher suites, advanced audit subcategories, Firewall per-
 *       profile granular settings, BitLocker per-drive-type, AppLocker rule
 *       collections, Windows Update for Business, NCSI, Sandbox, Edge Update,
 *       Windows Time, etc.).
 *
 *   - `pnpm --filter @workspace/scripts run import-gpo`
 *       Parses Microsoft's "Group Policy Settings Reference Spreadsheet" XLSX
 *       (`scripts/data/raw/group-policy-settings-reference.xlsx`) and writes
 *       the same JSON file. Running this REPLACES the generator's output
 *       with rows derived from Microsoft's spreadsheet (thousands more).
 *
 * Either way, this module loads the JSON at runtime via Vite's static JSON
 * import, merges it with the curated overlay and the hand-authored TypeScript
 * datasets, and de-dupes by (registryPath, valueName).
 */
interface XlsxJsonEntry {
  id: string;
  gpoName: string;
  category: string;
  registryPath: string;
  valueName: string;
  expectedValue: string;
  valueType: string;
  description: string;
  supportedOn?: string;
}

function dedupeKey(g: GpoMapping): string {
  return `${g.registryPath.toLowerCase()}::${g.valueName.toLowerCase()}`;
}

function isValueType(s: string): s is GpoMapping["valueType"] {
  return (VALUE_TYPES as readonly string[]).includes(s);
}

function normaliseXlsxEntries(rows: readonly XlsxJsonEntry[]): GpoMapping[] {
  const out: GpoMapping[] = [];
  for (const r of rows) {
    if (!isValueType(r.valueType)) continue;
    out.push({
      id: r.id,
      gpoName: r.gpoName,
      category: r.category,
      registryPath: r.registryPath,
      valueName: r.valueName,
      expectedValue: r.expectedValue,
      valueType: r.valueType,
      description: r.description,
      supportedOn: r.supportedOn,
      verified: false,
    });
  }
  return out;
}

export function mergeMappings(
  curated: GpoMapping[],
  imported: GpoMapping[],
): GpoLookupDataset {
  const byKey = new Map<string, GpoMapping>();

  // Imported first; curated overwrites by key (curated wins on conflict).
  for (const g of imported) {
    byKey.set(dedupeKey(g), { ...g, verified: g.verified ?? false });
  }
  for (const g of curated) {
    byKey.set(dedupeKey(g), { ...g, verified: true });
  }

  const entries = Array.from(byKey.values()).sort((a, b) => {
    if (a.category === b.category) return a.gpoName.localeCompare(b.gpoName);
    return a.category.localeCompare(b.category);
  });

  const categories = Array.from(new Set(entries.map((g) => g.category))).sort();

  return { entries, categories };
}

export function loadGpoLookup(): Promise<GpoLookupDataset> {
  if (!cache) {
    cache = Promise.all([
      import("@/data/generated/gpo-imported"),
      import("@/data/generated/gpo-bulk-entries"),
      // First-class JSON consumption. Vite resolves this statically at
      // build time, so the file MUST exist on disk (it does — see the
      // generator script described above). The promise is wrapped in a
      // .catch so a malformed/empty file still returns an empty array
      // rather than failing the whole lookup.
      import("@/data/generated/gpo-from-xlsx.json").catch(() => ({
        default: [] as XlsxJsonEntry[],
      })),
    ]).then(([imported, bulk, xlsx]) => {
      const xlsxRows = (xlsx.default ?? []) as XlsxJsonEntry[];
      return mergeMappings(curatedGpoMappings, [
        ...imported.importedGpoMappings,
        ...bulk.bulkGpoMappings,
        ...normaliseXlsxEntries(xlsxRows),
      ]);
    });
  }
  return cache;
}

export type { GpoMapping } from "@/data/gpo-mappings";
