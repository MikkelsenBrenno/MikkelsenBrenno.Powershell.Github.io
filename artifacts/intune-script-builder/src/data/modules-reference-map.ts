// Maps PowerShell cmdlets to their entry in the Modules & APIs catalog
// (`./modules-reference.ts`). Kept right next to the catalog data so adding
// a new entry is a one-file edit on both sides.
//
// Two-stage matching:
//   1. Direct lookup against `CMDLET_TO_ENTRY_ID` (exact, lowercased).
//   2. Pattern fallback for module families with stable naming conventions
//      (e.g. every `verb-MgDeviceManagement*` cmdlet maps to the
//      Microsoft.Graph.DeviceManagement entry).
//
// Anything not matched returns `null` and is left un-annotated; we'd rather
// stay silent than surface a misleading link.

import { tokenize } from "@/lib/powershell/tokenizer";
import { referenceEntries, type ReferenceEntry } from "./modules-reference";

const CMDLET_TO_ENTRY_ID: Record<string, string> = {
  // Inventory & Detection
  "get-ciminstance": "get-ciminstance",
  "invoke-cimmethod": "get-ciminstance",
  "get-cimclass": "get-ciminstance",
  "get-cimassociatedinstance": "get-ciminstance",
  "get-computerinfo": "get-computerinfo",
  "get-wmiobject": "get-wmiobject-legacy",

  // Registry
  "get-itemproperty": "get-set-itemproperty",
  "set-itemproperty": "get-set-itemproperty",
  "new-itemproperty": "get-set-itemproperty",
  "remove-itemproperty": "get-set-itemproperty",
  "get-itempropertyvalue": "get-set-itemproperty",
  "set-policyfileentry": "policyfileeditor",
  "get-policyfileentry": "policyfileeditor",
  "remove-policyfileentry": "policyfileeditor",

  // Files & Paths
  "test-path": "test-resolve-path",
  "resolve-path": "test-resolve-path",
  "join-path": "join-split-path",
  "split-path": "join-split-path",

  // Windows Update (PSWindowsUpdate)
  "get-windowsupdate": "pswindowsupdate",
  "install-windowsupdate": "pswindowsupdate",
  "hide-windowsupdate": "pswindowsupdate",
  "show-windowsupdate": "pswindowsupdate",
  "uninstall-windowsupdate": "pswindowsupdate",
  "get-wulist": "pswindowsupdate",
  "get-wuhistory": "pswindowsupdate",

  // Microsoft Graph SDK core
  "connect-mggraph": "microsoft-graph-authentication",
  "disconnect-mggraph": "microsoft-graph-authentication",
  "get-mgcontext": "microsoft-graph-authentication",

  // IntuneWin32App (community module)
  "connect-msintunegraph": "intunewin32app",
  "new-intunewin32apppackage": "intunewin32app",
  "add-intunewin32app": "intunewin32app",
  "get-intunewin32app": "intunewin32app",
  "remove-intunewin32app": "intunewin32app",
  "new-intunewin32appdetectionruleregistry": "intunewin32app",
  "new-intunewin32appdetectionrulefile": "intunewin32app",
  "new-intunewin32appdetectionrulemsi": "intunewin32app",
  "new-intunewin32appdetectionrulescript": "intunewin32app",
  "new-intunewin32apprequirementrule": "intunewin32app",
  "new-intunewin32appreturncode": "intunewin32app",
  "new-intunewin32appassignmentgroup": "intunewin32app",
  "add-intunewin32appassignment": "intunewin32app",

  // Local accounts (Microsoft.PowerShell.LocalAccounts)
  "get-localuser": "localaccounts",
  "new-localuser": "localaccounts",
  "set-localuser": "localaccounts",
  "remove-localuser": "localaccounts",
  "enable-localuser": "localaccounts",
  "disable-localuser": "localaccounts",
  "get-localgroup": "localaccounts",
  "new-localgroup": "localaccounts",
  "remove-localgroup": "localaccounts",
  "get-localgroupmember": "localaccounts",
  "add-localgroupmember": "localaccounts",
  "remove-localgroupmember": "localaccounts",

  // Services
  "get-service": "get-set-service",
  "set-service": "get-set-service",
  "start-service": "get-set-service",
  "stop-service": "get-set-service",
  "restart-service": "get-set-service",
  "new-service": "get-set-service",

  // Appx (Microsoft Store / UWP)
  "get-appxpackage": "appx-cmdlets",
  "remove-appxpackage": "appx-cmdlets",
  "add-appxpackage": "appx-cmdlets",
  "get-appxprovisionedpackage": "appx-cmdlets",
  "remove-appxprovisionedpackage": "appx-cmdlets",

  // Networking
  "invoke-webrequest": "invoke-webrequest-restmethod",
  "invoke-restmethod": "invoke-webrequest-restmethod",
  "test-netconnection": "test-netconnection",

  // Logging & Notifications
  "start-transcript": "transcript-cmdlets",
  "stop-transcript": "transcript-cmdlets",
  "new-burnttoastnotification": "burnttoast",
  "submit-btnotification": "burnttoast",

  // Excel reporting
  "export-excel": "importexcel",
  "import-excel": "importexcel",
};

// Pattern fallback. Order doesn't matter – first match wins.
const PATTERN_RULES: ReadonlyArray<{ pattern: RegExp; entryId: string }> = [
  // Microsoft.Graph.DeviceManagement and its Beta sibling. Covers the long
  // tail of Get-MgDeviceManagement* / New-MgBetaDeviceManagement* nouns
  // without listing every one by hand.
  {
    pattern: /^[a-z]+-mg(?:beta)?devicemanagement[a-z0-9]*$/i,
    entryId: "microsoft-graph-devicemanagement",
  },
];

// Cache by id so repeated lookups don't keep re-scanning the array.
const ENTRY_BY_ID = new Map<string, ReferenceEntry>(
  referenceEntries.map((e) => [e.id, e]),
);

export function lookupReferenceEntryByCmdlet(name: string): ReferenceEntry | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  let id: string | undefined = CMDLET_TO_ENTRY_ID[lower];
  if (!id) {
    for (const rule of PATTERN_RULES) {
      if (rule.pattern.test(name)) {
        id = rule.entryId;
        break;
      }
    }
  }
  if (!id) return null;
  return ENTRY_BY_ID.get(id) ?? null;
}

export interface ReferenceMatch {
  entry: ReferenceEntry;
  // The actual cmdlet spellings that triggered the match, deduped and
  // sorted so the UI can render them as stable chips.
  cmdletNames: string[];
}

// Walk a generated PowerShell source string and return the unique reference
// catalog entries it touches, alongside the cmdlet spellings that mapped to
// each entry. Used by the Builder to surface "Modules used" deep-links.
export function findReferencedEntriesInScript(source: string): ReferenceMatch[] {
  if (!source) return [];
  const tokens = tokenize(source);
  const byEntry = new Map<
    string,
    { entry: ReferenceEntry; cmdletNames: Set<string> }
  >();

  for (const t of tokens) {
    if (t.type !== "cmdlet") continue;
    const entry = lookupReferenceEntryByCmdlet(t.value);
    if (!entry) continue;
    const bucket = byEntry.get(entry.id);
    if (bucket) {
      bucket.cmdletNames.add(t.value);
    } else {
      byEntry.set(entry.id, {
        entry,
        cmdletNames: new Set([t.value]),
      });
    }
  }

  return Array.from(byEntry.values())
    .map((b) => ({
      entry: b.entry,
      cmdletNames: Array.from(b.cmdletNames).sort(),
    }))
    .sort((a, b) => a.entry.name.localeCompare(b.entry.name));
}

// Combine matches from several scripts (detection / remediation / rollback)
// into a single deduped list. Cmdlet spellings are merged across sources.
export function mergeReferenceMatches(
  ...lists: ReferenceMatch[][]
): ReferenceMatch[] {
  const merged = new Map<
    string,
    { entry: ReferenceEntry; cmdletNames: Set<string> }
  >();
  for (const list of lists) {
    for (const m of list) {
      const bucket = merged.get(m.entry.id);
      if (bucket) {
        for (const c of m.cmdletNames) bucket.cmdletNames.add(c);
      } else {
        merged.set(m.entry.id, {
          entry: m.entry,
          cmdletNames: new Set(m.cmdletNames),
        });
      }
    }
  }
  return Array.from(merged.values())
    .map((b) => ({
      entry: b.entry,
      cmdletNames: Array.from(b.cmdletNames).sort(),
    }))
    .sort((a, b) => a.entry.name.localeCompare(b.entry.name));
}
