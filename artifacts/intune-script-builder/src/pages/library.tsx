import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Library as LibraryIcon,
  Trash2,
  Pencil,
  Copy,
  Share2,
  ExternalLink,
  AlertTriangle,
  Inbox,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

import {
  buildShareUrl,
  deleteEntry,
  duplicateEntry,
  encodeShareConfig,
  entryConfigIsCurrentVersion,
  listEntries,
  LIBRARY_VERSION,
  MAX_ENTRIES,
  SHARE_URL_LENGTH_WARN,
  storageBytes,
  updateEntryName,
  type LibraryEntry,
} from "@/lib/library";
import { getScenarioById } from "@/data/scenarios";
import { loadSettings, type GitHubSettings } from "@/lib/github-settings";
import type { RepoFolderListing } from "@/lib/github-contents";
import { GitHubRepoPanel } from "@/components/github-repo-panel";
import { GitHubSettingsDialog } from "@/components/github-settings-dialog";
import { GitHubPublishButton } from "@/components/github-publish-button";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ts).toISOString();
  }
}

export default function LibraryPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [entries, setEntries] = useState<LibraryEntry[]>(() => listEntries());
  const [query, setQuery] = useState("");
  const [renameTarget, setRenameTarget] = useState<LibraryEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<LibraryEntry | null>(null);
  const [ghSettings, setGhSettings] = useState<GitHubSettings | null>(() => loadSettings());
  const [ghDialogOpen, setGhDialogOpen] = useState(false);
  const [ghListing, setGhListing] = useState<RepoFolderListing | null>(null);

  const refresh = () => setEntries(listEntries());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const scenarioName = getScenarioById(e.scenarioId).name.toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        e.scriptName.toLowerCase().includes(q) ||
        scenarioName.includes(q)
      );
    });
  }, [entries, query]);

  const totalBytes = useMemo(() => storageBytes(), [entries]);

  const handleLoad = (entry: LibraryEntry) => {
    const encoded = encodeShareConfig(entry.config);
    navigate(`/builder?config=${encoded}`);
  };

  const handleShare = async (entry: LibraryEntry) => {
    const url = buildShareUrl(entry.config);
    if (url.length > SHARE_URL_LENGTH_WARN) {
      toast({
        title: "Share link is long",
        description: `URL is ${url.length.toLocaleString()} chars; some apps may truncate it. Copied anyway.`,
      });
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Share link copied",
        description: "Paste it anywhere — recipients land on the builder pre-filled.",
      });
    } catch {
      toast({
        title: "Couldn't copy automatically",
        description: "Clipboard access was denied. Try the Share dialog instead.",
      });
    }
  };

  const handleDuplicate = (entry: LibraryEntry) => {
    const copy = duplicateEntry(entry.id);
    refresh();
    if (copy) {
      toast({
        title: "Duplicated",
        description: `Created “${copy.name}”.`,
      });
    }
  };

  const openRename = (entry: LibraryEntry) => {
    setRenameTarget(entry);
    setRenameValue(entry.name);
  };

  const confirmRename = () => {
    if (!renameTarget) return;
    updateEntryName(renameTarget.id, renameValue);
    setRenameTarget(null);
    setRenameValue("");
    refresh();
    toast({ title: "Renamed", description: "Library entry updated." });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    deleteEntry(deleteTarget.id);
    setDeleteTarget(null);
    refresh();
    toast({ title: "Deleted", description: `Removed “${name}” from your library.` });
  };

  // Keep entries fresh if the user comes back to this tab and another
  // tab modified storage in the meantime.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith("intune-script-builder:library")) {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div className="container max-w-screen-2xl py-8 flex-1">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <LibraryIcon className="w-7 h-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Script Library
            </h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-3xl">
            Saved configurations live in this browser. Load one back into the
            builder, duplicate, rename, delete, or copy a share link to send a
            ready-to-edit configuration to a teammate.
          </p>
        </div>
        <div
          className="rounded-md border border-border bg-card/40 p-3 text-xs text-muted-foreground space-y-1 min-w-[12rem]"
          data-testid="storage-indicator"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="uppercase tracking-wider text-[10px]">Storage</span>
            <span
              className="font-mono text-foreground/80"
              data-testid="text-storage-bytes"
            >
              {formatBytes(totalBytes)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="uppercase tracking-wider text-[10px]">Entries</span>
            <span className="font-mono text-foreground/80" data-testid="text-storage-count">
              {entries.length} / {MAX_ENTRIES}
            </span>
          </div>
        </div>
      </div>

      <GitHubRepoPanel
        settings={ghSettings}
        onConnectClick={() => setGhDialogOpen(true)}
        onSettingsClick={() => setGhDialogOpen(true)}
        onListingChange={setGhListing}
      />

      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, script name, or scenario..."
          data-testid="input-library-search"
        />
      </div>

      {entries.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 border border-dashed border-border rounded-lg">
          No saved scripts match your search.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <table className="w-full text-sm" data-testid="table-library">
            <thead className="bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">
                  Scenario
                </th>
                <th className="text-left p-3 font-medium hidden lg:table-cell">
                  Script Name
                </th>
                <th className="text-left p-3 font-medium hidden md:table-cell">
                  Last Modified
                </th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((entry) => {
                const isCurrent = entryConfigIsCurrentVersion(entry);
                const scenario = getScenarioById(entry.scenarioId);
                return (
                  <tr
                    key={entry.id}
                    className="hover:bg-secondary/20 transition-colors"
                    data-testid={`row-library-${entry.id}`}
                  >
                    <td className="p-3 align-top">
                      <div className="font-medium text-foreground" data-testid={`text-entry-name-${entry.id}`}>
                        {entry.name}
                      </div>
                      {!isCurrent && (
                        <div
                          className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5"
                          title={`Saved on schema ${entry.version}; current is ${LIBRARY_VERSION}`}
                          data-testid={`badge-older-version-${entry.id}`}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          Saved on older version — open to migrate
                        </div>
                      )}
                    </td>
                    <td className="p-3 align-top hidden md:table-cell">
                      <Badge
                        variant="outline"
                        className="bg-secondary/40 text-foreground/80 border-border/60"
                      >
                        {scenario.name}
                      </Badge>
                    </td>
                    <td className="p-3 align-top hidden lg:table-cell font-mono text-xs text-foreground/70">
                      {entry.scriptName}
                    </td>
                    <td
                      className="p-3 align-top hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap"
                      data-testid={`text-entry-updated-${entry.id}`}
                    >
                      {formatDate(entry.updatedAt)}
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleLoad(entry)}
                          data-testid={`button-load-${entry.id}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Load
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleShare(entry)}
                          title="Copy share link"
                          data-testid={`button-share-${entry.id}`}
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          Share
                        </Button>
                        <GitHubPublishButton
                          entry={entry}
                          settings={ghSettings}
                          listing={ghListing}
                          onConnectClick={() => setGhDialogOpen(true)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicate(entry)}
                          title="Duplicate"
                          data-testid={`button-duplicate-${entry.id}`}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openRename(entry)}
                          title="Rename"
                          data-testid={`button-rename-${entry.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(entry)}
                          title="Delete"
                          className="text-red-400 hover:text-red-300"
                          data-testid={`button-delete-${entry.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Rename dialog */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="dialog-rename">
          <DialogHeader>
            <DialogTitle>Rename script</DialogTitle>
            <DialogDescription>
              Choose a new name for this library entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-input">Name</Label>
            <Input
              id="rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmRename();
                }
              }}
              data-testid="input-rename"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRenameTarget(null)}
              data-testid="button-rename-cancel"
            >
              Cancel
            </Button>
            <Button onClick={confirmRename} data-testid="button-rename-confirm">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GitHubSettingsDialog
        open={ghDialogOpen}
        onOpenChange={setGhDialogOpen}
        onSaved={(s) => setGhSettings(s)}
        onDisconnected={() => {
          setGhSettings(null);
          setGhListing(null);
        }}
      />

      {/* Delete confirm */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="dialog-delete">
          <DialogHeader>
            <DialogTitle>Delete script?</DialogTitle>
            <DialogDescription>
              This permanently removes “{deleteTarget?.name}” from your local
              library. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              data-testid="button-delete-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              data-testid="button-delete-confirm"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center text-center py-16 border border-dashed border-border rounded-lg bg-card/30"
      data-testid="library-empty-state"
    >
      <Inbox className="w-10 h-10 text-muted-foreground/60 mb-3" />
      <h3 className="text-lg font-semibold text-foreground mb-1">
        Your library is empty
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mb-4">
        Open a scenario in the Builder, configure it, and click Save to keep
        it here for later. Share links also drop saved entries into this list.
      </p>
      <Link href="/builder">
        <Button variant="default" data-testid="button-open-builder">
          Open the Builder
        </Button>
      </Link>
    </div>
  );
}
