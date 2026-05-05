import { useMemo, useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { BuilderFormValues } from "@/lib/builder-schema";
import type { Condition, RegistryCondition } from "@/lib/conditions";

export interface ChecklistItem {
  id: string;
  label: string;
  why: string;
  testCommand?: string;
}

interface RiskChecklistProps {
  values: BuilderFormValues;
}

// Convert a PowerShell-style registry path (HKLM:\SOFTWARE\...) into the
// `reg.exe` form (HKLM\SOFTWARE\...). Falls back to the original on weird
// inputs so we never produce something that looks like an obvious bug.
function toRegExePath(psPath: string): string {
  if (!psPath) return psPath;
  return psPath.replace(/^([A-Z]+):\\/i, "$1\\");
}

function buildRegistryItems(reg: RegistryCondition, idx: number): ChecklistItem[] {
  const safeName = reg.registryValueName || "(value)";
  const items: ChecklistItem[] = [
    {
      id: `reg-path-exists-${idx}`,
      label: `Registry path exists on the target: ${reg.registryPath}`,
      why: "Set-ItemProperty does not auto-create parent keys. If the path is missing on a clean device the remediation will throw.",
      testCommand: `reg query "${toRegExePath(reg.registryPath)}" /v "${safeName}"`,
    },
  ];
  if (reg.action === "Set" && reg.expectedValue) {
    items.push({
      id: `reg-value-set-${idx}`,
      label: `After remediation, ${safeName} equals ${reg.expectedValue} (${reg.valueType})`,
      why: "Confirms detection logic agrees with what remediation actually wrote, including the type (REG_DWORD vs REG_SZ).",
      testCommand: `(Get-ItemProperty -Path "${reg.registryPath}" -Name "${safeName}").${safeName}`,
    });
  }
  if (reg.action === "Remove") {
    items.push({
      id: `reg-value-removed-${idx}`,
      label: `After remediation, ${safeName} no longer exists`,
      why: "Verifies the remove path actually deletes the value (and that detection's -ne operator now passes).",
      testCommand: `Get-ItemProperty -Path "${reg.registryPath}" -Name "${safeName}" -ErrorAction SilentlyContinue`,
    });
  }
  return items;
}

function buildServiceItems(svc: Extract<Condition, { kind: "service" }>, idx: number): ChecklistItem[] {
  return [
    {
      id: `svc-${idx}`,
      label: `Service '${svc.serviceName}' exists and ends in ${svc.expectedStatus}`,
      why: "If the service is missing on the target SKU, the script will throw before it can act.",
      testCommand: `Get-Service -Name "${svc.serviceName}" -ErrorAction SilentlyContinue | Select-Object Status, StartType`,
    },
  ];
}

function buildFileItems(file: Extract<Condition, { kind: "file" }>, idx: number): ChecklistItem[] {
  const isRemoval = file.expected === "NotExists";
  return [
    {
      id: `file-${idx}`,
      label: isRemoval
        ? `Confirm '${file.filePath}' is safe to delete (no user data)`
        : `Confirm '${file.filePath}' is the correct path on every SKU`,
      why: isRemoval
        ? "Folder cleanup is destructive. Validate the path on a representative device before fleet-wide deployment."
        : "Hard-coded paths can vary by OS edition (Program Files vs Program Files (x86), language packs, etc).",
      testCommand: `Test-Path "${file.filePath}"`,
    },
  ];
}

function buildTaskItems(task: Extract<Condition, { kind: "scheduledTask" }>, idx: number): ChecklistItem[] {
  return [
    {
      id: `task-${idx}`,
      label: `Scheduled task '${task.taskName}' exists and is ${task.expected.toLowerCase()}`,
      why: "Some built-in tasks are renamed or removed in newer Windows builds; treat absence as a real failure mode.",
      testCommand: `Get-ScheduledTask -TaskName "${task.taskName}" -ErrorAction SilentlyContinue | Select-Object State, TaskPath`,
    },
  ];
}

// Scenario-specific checklist items. Keyed by scenario id so we don't have to
// pattern-match keywords on the script name.
const SCENARIO_EXTRAS: Record<string, ChecklistItem[]> = {
  "bitlocker-val": [
    {
      id: "bitlocker-status",
      label: "OS volume reports the expected encryption method on a pilot device",
      why: "Group-policy registry values can disagree with the actual encryption method if the volume was encrypted before the policy was applied.",
      testCommand: 'manage-bde -status C: | Select-String "Encryption Method"',
    },
    {
      id: "bitlocker-recovery",
      label: "Recovery key is escrowed before forcing re-encryption",
      why: "Changing encryption parameters can trigger a re-encrypt; without an escrowed recovery key, a failed boot is unrecoverable.",
    },
  ],
  "onedrive-val": [
    {
      id: "onedrive-tenant-id",
      label: "Tenant ID variable matches the production Microsoft 365 tenant",
      why: "KFMSilentOptIn keys are scoped per tenant ID. The value name IS the tenant ID, so a typo silently no-ops.",
    },
    {
      id: "onedrive-user-context",
      label: "Per-user OneDrive paths are NOT referenced from a SYSTEM-context script",
      why: "Environment variables like %OneDriveCommercial% are populated by the OneDrive client at user logon and are unset under SYSTEM.",
    },
  ],
  "teams-cleanup": [
    {
      id: "teams-uninstall-string",
      label: "Uninstall string from the registry is the documented MSI ProductCode",
      why: "The Teams Machine-Wide Installer ProductCode has shifted across versions; verify against a current device before fleet-wide rollout.",
      testCommand:
        'Get-ItemProperty "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*" | Where-Object DisplayName -Like "Teams Machine-Wide Installer"',
    },
    {
      id: "teams-new-teams-installed",
      label: "New Teams (msteams) is already deployed before removing the machine-wide installer",
      why: "Removing the machine-wide installer on a device that has only Classic Teams will leave users with no Teams client at all.",
    },
  ],
  "folder-cleanup": [
    {
      id: "folder-cleanup-backup",
      label: "Snapshot the folder (or capture a manifest) before deleting",
      why: "Remove-Item -Recurse is irreversible from Intune. A small manifest in C:\\ProgramData\\<vendor>\\backup makes recovery possible without re-imaging.",
    },
  ],
};

function buildChecklist(values: BuilderFormValues): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const conditions = (values.conditions ?? []) as Condition[];

  // Always-on baseline items.
  items.push({
    id: "pilot",
    label: "Tested on a single pilot device first",
    why: "Pilot rings catch path/SKU/permission issues that lab images don't reproduce.",
  });
  items.push({
    id: "exit-codes",
    label: "Detection exits 0 (compliant) or 1 (non-compliant) on every code path",
    why: "Intune treats anything other than `exit 0` from detection as 'run remediation'. Returning $true / $false has no effect.",
  });

  // Per-condition items.
  conditions.forEach((c, idx) => {
    if (c.kind === "registry") items.push(...buildRegistryItems(c, idx));
    else if (c.kind === "service") items.push(...buildServiceItems(c, idx));
    else if (c.kind === "file") items.push(...buildFileItems(c, idx));
    else if (c.kind === "scheduledTask") items.push(...buildTaskItems(c, idx));
  });

  // Run-context aware items.
  if (values.runContext === "System") {
    items.push({
      id: "ctx-system",
      label: "Script targets only machine-wide state (no HKCU, no per-user paths)",
      why: "SYSTEM has its own profile. HKCU and %APPDATA% under SYSTEM are not the signed-in user's data.",
    });
  } else {
    items.push({
      id: "ctx-user",
      label: "User-context dependency understood (script will not run on locked or signed-out devices)",
      why: "User-context Proactive Remediations require an interactive logon and are skipped — not failed — when no user is present.",
    });
  }

  // Architecture aware item — only meaningful when touching the registry.
  const hasRegistry = conditions.some((c) => c.kind === "registry");
  if (hasRegistry) {
    if (values.architecture === "32-bit") {
      items.push({
        id: "arch-32-redirection",
        label: "Aware that HKLM:\\SOFTWARE writes will be redirected into Wow6432Node",
        why: "PowerShell running under a 32-bit host silently rewrites HKLM:\\SOFTWARE paths. Confirm this is what you want.",
      });
    } else {
      items.push({
        id: "arch-64-direct",
        label: "Registry path is in the 64-bit view (no literal Wow6432Node segment unless intentional)",
        why: "A 64-bit script that references Wow6432Node literally edits the 32-bit view, which is rarely what you want for modern apps.",
      });
    }
  }

  // Logging guidance scales with logging level.
  if (values.loggingLevel === "Basic") {
    items.push({
      id: "logging-basic",
      label: "Acceptable that only basic Write-Output is captured (no transcript)",
      why: "Intune retains only a small slice of detection output. For fleet debugging, prefer Detailed or Transcript logging.",
    });
  } else {
    items.push({
      id: "logging-rotation",
      label: "Log file path under C:\\ProgramData\\<vendor>\\Logs and is rotated/capped",
      why: "Long-running deployments can balloon log directories on every device if logs aren't rotated.",
    });
  }

  // Rollback specific items.
  if (values.rollback) {
    items.push({
      id: "rollback-tested",
      label: "Rollback script restores the original state on a test device",
      why: "A rollback that diverges from the remediation is worse than no rollback at all — it leaves the fleet in an undefined state.",
    });
    items.push({
      id: "rollback-distribution",
      label: "Rollback is staged in Intune and assignable independently of the remediation",
      why: "Rollback only helps if you can deploy it quickly. Pre-stage the package so you can target a single ring during incident response.",
    });
  }

  // Inverse / uninstall mode.
  if (values.inverseMode) {
    items.push({
      id: "inverse-recurrence",
      label: "Removed/uninstalled artifact does not re-appear on the next sync cycle",
      why: "Inverse-mode remediations can fight other policies that re-create the artifact. Verify the source is also disabled.",
    });
  }

  // Variable-substitution audit.
  const definedVars = new Set(values.variables.map((v) => v.name));
  if (definedVars.size > 0) {
    items.push({
      id: "vars-resolved",
      label: `All ${definedVars.size} variable${definedVars.size === 1 ? "" : "s"} resolve to production values (no dev placeholders)`,
      why: "Tenant IDs, paths, and DisplayNames templated as {{var}} are convenient but easy to ship with the wrong value.",
    });
  }

  // Scenario-specific extras.
  const scenarioExtras = SCENARIO_EXTRAS[values.scenarioId];
  if (scenarioExtras) items.push(...scenarioExtras);

  return items;
}

interface ChecklistRowProps {
  item: ChecklistItem;
}

function ChecklistRow({ item }: ChecklistRowProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!item.testCommand) return;
    try {
      await navigator.clipboard.writeText(item.testCommand);
      setCopied(true);
      toast({ title: "Copied", description: "Test command copied to clipboard." });
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast({
        title: "Copy failed",
        description: "Clipboard access was denied.",
        variant: "destructive",
      });
    }
  };

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-md border border-border/60 bg-background/30"
      data-testid={`checklist-row-${item.id}`}
    >
      <Checkbox id={item.id} className="mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Label
          htmlFor={item.id}
          className="text-sm font-medium leading-snug cursor-pointer"
        >
          {item.label}
        </Label>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{item.why}</p>
        {item.testCommand && (
          <div className="flex items-stretch gap-1.5 mt-1">
            <code
              className="flex-1 min-w-0 text-[11px] font-mono bg-secondary/40 border border-border/60 rounded px-2 py-1 break-all leading-relaxed"
              data-testid={`checklist-cmd-${item.id}`}
            >
              {item.testCommand}
            </code>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={copy}
                  className="shrink-0 inline-flex items-center justify-center px-2 rounded border border-border/60 bg-secondary/30 hover:bg-secondary/60 transition-colors"
                  data-testid={`checklist-copy-${item.id}`}
                  aria-label="Copy test command"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Copy test command</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

export function RiskChecklist({ values }: RiskChecklistProps) {
  const items = useMemo(() => buildChecklist(values), [values]);

  return (
    <div
      className="bg-card border border-border rounded-lg p-6 mt-8"
      data-testid="risk-checklist"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center">
          <ShieldCheck className="w-5 h-5 mr-2 text-primary" />
          Tailored Deployment Readiness Checklist
        </h3>
        <span
          className="text-[10px] uppercase tracking-wider text-muted-foreground"
          data-testid="text-checklist-count"
        >
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Items adapt to your scenario, conditions, run context, and rollback
        choices. Hover the copy icon next to a test command to validate the
        check on a pilot device.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {items.map((item) => (
          <ChecklistRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
