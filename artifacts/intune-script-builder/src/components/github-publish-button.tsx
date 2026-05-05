import { useMemo } from "react";
import { Github, ExternalLink, ChevronDown, FileWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

import type { LibraryEntry } from "@/lib/library";
import type { GitHubSettings } from "@/lib/github-settings";
import {
  type RepoFolderListing,
  fileExistsInListing,
} from "@/lib/github-contents";
import {
  planPublish,
  renderCommitMessage,
  slugifyEntryName,
  URL_VALUE_LIMIT,
} from "@/lib/github-publish";
import {
  generateRemediation,
  type ScriptInputs,
} from "@/lib/script-generation";
import type { Condition } from "@/lib/conditions";

interface Props {
  entry: LibraryEntry;
  settings: GitHubSettings | null;
  listing: RepoFolderListing | null;
  onConnectClick: () => void;
}

function entryToScriptInputs(entry: LibraryEntry): ScriptInputs {
  const c = entry.config;
  return {
    scriptName: c.scriptName,
    description: c.description,
    purpose: c.purpose,
    publisher: c.publisher,
    conditions: c.conditions as Condition[],
    combinator: c.combinator,
    rollback: c.rollback,
    inverseMode: c.inverseMode,
    variables: c.variables,
    loggingLevel: c.loggingLevel,
    logPath: c.logPath,
    runContext: c.runContext,
    architecture: c.architecture,
    dryRunMode: c.dryRunMode,
    pilotGroup: c.pilotGroup,
  };
}

export function GitHubPublishButton({
  entry,
  settings,
  listing,
  onConnectClick,
}: Props) {
  const { toast } = useToast();

  const filename = useMemo(
    () => slugifyEntryName(entry.name, entry.id),
    [entry.name, entry.id]
  );

  const script = useMemo(() => {
    try {
      return generateRemediation(entryToScriptInputs(entry));
    } catch {
      return "";
    }
  }, [entry]);

  const exists = fileExistsInListing(listing, filename);
  const message = settings
    ? renderCommitMessage(settings.commitMessageTemplate, {
        name: entry.name,
        filename,
      })
    : "";
  const plan = useMemo(
    () =>
      settings
        ? planPublish({
            owner: settings.owner,
            repo: settings.repo,
            branch: settings.branch,
            dir: settings.folder,
            filename,
            content: script,
            message,
            fileExists: exists,
          })
        : null,
    [settings, filename, script, message, exists]
  );

  const tooLarge = plan?.mode === "too-large";

  // Suffix-based create alternative when the file already exists.
  const altPlan = useMemo(() => {
    if (!settings || !exists || tooLarge) return null;
    const altName = filename.replace(/\.ps1$/i, "-2.ps1");
    return planPublish({
      owner: settings.owner,
      repo: settings.repo,
      branch: settings.branch,
      dir: settings.folder,
      filename: altName,
      content: script,
      message: renderCommitMessage(settings.commitMessageTemplate, {
        name: entry.name,
        filename: altName,
      }),
      fileExists: false,
    });
  }, [exists, tooLarge, filename, script, settings, entry.name]);

  if (!settings || !plan) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onConnectClick}
        title="Connect a GitHub repo first"
        data-testid={`button-gh-setup-${entry.id}`}
      >
        <Github className="w-3.5 h-3.5" />
        Set up GitHub
      </Button>
    );
  }

  const openInNewTab = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const onPrimaryClick = async () => {
    if (tooLarge) {
      try {
        await navigator.clipboard.writeText(script);
        toast({
          title: "Script copied — opening repo folder",
          description: `${filename} is too large for a deep link (${plan.encodedSize.toLocaleString()} chars). The folder is open in a new tab; create the file there and paste.`,
        });
      } catch {
        toast({
          title: "Open the folder and paste",
          description:
            "Clipboard access was denied — copy the script from the builder and paste it into the new GitHub file.",
        });
      }
      openInNewTab(plan.url);
      return;
    }
    openInNewTab(plan.url);
    toast({
      title: plan.mode === "update" ? "Opening edit page" : "Opening new file page",
      description: `GitHub will commit ${filename} with your account.`,
    });
  };

  const primaryLabel = tooLarge
    ? "Copy + open repo"
    : exists
      ? "Update on GitHub"
      : "Push to GitHub";
  const Icon = tooLarge ? FileWarning : Github;

  // No alternates when too-large or file is new — just render a simple
  // single-action button to keep the row uncluttered.
  if (tooLarge || !exists) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void onPrimaryClick()}
        title={
          tooLarge
            ? `Encoded script is ${plan.encodedSize.toLocaleString()} chars; deep-link cap is ${URL_VALUE_LIMIT}.`
            : `${plan.mode === "update" ? "Edit" : "Create"} ${filename} on ${settings.owner}/${settings.repo}@${settings.branch}`
        }
        data-testid={`button-gh-publish-${entry.id}`}
      >
        <Icon className="w-3.5 h-3.5" />
        {primaryLabel}
      </Button>
    );
  }

  // File exists: split-button with the alternative "create as new file"
  // option in a dropdown.
  return (
    <div className="inline-flex">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void onPrimaryClick()}
        className="rounded-r-none border-r-0"
        title={`Edit ${filename} on ${settings.owner}/${settings.repo}@${settings.branch}`}
        data-testid={`button-gh-publish-${entry.id}`}
      >
        <Github className="w-3.5 h-3.5" />
        {primaryLabel}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="rounded-l-none px-2"
            data-testid={`button-gh-publish-more-${entry.id}`}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs">
          <DropdownMenuItem
            onClick={() => void onPrimaryClick()}
            data-testid={`menuitem-gh-update-${entry.id}`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Update {filename}
          </DropdownMenuItem>
          {altPlan && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => openInNewTab(altPlan.url)}
                data-testid={`menuitem-gh-create-new-${entry.id}`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Create as new file (-2)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
