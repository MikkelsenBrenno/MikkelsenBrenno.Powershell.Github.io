import { useEffect, useMemo, useState } from "react";
import {
  Github,
  RefreshCw,
  Settings,
  ExternalLink,
  FileCode,
  Folder,
  AlertTriangle,
  Lock,
  Inbox,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listFolder,
  type RepoFolderListing,
  type RepoFolderResult,
} from "@/lib/github-contents";
import type { GitHubSettings } from "@/lib/github-settings";
import { buildFolderUrl } from "@/lib/github-publish";

interface Props {
  settings: GitHubSettings | null;
  onConnectClick: () => void;
  onSettingsClick: () => void;
  // The panel owns the listing and feeds it back to the parent so the
  // per-row Push buttons don't have to refetch.
  onListingChange: (listing: RepoFolderListing | null) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRelative(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

export function GitHubRepoPanel({
  settings,
  onConnectClick,
  onSettingsClick,
  onListingChange,
}: Props) {
  const [result, setResult] = useState<RepoFolderResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0); // re-renders for "synced 12s ago"

  // Keep the relative timestamp fresh.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const fetchListing = async (force = false) => {
    if (!settings) return;
    setLoading(true);
    const r = await listFolder({
      owner: settings.owner,
      repo: settings.repo,
      branch: settings.branch,
      folder: settings.folder,
      force,
    });
    setResult(r);
    onListingChange(r.kind === "ok" ? r.listing : null);
    setLoading(false);
  };

  useEffect(() => {
    if (!settings) {
      setResult(null);
      onListingChange(null);
      return;
    }
    void fetchListing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.owner, settings?.repo, settings?.branch, settings?.folder]);

  const headerLine = useMemo(() => {
    if (!settings) return null;
    const folderLabel = settings.folder || "(repo root)";
    return (
      <div className="text-sm text-foreground/80 truncate" data-testid="text-gh-header">
        Connected to{" "}
        <a
          href={`https://github.com/${settings.owner}/${settings.repo}`}
          target="_blank"
          rel="noreferrer noopener"
          className="font-mono font-semibold text-foreground hover:underline"
        >
          {settings.owner}/{settings.repo}
        </a>{" "}
        · branch <code className="text-foreground/90">{settings.branch}</code> · folder{" "}
        <code className="text-foreground/90">{folderLabel}</code>
      </div>
    );
  }, [settings]);

  if (!settings) {
    return (
      <div
        className="border border-dashed border-border rounded-lg bg-card/30 p-4 mb-6 flex items-center justify-between gap-3 flex-wrap"
        data-testid="panel-gh-cta"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Github className="w-4 h-4" />
          Connect a GitHub repo to publish your scripts straight from the Library.
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onConnectClick}
          data-testid="button-gh-connect"
        >
          <Github className="w-4 h-4" />
          Connect
        </Button>
      </div>
    );
  }

  return (
    <div
      className="border border-border rounded-lg bg-card mb-6 overflow-hidden"
      data-testid="panel-gh-repo"
    >
      <div className="flex items-center justify-between gap-3 p-3 border-b border-border bg-secondary/20 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Github className="w-4 h-4 shrink-0" />
          {headerLine}
        </div>
        <div className="flex items-center gap-1.5">
          {result?.kind === "ok" && result.listing.lastFetchedAt > 0 && (
            <span
              key={tick}
              className="text-xs text-muted-foreground mr-1"
              data-testid="text-gh-synced"
            >
              synced {formatRelative(result.listing.lastFetchedAt)}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => void fetchListing(true)}
            title="Refresh folder listing"
            data-testid="button-gh-refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSettingsClick}
            title="GitHub settings"
            data-testid="button-gh-settings"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </Button>
        </div>
      </div>

      <PanelBody
        result={result}
        loading={loading}
        folderUrl={buildFolderUrl({
          owner: settings.owner,
          repo: settings.repo,
          branch: settings.branch,
          dir: settings.folder,
        })}
      />
    </div>
  );
}

function PanelBody({
  result,
  loading,
  folderUrl,
}: {
  result: RepoFolderResult | null;
  loading: boolean;
  folderUrl: string;
}) {
  if (loading && !result) {
    return (
      <div className="p-4 space-y-2" data-testid="panel-gh-loading">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  }

  if (!result) return null;

  if (result.kind === "private-or-missing") {
    return (
      <StateMessage
        icon={<Lock className="w-4 h-4" />}
        tone="amber"
        title="Can't browse this repo"
        body={result.message}
        testId="panel-gh-private"
      />
    );
  }

  if (result.kind === "not-found") {
    return (
      <StateMessage
        icon={<AlertTriangle className="w-4 h-4" />}
        tone="amber"
        title="Path resolves to a file"
        body={result.message}
        testId="panel-gh-not-found"
      />
    );
  }

  if (result.kind === "rate-limited") {
    const reset = result.resetAt
      ? new Date(result.resetAt).toLocaleTimeString()
      : null;
    return (
      <StateMessage
        icon={<AlertTriangle className="w-4 h-4" />}
        tone="amber"
        title="Rate-limited by GitHub"
        body={
          reset
            ? `${result.message} Resets around ${reset}.`
            : result.message
        }
        testId="panel-gh-ratelimit"
      />
    );
  }

  if (result.kind === "network" || result.kind === "unknown") {
    return (
      <StateMessage
        icon={<AlertTriangle className="w-4 h-4" />}
        tone="red"
        title="Couldn't load folder"
        body={result.message}
        testId="panel-gh-error"
      />
    );
  }

  const { entries } = result.listing;
  if (entries.length === 0) {
    return (
      <div
        className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2"
        data-testid="panel-gh-empty"
      >
        <Inbox className="w-6 h-6 text-muted-foreground/60" />
        <div>
          Folder is empty.{" "}
          <a
            href={folderUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-foreground hover:underline inline-flex items-center gap-1"
          >
            Open on GitHub
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="text-xs">Push a script below to populate it.</div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border" data-testid="list-gh-entries">
      {entries.map((e) => (
        <li
          key={e.path}
          className="flex items-center justify-between gap-3 p-2.5 px-4 text-sm"
          data-testid={`row-gh-${e.name}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {e.type === "dir" ? (
              <Folder className="w-4 h-4 text-violet-400 shrink-0" />
            ) : (
              <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="font-mono text-foreground/90 truncate">{e.name}</span>
            {e.type === "file" && (
              <span className="text-xs text-muted-foreground shrink-0">
                {formatBytes(e.size)}
              </span>
            )}
          </div>
          {e.htmlUrl && (
            <a
              href={e.htmlUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              data-testid={`link-gh-${e.name}`}
            >
              View
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function StateMessage({
  icon,
  tone,
  title,
  body,
  testId,
}: {
  icon: React.ReactNode;
  tone: "amber" | "red";
  title: string;
  body: string;
  testId: string;
}) {
  const cls =
    tone === "amber"
      ? "text-amber-200 border-amber-500/30 bg-amber-500/5"
      : "text-red-200 border-red-500/30 bg-red-500/5";
  return (
    <div className={`m-3 rounded border p-3 ${cls}`} data-testid={testId}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      <div className="text-xs mt-1 opacity-90">{body}</div>
    </div>
  );
}
