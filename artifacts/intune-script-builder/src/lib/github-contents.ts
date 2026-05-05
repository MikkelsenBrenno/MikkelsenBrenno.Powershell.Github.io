// Thin wrapper around GitHub's public "list folder contents" endpoint.
// No auth — works for public repos only. Private repos surface a
// "private-or-missing" state. ETag-based caching with a 60s TTL keeps
// the rate-limit budget intact across panel re-renders.

export interface RepoFolderEntry {
  name: string;
  path: string;
  size: number;
  type: "file" | "dir" | "other";
  htmlUrl: string;
  sha: string;
}

export interface RepoFolderListing {
  entries: RepoFolderEntry[];
  lastFetchedAt: number;
  etag: string | null;
}

export type RepoFolderResult =
  | { kind: "ok"; listing: RepoFolderListing }
  | { kind: "not-found"; message: string }
  | { kind: "private-or-missing"; message: string }
  | { kind: "rate-limited"; message: string; resetAt: number | null }
  | { kind: "network"; message: string }
  | { kind: "unknown"; message: string };

interface CacheValue {
  fetchedAt: number;
  etag: string | null;
  listing: RepoFolderListing | null; // null when last response was an error
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheValue>();

function cacheKey(p: { owner: string; repo: string; branch: string; folder: string }): string {
  return `${p.owner}/${p.repo}@${p.branch}:${p.folder}`;
}

export interface ListFolderArgs {
  owner: string;
  repo: string;
  branch: string;
  folder: string;
  signal?: AbortSignal;
  // When true, bypasses the TTL but still sends If-None-Match so the
  // server can answer 304 cheaply.
  force?: boolean;
}

export async function listFolder(args: ListFolderArgs): Promise<RepoFolderResult> {
  const key = cacheKey(args);
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && cached.listing && !args.force && now - cached.fetchedAt < CACHE_TTL_MS) {
    return { kind: "ok", listing: cached.listing };
  }

  const path = args.folder ? args.folder.split("/").map(encodeURIComponent).join("/") : "";
  const url = `https://api.github.com/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(
    args.repo
  )}/contents/${path}${path ? "" : ""}?ref=${encodeURIComponent(args.branch)}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (cached?.etag) headers["If-None-Match"] = cached.etag;

  let resp: Response;
  try {
    resp = await fetch(url, { headers, signal: args.signal });
  } catch (e) {
    if ((e as { name?: string } | null)?.name === "AbortError") {
      return { kind: "network", message: "Cancelled." };
    }
    return { kind: "network", message: "Couldn't reach api.github.com." };
  }

  // 304 Not Modified — reuse the cached listing.
  if (resp.status === 304 && cached?.listing) {
    cached.fetchedAt = now;
    return { kind: "ok", listing: cached.listing };
  }

  if (resp.status === 403) {
    const remaining = resp.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      const resetHeader = resp.headers.get("x-ratelimit-reset");
      const resetAt = resetHeader ? Number(resetHeader) * 1000 : null;
      return {
        kind: "rate-limited",
        message:
          "GitHub's anonymous read budget is used up for this hour. Try again later.",
        resetAt: Number.isFinite(resetAt) ? resetAt : null,
      };
    }
    return {
      kind: "private-or-missing",
      message:
        "GitHub returned 403. The repo may be private (token-based browsing is a future option).",
    };
  }

  if (resp.status === 404) {
    // GitHub returns 404 for both genuinely-missing paths AND for
    // private repos when the request is unauthenticated. Without a
    // token we can't tell them apart, so surface both possibilities
    // and route to the same UI state as a private/inaccessible repo.
    return {
      kind: "private-or-missing",
      message:
        "Repo, branch, or folder is unreachable. Either the path doesn't exist, or the repo is private (token-based browsing is a future option). Double-check the slug, branch, and folder.",
    };
  }

  if (!resp.ok) {
    return {
      kind: "unknown",
      message: `GitHub responded ${resp.status} ${resp.statusText}.`,
    };
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return { kind: "unknown", message: "Could not parse GitHub's response." };
  }

  // The contents API returns an array for folders or a single object for
  // files. We only care about the array (folder) case here.
  if (!Array.isArray(body)) {
    return {
      kind: "not-found",
      message: "That path resolves to a file, not a folder.",
    };
  }

  const entries: RepoFolderEntry[] = body
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({
      name: String(row.name ?? ""),
      path: String(row.path ?? ""),
      size: typeof row.size === "number" ? row.size : 0,
      type: ((): "file" | "dir" | "other" => {
        if (row.type === "file") return "file";
        if (row.type === "dir") return "dir";
        return "other";
      })(),
      htmlUrl: typeof row.html_url === "string" ? row.html_url : "",
      sha: typeof row.sha === "string" ? row.sha : "",
    }))
    .filter((e) => e.name);

  const etag = resp.headers.get("etag");
  const listing: RepoFolderListing = {
    entries,
    lastFetchedAt: now,
    etag,
  };
  cache.set(key, { fetchedAt: now, etag, listing });
  return { kind: "ok", listing };
}

export function clearListingCache(): void {
  cache.clear();
}

export function fileExistsInListing(
  listing: RepoFolderListing | null | undefined,
  filename: string
): boolean {
  if (!listing) return false;
  return listing.entries.some((e) => e.type === "file" && e.name === filename);
}
