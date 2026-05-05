import { useEffect, useState } from "react";
import { Github, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

import {
  DEFAULT_GITHUB_SETTINGS,
  clearSettings,
  loadSettings,
  saveSettings,
  type GitHubSettings,
} from "@/lib/github-settings";
import { parseRepoSlug, renderCommitMessage } from "@/lib/github-publish";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (settings: GitHubSettings) => void;
  onDisconnected: () => void;
}

export function GitHubSettingsDialog({
  open,
  onOpenChange,
  onSaved,
  onDisconnected,
}: Props) {
  const { toast } = useToast();
  const [repoInput, setRepoInput] = useState("");
  const [branch, setBranch] = useState(DEFAULT_GITHUB_SETTINGS.branch);
  const [folder, setFolder] = useState(DEFAULT_GITHUB_SETTINGS.folder);
  const [commitMessageTemplate, setCommitMessageTemplate] = useState(
    DEFAULT_GITHUB_SETTINGS.commitMessageTemplate
  );
  const [error, setError] = useState<string | null>(null);
  const [hasExisting, setHasExisting] = useState(false);

  // Reset form contents when the dialog opens.
  useEffect(() => {
    if (!open) return;
    const existing = loadSettings();
    setHasExisting(existing !== null);
    setError(null);
    if (existing) {
      setRepoInput(`${existing.owner}/${existing.repo}`);
      setBranch(existing.branch);
      setFolder(existing.folder);
      setCommitMessageTemplate(existing.commitMessageTemplate);
    } else {
      setRepoInput("");
      setBranch(DEFAULT_GITHUB_SETTINGS.branch);
      setFolder(DEFAULT_GITHUB_SETTINGS.folder);
      setCommitMessageTemplate(DEFAULT_GITHUB_SETTINGS.commitMessageTemplate);
    }
  }, [open]);

  const parsed = parseRepoSlug(repoInput);
  const messagePreview = renderCommitMessage(commitMessageTemplate, {
    name: "Disable Cortana telemetry",
    filename: "disable-cortana-telemetry.ps1",
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = saveSettings({
      repoInput,
      branch,
      folder,
      commitMessageTemplate,
    });
    if (!result.ok || !result.settings) {
      setError(result.error ?? "Couldn't save settings.");
      return;
    }
    toast({
      title: "GitHub repo connected",
      description: `Library is now linked to ${result.settings.owner}/${result.settings.repo}.`,
    });
    onSaved(result.settings);
    onOpenChange(false);
  };

  const onDisconnect = () => {
    clearSettings();
    toast({
      title: "Disconnected",
      description: "GitHub repo settings cleared.",
    });
    onDisconnected();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-github-settings">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="w-5 h-5" />
            Connect GitHub repo
          </DialogTitle>
          <DialogDescription>
            We never store a token. Pushes open GitHub's prefilled "new file"
            page in a new tab — your existing GitHub session does the
            commit. Reading the folder listing only works for public repos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="gh-repo">Repository</Label>
            <Input
              id="gh-repo"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="owner/repo or https://github.com/owner/repo"
              autoFocus
              data-testid="input-gh-repo"
            />
            {repoInput && !parsed && (
              <p className="text-xs text-amber-300">
                Doesn't look like a valid repo. Use <code>owner/repo</code> or a github.com URL.
              </p>
            )}
            {parsed && (
              <p className="text-xs text-muted-foreground">
                Parsed as <span className="font-mono text-foreground/80">{parsed.owner}/{parsed.repo}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gh-branch">Branch</Label>
              <Input
                id="gh-branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                data-testid="input-gh-branch"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gh-folder">Folder</Label>
              <Input
                id="gh-folder"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="intune/scripts"
                data-testid="input-gh-folder"
              />
              <p className="text-xs text-muted-foreground">
                Empty = repo root. Slashes are allowed.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gh-message">Commit message template</Label>
            <Input
              id="gh-message"
              value={commitMessageTemplate}
              onChange={(e) => setCommitMessageTemplate(e.target.value)}
              placeholder={DEFAULT_GITHUB_SETTINGS.commitMessageTemplate}
              data-testid="input-gh-message"
            />
            <p className="text-xs text-muted-foreground">
              Tokens: <code>{"{name}"}</code>, <code>{"{filename}"}</code>. Preview:{" "}
              <span className="font-mono text-foreground/80" data-testid="text-gh-message-preview">
                {messagePreview}
              </span>
            </p>
          </div>

          {error && (
            <div className="text-sm text-red-300 border border-red-500/30 bg-red-500/10 rounded p-2">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {hasExisting && (
              <Button
                type="button"
                variant="ghost"
                className="text-red-400 hover:text-red-300 mr-auto"
                onClick={onDisconnect}
                data-testid="button-gh-disconnect"
              >
                <Trash2 className="w-4 h-4" />
                Disconnect
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              data-testid="button-gh-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!parsed} data-testid="button-gh-save">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
