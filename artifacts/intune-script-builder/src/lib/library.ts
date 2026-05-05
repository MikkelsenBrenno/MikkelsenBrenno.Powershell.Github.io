import { builderSchema, type BuilderFormValues } from "./builder-schema";

// Bumping this string is the trigger for a future schema migration.
// Entries persisted under an older version are listed in the Library
// page with a "Saved on older version — open to migrate" hint and are
// not auto-loadable until the user opens them.
export const LIBRARY_VERSION = "v1";

export const STORAGE_KEY = "intune-script-builder:library";

// LRU cap. The library array is sorted by `updatedAt` descending, then
// trimmed when it exceeds this number on every write.
export const MAX_ENTRIES = 50;

// Conservative warning threshold for a base64-encoded share URL. Most
// browsers tolerate 8000+ chars, but proxies/email clients sometimes
// truncate sooner. We surface a warning at this point but don't block.
export const SHARE_URL_LENGTH_WARN = 6000;

export interface LibraryEntry {
  id: string;
  name: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  scenarioId: string;
  scriptName: string;
  config: BuilderFormValues;
}

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `lib-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function readAll(): LibraryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as LibraryEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: LibraryEntry[]): void {
  if (typeof window === "undefined") return;
  const trimmed = entries
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota exceeded or storage disabled. Caller can detect a failed
    // save by re-reading and noticing the entry is missing.
  }
}

export function listEntries(): LibraryEntry[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getEntry(id: string): LibraryEntry | undefined {
  return readAll().find((e) => e.id === id);
}

export function saveEntry(name: string, config: BuilderFormValues): LibraryEntry {
  const entries = readAll();
  const now = Date.now();
  const entry: LibraryEntry = {
    id: genId(),
    name: name.trim() || "Untitled script",
    version: LIBRARY_VERSION,
    createdAt: now,
    updatedAt: now,
    scenarioId: config.scenarioId,
    scriptName: config.scriptName,
    config,
  };
  writeAll([entry, ...entries]);
  return entry;
}

export function updateEntryName(id: string, name: string): void {
  const entries = readAll();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return;
  const next = name.trim() || entries[idx].name;
  entries[idx] = { ...entries[idx], name: next, updatedAt: Date.now() };
  writeAll(entries);
}

export function duplicateEntry(id: string): LibraryEntry | undefined {
  const e = getEntry(id);
  if (!e) return undefined;
  return saveEntry(`${e.name} (copy)`, e.config);
}

export function deleteEntry(id: string): void {
  writeAll(readAll().filter((e) => e.id !== id));
}

export function storageBytes(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
  // localStorage stores UTF-16 code units (~2 bytes each); estimate the
  // serialized payload size using a UTF-8 byte length so the indicator
  // matches what a network/share consumer would see.
  return new Blob([raw]).size;
}

export function entryConfigIsCurrentVersion(entry: LibraryEntry): boolean {
  return entry.version === LIBRARY_VERSION;
}

// ---------------------------------------------------------------------------
// URL share encoding
// ---------------------------------------------------------------------------

interface SharePayload {
  v: string;
  config: unknown;
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 === 0 ? "" : "=".repeat(4 - (norm.length % 4));
  const bin = atob(norm + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeShareConfig(config: BuilderFormValues): string {
  const payload: SharePayload = { v: LIBRARY_VERSION, config };
  return toBase64Url(JSON.stringify(payload));
}

export type DecodedShare =
  | { ok: true; config: BuilderFormValues; payloadVersion: string; versionMatches: boolean }
  | { ok: false; error: string };

export function decodeShareConfig(encoded: string): DecodedShare {
  try {
    const json = fromBase64Url(encoded);
    const parsed = JSON.parse(json);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("v" in parsed) ||
      !("config" in parsed)
    ) {
      return { ok: false, error: "Malformed share payload." };
    }
    const payload = parsed as SharePayload;
    const result = builderSchema.safeParse(payload.config);
    if (!result.success) {
      return { ok: false, error: "Configuration in the link did not pass validation." };
    }
    return {
      ok: true,
      config: result.data,
      payloadVersion: String(payload.v),
      versionMatches: payload.v === LIBRARY_VERSION,
    };
  } catch {
    return { ok: false, error: "Could not decode the share link." };
  }
}

// Build a fully-qualified share URL that lands on the builder with the
// supplied config pre-applied. Honors the artifact base path so the URL
// keeps working under the workspace's path-based routing.
export function buildShareUrl(config: BuilderFormValues): string {
  const encoded = encodeShareConfig(config);
  if (typeof window === "undefined") return `?config=${encoded}`;
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const builderPath = `${base}/builder`;
  return `${window.location.origin}${builderPath}?config=${encoded}`;
}
