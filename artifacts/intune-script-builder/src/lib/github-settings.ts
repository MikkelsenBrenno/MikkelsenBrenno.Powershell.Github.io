import { normalizeFolder, parseRepoSlug } from "./github-publish";

export const GITHUB_SETTINGS_KEY = "intune-script-builder:github-settings:v1";

export interface GitHubSettings {
  owner: string;
  repo: string;
  branch: string;
  folder: string; // already-normalized; "" means repo root
  commitMessageTemplate: string;
}

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
  owner: "",
  repo: "",
  branch: "main",
  folder: "intune/scripts",
  commitMessageTemplate: "Add {name} from Intune Script Builder",
};

export function loadSettings(): GitHubSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GITHUB_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const owner = typeof parsed.owner === "string" ? parsed.owner : "";
    const repo = typeof parsed.repo === "string" ? parsed.repo : "";
    if (!owner || !repo) return null;
    const branch =
      typeof parsed.branch === "string" && parsed.branch.trim()
        ? parsed.branch.trim()
        : DEFAULT_GITHUB_SETTINGS.branch;
    const folder = normalizeFolder(
      typeof parsed.folder === "string" ? parsed.folder : DEFAULT_GITHUB_SETTINGS.folder
    );
    const commitMessageTemplate =
      typeof parsed.commitMessageTemplate === "string" && parsed.commitMessageTemplate.trim()
        ? parsed.commitMessageTemplate
        : DEFAULT_GITHUB_SETTINGS.commitMessageTemplate;
    return { owner, repo, branch, folder, commitMessageTemplate };
  } catch {
    return null;
  }
}

export function hasSettings(): boolean {
  return loadSettings() !== null;
}

export interface SaveSettingsResult {
  ok: boolean;
  error?: string;
  settings?: GitHubSettings;
}

// Accepts a free-form repo input (slug, URL, or SSH) plus the other
// fields. Validates the slug, normalizes the folder, falls back to
// defaults for blank optional fields. Returns the persisted settings on
// success so the caller can update local UI state without re-reading.
export function saveSettings(input: {
  repoInput: string;
  branch: string;
  folder: string;
  commitMessageTemplate: string;
}): SaveSettingsResult {
  const slug = parseRepoSlug(input.repoInput);
  if (!slug) {
    return { ok: false, error: "Enter a repo as `owner/repo` or a github.com URL." };
  }
  const branch = input.branch.trim() || DEFAULT_GITHUB_SETTINGS.branch;
  const folder = normalizeFolder(input.folder);
  const commitMessageTemplate =
    input.commitMessageTemplate.trim() || DEFAULT_GITHUB_SETTINGS.commitMessageTemplate;
  const settings: GitHubSettings = {
    owner: slug.owner,
    repo: slug.repo,
    branch,
    folder,
    commitMessageTemplate,
  };
  try {
    window.localStorage.setItem(GITHUB_SETTINGS_KEY, JSON.stringify(settings));
    return { ok: true, settings };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not write settings to localStorage.",
    };
  }
}

export function clearSettings(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GITHUB_SETTINGS_KEY);
  } catch {
    // best-effort
  }
}
