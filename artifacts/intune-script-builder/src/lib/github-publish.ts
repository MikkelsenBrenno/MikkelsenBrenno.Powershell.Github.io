// Pure helpers for publishing Library entries to a GitHub repo via
// GitHub's prefilled "new file" / "edit file" web pages. No tokens, no
// network calls — these functions only build URLs and shape strings.

export interface RepoSlug {
  owner: string;
  repo: string;
}

const SLUG_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-_.]*[A-Za-z0-9])?$/;

// Accepts:
//   owner/repo
//   https://github.com/owner/repo
//   https://github.com/owner/repo.git
//   git@github.com:owner/repo.git
export function parseRepoSlug(input: string): RepoSlug | null {
  if (!input) return null;
  let s = input.trim();
  if (!s) return null;

  // SSH form: git@github.com:owner/repo(.git)
  const sshMatch = s.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return validate({ owner: sshMatch[1], repo: sshMatch[2] });
  }

  // URL form
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.hostname.toLowerCase() !== "github.com") return null;
      const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (parts.length < 2) return null;
      const owner = parts[0];
      const repo = parts[1].replace(/\.git$/i, "");
      return validate({ owner, repo });
    } catch {
      return null;
    }
  }

  // Bare owner/repo
  const parts = s.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length !== 2) return null;
  return validate({ owner: parts[0], repo: parts[1].replace(/\.git$/i, "") });
}

function validate(slug: RepoSlug): RepoSlug | null {
  if (!SLUG_RE.test(slug.owner) || !SLUG_RE.test(slug.repo)) return null;
  return slug;
}

// Strip leading/trailing slashes and collapse interior duplicates so
// the rest of the codebase can assume a clean folder string. An empty
// folder means "repo root".
export function normalizeFolder(folder: string): string {
  return folder
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

// Free-form entry name → safe `*.ps1` filename. Lowercase, dashes,
// strips anything outside `[a-z0-9._-]`, collapses runs of dashes, and
// always ends in `.ps1`.
export function slugifyEntryName(name: string, fallbackId?: string): string {
  const base = (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .replace(/\.ps1$/i, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (base) return `${base}.ps1`;
  const tail = (fallbackId ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 6) || "entry";
  return `script-${tail.toLowerCase()}.ps1`;
}

// GitHub's web "new file" / "edit file" pages tolerate large prefilled
// values, but URLs over a few tens of KB start hitting browser/proxy
// limits. We cap conservatively and surface a fallback when exceeded.
export const URL_VALUE_LIMIT = 6000;

export function urlEncodedSize(s: string): number {
  return encodeURIComponent(s).length;
}

interface NewFileArgs {
  owner: string;
  repo: string;
  branch: string;
  dir: string; // already normalized; "" means repo root
  filename: string;
  content: string;
  message?: string;
}

export function buildNewFileUrl(args: NewFileArgs): string {
  const { owner, repo, branch, dir, filename, content, message } = args;
  const dirPart = dir ? `/${encodePath(dir)}` : "";
  const params = new URLSearchParams();
  params.set("filename", filename);
  params.set("value", content);
  if (message) params.set("message", message);
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/new/${encodeURIComponent(branch)}${dirPart}?${params.toString()}`;
}

interface EditFileArgs {
  owner: string;
  repo: string;
  branch: string;
  path: string; // full path inside the repo, no leading slash
  content: string;
  message?: string;
}

export function buildEditFileUrl(args: EditFileArgs): string {
  const { owner, repo, branch, path, content, message } = args;
  const params = new URLSearchParams();
  params.set("value", content);
  if (message) params.set("message", message);
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/edit/${encodeURIComponent(branch)}/${encodePath(path)}?${params.toString()}`;
}

// Browse to a folder inside the repo (used as a fallback when the
// script is too large to fit in a deep-link).
export function buildFolderUrl(args: {
  owner: string;
  repo: string;
  branch: string;
  dir: string;
}): string {
  const { owner, repo, branch, dir } = args;
  const dirPart = dir ? `/${encodePath(dir)}` : "";
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree/${encodeURIComponent(branch)}${dirPart}`;
}

function encodePath(p: string): string {
  return p
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

// Substitute `{name}` and `{filename}` in the commit-message template.
// Anything else passes through untouched so we never throw on a typo.
export function renderCommitMessage(
  template: string,
  vars: { name: string; filename: string }
): string {
  return template
    .replace(/\{name\}/g, vars.name)
    .replace(/\{filename\}/g, vars.filename)
    .trim();
}

// Decide which deep-link to generate based on whether the file already
// exists in the repo listing. Returns enough metadata for the UI to
// render the right label and tooltip.
export interface PublishPlanArgs {
  owner: string;
  repo: string;
  branch: string;
  dir: string;
  filename: string;
  content: string;
  message: string;
  fileExists: boolean;
}

export interface PublishPlan {
  mode: "create" | "update" | "too-large";
  url: string;
  // The fallback URL is set when the value would exceed the size cap;
  // the UI uses it to open the folder so the user can paste manually.
  folderUrl?: string;
  encodedSize: number;
}

export function planPublish(args: PublishPlanArgs): PublishPlan {
  const encodedSize = urlEncodedSize(args.content);
  if (encodedSize > URL_VALUE_LIMIT) {
    return {
      mode: "too-large",
      url: buildFolderUrl({
        owner: args.owner,
        repo: args.repo,
        branch: args.branch,
        dir: args.dir,
      }),
      folderUrl: buildFolderUrl({
        owner: args.owner,
        repo: args.repo,
        branch: args.branch,
        dir: args.dir,
      }),
      encodedSize,
    };
  }
  if (args.fileExists) {
    const path = args.dir ? `${args.dir}/${args.filename}` : args.filename;
    return {
      mode: "update",
      url: buildEditFileUrl({
        owner: args.owner,
        repo: args.repo,
        branch: args.branch,
        path,
        content: args.content,
        message: args.message,
      }),
      encodedSize,
    };
  }
  return {
    mode: "create",
    url: buildNewFileUrl({
      owner: args.owner,
      repo: args.repo,
      branch: args.branch,
      dir: args.dir,
      filename: args.filename,
      content: args.content,
      message: args.message,
    }),
    encodedSize,
  };
}
