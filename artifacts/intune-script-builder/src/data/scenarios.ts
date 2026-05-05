import type { Condition, Variable } from "@/lib/conditions";
import { newConditionId } from "@/lib/conditions";

export type RiskLevel = "Low" | "Medium" | "High";
export type ScriptType = "Detection" | "Remediation" | "All";
export type RunContext = "System" | "User";
export type Architecture = "64-bit" | "32-bit";
export type LoggingLevel = "Basic" | "Detailed" | "Transcript";

export interface ScenarioDefaults {
  scriptName: string;
  description: string;
  // Optional in spirit (empty string is fine); always required on the
  // type so call sites don't have to null-check. Surfaced in the
  // generated script header alongside Description and Publisher.
  purpose: string;
  publisher: string;
  conditions: Condition[];
  combinator: "AND" | "OR";
  rollback: boolean;
  inverseMode: boolean;
  variables: Variable[];
  loggingLevel: LoggingLevel;
  logPath: string;
  runContext: RunContext;
  architecture: Architecture;
  dryRunMode: boolean;
  pilotGroup: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  useCase: string;
  description: string;
  riskLevel: RiskLevel;
  scriptType: ScriptType;
  rollbackRecommended: boolean;
  defaults: ScenarioDefaults;
}

const baseDefaults = {
  publisher: "IT Operations",
  purpose: "",
  combinator: "AND" as const,
  rollback: false,
  inverseMode: false,
  variables: [] as Variable[],
  loggingLevel: "Basic" as const,
  logPath: "$env:ProgramData\\IntuneScripts",
  runContext: "System" as const,
  architecture: "64-bit" as const,
  dryRunMode: false,
  pilotGroup: true,
};

function reg(opts: {
  registryPath: string;
  registryValueName: string;
  expectedValue: string;
  valueType: "String" | "DWORD" | "QWORD" | "MultiString" | "Binary";
  detectionOperator?: "-eq" | "-ne" | "-gt" | "-lt";
  action?: "Set" | "Remove";
}): Condition {
  return {
    id: newConditionId(),
    kind: "registry",
    registryPath: opts.registryPath,
    registryValueName: opts.registryValueName,
    expectedValue: opts.expectedValue,
    valueType: opts.valueType,
    detectionOperator: opts.detectionOperator ?? "-eq",
    action: opts.action ?? "Set",
  };
}

function svc(serviceName: string, expectedStatus: "Running" | "Stopped"): Condition {
  return { id: newConditionId(), kind: "service", serviceName, expectedStatus };
}

function file(filePath: string, expected: "Exists" | "NotExists"): Condition {
  return { id: newConditionId(), kind: "file", filePath, expected };
}

function task(taskName: string, expected: "Enabled" | "Disabled"): Condition {
  return { id: newConditionId(), kind: "scheduledTask", taskName, expected };
}

export const scenarios: Scenario[] = [
  {
    id: "reg-compliance-check",
    name: "Registry Value Compliance Check",
    useCase: "Check if a registry value matches expected.",
    description:
      "Validates if a specific registry key value exists and matches the required configuration. Does not make changes.",
    riskLevel: "Low",
    scriptType: "Detection",
    rollbackRecommended: false,
    defaults: {
      ...baseDefaults,
      scriptName: "Detect-ComplianceFlag",
      description: "Detects whether the corporate compliance flag is set.",
      conditions: [
        reg({
          registryPath: "HKLM:\\SOFTWARE\\Contoso\\Compliance",
          registryValueName: "Configured",
          expectedValue: "1",
          valueType: "DWORD",
        }),
      ],
    },
  },
  {
    id: "reg-value-create",
    name: "Registry Value Creation or Update",
    useCase: "Create or modify a registry value.",
    description:
      "Sets a registry value to a specific data type and value. Creates the path if it does not exist.",
    riskLevel: "Medium",
    scriptType: "Remediation",
    rollbackRecommended: true,
    defaults: {
      ...baseDefaults,
      scriptName: "Set-EnableFeature",
      description: "Creates or updates a corporate policy registry value.",
      purpose: "Enforce a corporate policy setting on managed endpoints so the desired feature stays enabled across reboots and user sessions.",
      rollback: true,
      loggingLevel: "Detailed",
      conditions: [
        reg({
          registryPath: "HKLM:\\SOFTWARE\\Policies\\Contoso",
          registryValueName: "EnableFeature",
          expectedValue: "1",
          valueType: "DWORD",
        }),
      ],
    },
  },
  {
    id: "reg-value-remove",
    name: "Remove Unwanted Registry Value",
    useCase: "Delete a specific registry value.",
    description: "Removes a targeted registry value to revert a setting or remove a restriction.",
    riskLevel: "Medium",
    scriptType: "Remediation",
    rollbackRecommended: true,
    defaults: {
      ...baseDefaults,
      scriptName: "Remove-EdgeHomepageOverride",
      description: "Removes a forced homepage policy so user-defined homepage applies.",
      purpose: "Restore user choice for the Edge homepage by removing a legacy enforced policy that no longer reflects current corporate guidance.",
      rollback: true,
      loggingLevel: "Detailed",
      conditions: [
        reg({
          registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
          registryValueName: "HomepageLocation",
          expectedValue: "",
          valueType: "String",
          detectionOperator: "-ne",
          action: "Remove",
        }),
      ],
    },
  },
  {
    id: "file-existence-check",
    name: "Local File Existence Check",
    useCase: "Verify a file exists on disk.",
    description:
      "Checks for the presence of a specific file at a given path to determine software installation or compliance.",
    riskLevel: "Low",
    scriptType: "Detection",
    rollbackRecommended: false,
    defaults: {
      ...baseDefaults,
      scriptName: "Detect-AgentInstalled",
      description: "Detects whether the corporate management agent file is present on disk.",
      conditions: [file("C:\\Program Files\\Contoso\\Agent\\agent.exe", "Exists")],
    },
  },
  {
    id: "folder-cleanup",
    name: "Local Folder Cleanup",
    useCase: "Remove a folder and its contents.",
    description: "Forcefully deletes a directory and all sub-items. Useful for clearing caches or uninstalls.",
    riskLevel: "High",
    scriptType: "Remediation",
    rollbackRecommended: true,
    defaults: {
      ...baseDefaults,
      scriptName: "Cleanup-StaleCacheFolder",
      description: "Removes a stale cache folder from the local machine.",
      purpose: "Reclaim disk space and clear corrupted cache state that has been linked to user-reported performance issues.",
      rollback: true,
      loggingLevel: "Detailed",
      conditions: [file("C:\\ProgramData\\Contoso\\Cache", "NotExists")],
    },
  },
  {
    id: "service-status-check",
    name: "Windows Service Status Check",
    useCase: "Verify a service is running/stopped.",
    description: "Checks the current state of a Windows service against the desired state.",
    riskLevel: "Low",
    scriptType: "Detection",
    rollbackRecommended: false,
    defaults: {
      ...baseDefaults,
      scriptName: "Detect-SpoolerRunning",
      description: "Detects whether the Print Spooler service is currently running.",
      conditions: [svc("Spooler", "Running")],
    },
  },
  {
    id: "scheduled-task-val",
    name: "Scheduled Task Validation",
    useCase: "Check if a scheduled task exists and is enabled.",
    description: "Validates the presence and status of a scheduled task.",
    riskLevel: "Low",
    scriptType: "Detection",
    rollbackRecommended: false,
    defaults: {
      ...baseDefaults,
      scriptName: "Detect-DefragTaskEnabled",
      description: "Verifies the built-in ScheduledDefrag task is enabled.",
      conditions: [task("ScheduledDefrag", "Enabled")],
    },
  },
  {
    id: "bitlocker-val",
    name: "BitLocker Setting Validation",
    useCase: "Check BitLocker configuration compliance.",
    description: "Verifies BitLocker registry keys and operational status.",
    riskLevel: "Low",
    scriptType: "Detection",
    rollbackRecommended: false,
    defaults: {
      ...baseDefaults,
      scriptName: "Detect-BitLockerEncryptionMethod",
      description: "Verifies BitLocker is configured to use XTS-AES 256 (value 7) for the OS drive.",
      conditions: [
        reg({
          registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\FVE",
          registryValueName: "EncryptionMethodWithXtsOs",
          expectedValue: "7",
          valueType: "DWORD",
        }),
      ],
    },
  },
  {
    id: "onedrive-val",
    name: "OneDrive Configuration Check",
    useCase: "Verify OneDrive registry settings.",
    description:
      "Checks Known Folder Move (KFM) and silent configuration registry values for OneDrive.",
    riskLevel: "Low",
    scriptType: "Detection",
    rollbackRecommended: false,
    defaults: {
      ...baseDefaults,
      scriptName: "Detect-OneDriveSilentConfig",
      description: "Detects whether OneDrive silent account configuration is enabled tenant-wide.",
      variables: [{ name: "tenantId", value: "00000000-0000-0000-0000-000000000000" }],
      conditions: [
        reg({
          registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\OneDrive",
          registryValueName: "SilentAccountConfig",
          expectedValue: "1",
          valueType: "DWORD",
        }),
        reg({
          registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\OneDrive\\KFMSilentOptIn",
          registryValueName: "{{tenantId}}",
          expectedValue: "1",
          valueType: "String",
        }),
      ],
    },
  },
  {
    id: "teams-cleanup",
    name: "Teams Machine-Wide Installer Cleanup",
    useCase: "Remove Teams machine-wide installer.",
    description:
      "Uninstalls the machine-wide Teams installer which can cause issues with new Teams deployments.",
    riskLevel: "High",
    scriptType: "Remediation",
    rollbackRecommended: true,
    defaults: {
      ...baseDefaults,
      scriptName: "Remove-TeamsMachineWideInstaller",
      description:
        "Detects and removes the Teams Machine-Wide Installer entry. Runs in 32-bit context because the installer is 32-bit.",
      purpose: "Eliminate the legacy Teams Machine-Wide Installer so the new Teams client can install and update without colliding with the old per-machine package.",
      rollback: true,
      inverseMode: true,
      architecture: "32-bit",
      loggingLevel: "Detailed",
      conditions: [
        reg({
          registryPath:
            "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{39AF0813-FA7B-4860-ADBE-93B9B214B914}",
          registryValueName: "DisplayName",
          expectedValue: "Teams Machine-Wide Installer",
          valueType: "String",
          action: "Set",
        }),
      ],
    },
  },
  {
    id: "browser-policy-check",
    name: "Browser Policy Registry Check",
    useCase: "Check browser policy registry values.",
    description: "Validates Edge or Chrome policy settings configured via registry.",
    riskLevel: "Low",
    scriptType: "Detection",
    rollbackRecommended: false,
    defaults: {
      ...baseDefaults,
      scriptName: "Detect-EdgeSmartScreen",
      description: "Verifies Microsoft Edge SmartScreen is enabled via group policy.",
      conditions: [
        reg({
          registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
          registryValueName: "SmartScreenEnabled",
          expectedValue: "1",
          valueType: "DWORD",
        }),
      ],
    },
  },
  {
    id: "custom-package",
    name: "Custom Intune Remediation Package",
    useCase: "Fully custom configuration.",
    description: "Start from scratch with a custom detection and remediation logic block.",
    riskLevel: "Medium",
    scriptType: "All",
    rollbackRecommended: true,
    defaults: {
      ...baseDefaults,
      scriptName: "Custom-Remediation-Script",
      description: "Custom Intune Proactive Remediation package.",
      purpose: "Replace with the specific business outcome this script is meant to drive (e.g. enforce a security baseline, fix a known issue).",
      rollback: true,
      conditions: [
        reg({
          registryPath: "HKLM:\\SOFTWARE\\Contoso",
          registryValueName: "ComplianceStatus",
          expectedValue: "1",
          valueType: "DWORD",
        }),
      ],
    },
  },
];

export function getScenarioById(id: string): Scenario {
  return scenarios.find((s) => s.id === id) ?? scenarios[0];
}

// Clones a scenario's defaults with FRESH condition IDs so the form gets
// stable but unique IDs when re-hydrating.
export function cloneScenarioDefaults(d: ScenarioDefaults): ScenarioDefaults {
  return {
    ...d,
    conditions: d.conditions.map((c) => ({ ...c, id: newConditionId() })),
    variables: d.variables.map((v) => ({ ...v })),
  };
}
