/**
 * GPO Lookup importer.
 *
 * Reads Microsoft's "Group Policy Settings Reference Spreadsheet" (XLSX) from
 *   scripts/data/raw/<spreadsheet>.xlsx
 * and emits a normalized JSON file at
 *   artifacts/intune-script-builder/src/data/generated/gpo-from-xlsx.json
 *
 * Run:
 *   pnpm --filter @workspace/scripts run import-gpo -- <path/to/spreadsheet.xlsx>
 *
 * If no path is given, the importer scans `scripts/data/raw/` for any .xlsx
 * file and processes the most recently modified one.
 *
 * The seed dataset shipped in
 *   artifacts/intune-script-builder/src/data/generated/gpo-imported.ts
 * is currently hand-authored from Microsoft's public docs. To replace or
 * augment it from a fresh spreadsheet release:
 *
 *   1. Drop the XLSX into `scripts/data/raw/`.
 *   2. Run the script above.
 *   3. Copy/import entries from `gpo-from-xlsx.json` into
 *      `gpo-imported.ts` (add helper functions if many share a registry path).
 *
 * The script intentionally does NOT overwrite `gpo-imported.ts` directly so
 * that hand-curated comments, helpers, and groupings are preserved.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

interface RawRow {
  policyName: string;
  policyPath: string;
  scope: string;
  registryHive: string;
  registryKey: string;
  valueName: string;
  valueType: string;
  supportedOn: string;
  helpText: string;
}

interface NormalizedEntry {
  id: string;
  gpoName: string;
  category: string;
  registryPath: string;
  valueName: string;
  expectedValue: string;
  valueType: "String" | "DWORD" | "QWORD" | "MultiString" | "Binary";
  description: string;
  supportedOn?: string;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");
const RAW_DIR = resolve(REPO_ROOT, "scripts", "data", "raw");
const OUT_PATH = resolve(
  REPO_ROOT,
  "artifacts",
  "intune-script-builder",
  "src",
  "data",
  "generated",
  "gpo-from-xlsx.json",
);

function findInputXlsx(): string | null {
  const argPath = process.argv[2];
  if (argPath) {
    return resolve(process.cwd(), argPath);
  }
  if (!existsSync(RAW_DIR)) return null;
  const xlsx = readdirSync(RAW_DIR)
    .filter((f) => f.toLowerCase().endsWith(".xlsx"))
    .map((f) => ({ f, mtime: statSync(join(RAW_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (xlsx.length === 0) return null;
  return join(RAW_DIR, xlsx[0].f);
}

/**
 * Map the spreadsheet's "Policy Path" column to a short category. Examples:
 *   "Windows Components/Microsoft Defender Antivirus/..." -> "Defender"
 *   "Network/Lanman Workstation"                          -> "Network"
 *   "System/Group Policy"                                 -> "System"
 */
function categorize(policyPath: string): string {
  const segs = policyPath.split(/[\\/]+/).map((s) => s.trim()).filter(Boolean);
  const haystack = policyPath.toLowerCase();
  if (haystack.includes("defender")) return "Defender";
  if (haystack.includes("bitlocker")) return "BitLocker";
  if (haystack.includes("smartscreen")) return "SmartScreen";
  if (haystack.includes("windows update") || haystack.includes("waasmedic")) return "Windows Update";
  if (haystack.includes("onedrive")) return "OneDrive";
  if (haystack.includes("microsoft edge") || haystack.startsWith("edge")) return "Edge";
  if (haystack.includes("google\\chrome")) return "Chrome";
  if (haystack.includes("internet explorer")) return "Internet Explorer";
  if (haystack.includes("remote desktop") || haystack.includes("terminal services")) return "Remote Desktop";
  if (haystack.includes("firewall")) return "Firewall";
  if (haystack.includes("data collection") || haystack.includes("privacy")) return "Privacy";
  if (haystack.includes("cloud content")) return "Cloud Content";
  if (haystack.includes("lock screen") || haystack.includes("personalization")) return "Lock Screen";
  if (haystack.includes("network") || haystack.includes("lanman")) return "Network";
  if (haystack.includes("hello") || haystack.includes("passport")) return "Windows Hello";
  if (haystack.includes("office") || haystack.includes("microsoft 365")) return "Office";
  if (haystack.includes("applocker")) return "AppLocker";
  if (haystack.includes("laps")) return "LAPS";
  // Fall back to the last meaningful segment.
  return segs[segs.length - 1] ?? "Other";
}

function normalizeValueType(raw: string): NormalizedEntry["valueType"] {
  const v = raw.toUpperCase().trim();
  if (v.includes("MULTI")) return "MultiString";
  if (v.includes("QWORD")) return "QWORD";
  if (v.includes("BINARY")) return "Binary";
  if (v.includes("STRING") || v.includes("REG_SZ") || v.includes("REG_EXPAND")) return "String";
  return "DWORD";
}

function normalizeHive(hive: string): string {
  const h = hive.toUpperCase().trim();
  if (h === "HKEY_LOCAL_MACHINE" || h === "HKLM") return "HKLM:";
  if (h === "HKEY_CURRENT_USER" || h === "HKCU") return "HKCU:";
  return `${h}:`;
}

function slugId(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalize(rows: RawRow[]): NormalizedEntry[] {
  return rows
    .filter((r) => r.registryKey && r.valueName)
    .map((r) => {
      const path = `${normalizeHive(r.registryHive)}\\${r.registryKey.replace(/^[\\/]+/, "")}`;
      const category = categorize(r.policyPath);
      return {
        id: `imp-${slugId(category)}-${slugId(r.valueName)}`,
        gpoName: `${category}: ${r.policyName}`,
        category,
        registryPath: path,
        valueName: r.valueName,
        expectedValue: "",
        valueType: normalizeValueType(r.valueType),
        description: r.helpText.split(/\r?\n/)[0]?.slice(0, 240) ?? "",
        supportedOn: r.supportedOn || undefined,
      };
    });
}

/**
 * Parse Microsoft's "Group Policy Settings Reference Spreadsheet".
 *
 * The spreadsheet has multiple sheets (one per Windows version / template).
 * Each sheet has a header row and a stable, well-known column layout. We
 * accept any sheet whose headers contain the policy/registry columns we
 * need, then merge rows across sheets. Unknown sheets (cover page, table of
 * contents, change log) are skipped silently.
 *
 * Header columns we look for (case-insensitive, fuzzy match):
 *   - "Policy Setting Name" / "Policy Name"
 *   - "Policy Path"
 *   - "Scope" / "Class"  (User / Machine / Both)
 *   - "Registry Hive"     (HKLM / HKCU / HKEY_*)
 *   - "Registry Key"      (full subkey path)
 *   - "Registry Value Name"
 *   - "Value Type"        (REG_DWORD / REG_SZ / ...)
 *   - "Supported On"
 *   - "Help Text" / "Explain Text" / "Description"
 */
function parseXlsx(path: string): RawRow[] {
  const wb = XLSX.readFile(path, { cellDates: false, cellStyles: false });
  const headerAliases: Record<keyof RawRow, string[]> = {
    policyName: ["policy setting name", "policy name", "name", "setting name"],
    policyPath: ["policy path", "path", "category path"],
    scope: ["scope", "class"],
    registryHive: ["registry hive", "hive"],
    registryKey: ["registry key", "registry path", "key"],
    valueName: ["registry value name", "value name", "registry value"],
    valueType: ["value type", "registry value type", "type"],
    supportedOn: ["supported on", "supported"],
    helpText: ["help text", "explain text", "description", "comment"],
  };

  const rows: RawRow[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    if (rawRows.length === 0) continue;

    // Build a column-name -> RawRow-key index for this sheet.
    const headerKeys = Object.keys(rawRows[0]);
    const colIndex: Partial<Record<keyof RawRow, string>> = {};
    for (const [field, aliases] of Object.entries(headerAliases) as [
      keyof RawRow,
      string[],
    ][]) {
      const found = headerKeys.find((h) =>
        aliases.some((a) => h.toLowerCase().trim() === a),
      );
      if (found) colIndex[field] = found;
    }
    // Skip sheets that don't look like the policy reference.
    if (!colIndex.registryKey || !colIndex.valueName) continue;

    for (const r of rawRows) {
      const get = (field: keyof RawRow): string => {
        const col = colIndex[field];
        if (!col) return "";
        const v = r[col];
        return v == null ? "" : String(v).trim();
      };
      const row: RawRow = {
        policyName: get("policyName"),
        policyPath: get("policyPath"),
        scope: get("scope"),
        registryHive: get("registryHive"),
        registryKey: get("registryKey"),
        valueName: get("valueName"),
        valueType: get("valueType"),
        supportedOn: get("supportedOn"),
        helpText: get("helpText"),
      };
      // Skip header echoes and blank rows.
      if (!row.registryKey || !row.valueName) continue;
      if (row.registryKey.toLowerCase() === "registry key") continue;
      rows.push(row);
    }
  }
  return rows;
}

/**
 * Dedupe by `(registryPath, valueName)` so that the same setting appearing
 * across multiple Windows version sheets only produces one entry. Last
 * occurrence wins (i.e. the most recent sheet's metadata).
 */
function dedupe(entries: NormalizedEntry[]): NormalizedEntry[] {
  const map = new Map<string, NormalizedEntry>();
  for (const e of entries) {
    const k = `${e.registryPath.toLowerCase()}::${e.valueName.toLowerCase()}`;
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) =>
    a.category === b.category
      ? a.gpoName.localeCompare(b.gpoName)
      : a.category.localeCompare(b.category),
  );
}

function main(): void {
  const input = findInputXlsx();
  if (!input) {
    console.log(
      "[import-gpo] No XLSX found.\n" +
        `  Searched: ${RAW_DIR}\n` +
        "  Drop a Microsoft 'Group Policy Settings Reference Spreadsheet' into that folder " +
        "(or pass a path as the first argument) and re-run.\n" +
        "  The current shipped dataset is hand-authored — see " +
        "artifacts/intune-script-builder/src/data/generated/gpo-imported.ts",
    );
    process.exit(0);
  }

  console.log(`[import-gpo] Reading ${input}`);
  const buf = readFileSync(input);
  console.log(`[import-gpo] ${buf.byteLength} bytes`);

  const rows = parseXlsx(input);
  console.log(`[import-gpo] Parsed ${rows.length} raw rows`);
  const entries = dedupe(normalize(rows));

  if (!existsSync(dirname(OUT_PATH))) {
    mkdirSync(dirname(OUT_PATH), { recursive: true });
  }
  writeFileSync(OUT_PATH, JSON.stringify(entries, null, 2));
  console.log(`[import-gpo] Wrote ${entries.length} unique entries → ${OUT_PATH}`);
  console.log(
    `[import-gpo] To merge into the bundled dataset, copy entries from this JSON into\n` +
      `             artifacts/intune-script-builder/src/data/generated/gpo-imported.ts\n` +
      `             (or load the JSON directly from gpo-lookup.ts).`,
  );
}

main();
