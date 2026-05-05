/**
 * Common Group Policy / Intune ADMX-backed registry mappings.
 *
 * This file holds the *curated* dataset — entries that the team has hand-
 * verified against Microsoft's policy reference. The much larger imported
 * dataset lives in `./generated/gpo-imported.ts` and is merged at lookup
 * time by `./gpo-lookup.ts`. Curated entries win on conflict and surface
 * with a "Verified" badge in the UI.
 *
 * Sources used to compile this list (verify in your environment before use):
 *   - Microsoft Edge policy reference (learn.microsoft.com/deployedge/microsoft-edge-policies)
 *   - Microsoft OneDrive ADMX reference (learn.microsoft.com/sharepoint/use-group-policy)
 *   - BitLocker GPO reference (learn.microsoft.com/windows/security/operating-system-security/data-protection/bitlocker)
 *   - Microsoft Defender for Endpoint policies (learn.microsoft.com/microsoft-365/security/defender-endpoint)
 *   - Windows Update for Business policy reference (learn.microsoft.com/windows/deployment/update/waas-wu-settings)
 *   - Chrome Enterprise policy list (chromeenterprise.google/policies)
 *   - Microsoft 365 Apps ADMX (learn.microsoft.com/deployoffice/admincenter/admx)
 *
 * Each entry is a STARTING POINT. Always validate the registry path,
 * value name, expected value, and architecture redirection (Wow6432Node)
 * for your specific Windows / app version before deploying.
 */

import type { VALUE_TYPES } from "@/lib/conditions";

type ValueType = (typeof VALUE_TYPES)[number];

/**
 * Category is loose (string) because the imported dataset can introduce new
 * categories the curated set doesn't know about. The UI builds the filter
 * pill list from whatever categories actually appear in the merged data.
 */
export type GpoCategory = string;

export interface GpoMapping {
  id: string;
  gpoName: string;
  category: GpoCategory;
  registryPath: string;
  valueName: string;
  expectedValue: string;
  valueType: ValueType;
  description: string;
  /**
   * Rough Windows / app version annotation, surfaced under the search result.
   * Optional because curated entries pre-date this field.
   */
  supportedOn?: string;
  /**
   * `true` when the entry has been hand-verified by the team. Surfaced as a
   * badge in the lookup UI so admins know which mappings have been double-
   * checked vs. auto-imported from the Microsoft reference.
   */
  verified?: boolean;
}

export const curatedGpoMappings: GpoMapping[] = [
  // BitLocker
  {
    id: "bl-encryption-os",
    gpoName: "BitLocker: Choose drive encryption method (OS drive)",
    category: "BitLocker",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\FVE",
    valueName: "EncryptionMethodWithXtsOs",
    expectedValue: "7",
    valueType: "DWORD",
    description: "7 = XTS-AES 256-bit (recommended). 6 = XTS-AES 128-bit.",
    verified: true,
  },
  {
    id: "bl-startup-auth",
    gpoName: "BitLocker: Require additional authentication at startup",
    category: "BitLocker",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\FVE",
    valueName: "UseAdvancedStartup",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Forces TPM+PIN or other startup authentication.",
    verified: true,
  },
  {
    id: "bl-recovery-ad",
    gpoName: "BitLocker: Backup OS recovery information to AD/Entra",
    category: "BitLocker",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\FVE",
    valueName: "OSActiveDirectoryBackup",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Escrows recovery key to Active Directory / Entra ID.",
    verified: true,
  },

  // OneDrive
  {
    id: "od-silent-config",
    gpoName: "OneDrive: Silently sign in users with their Windows credentials",
    category: "OneDrive",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\OneDrive",
    valueName: "SilentAccountConfig",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Auto-configures OneDrive for the signed-in user.",
    verified: true,
  },
  {
    id: "od-kfm-optin",
    gpoName: "OneDrive: Silently move Windows known folders to OneDrive",
    category: "OneDrive",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\OneDrive",
    valueName: "KFMSilentOptIn",
    expectedValue: "00000000-0000-0000-0000-000000000000",
    valueType: "String",
    description: "Replace the value with your Microsoft 365 tenant ID (GUID).",
    verified: true,
  },
  {
    id: "od-disable-personal",
    gpoName: "OneDrive: Prevent users from syncing personal accounts",
    category: "OneDrive",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\OneDrive",
    valueName: "DisablePersonalSync",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Blocks consumer OneDrive accounts on managed devices.",
    verified: true,
  },
  {
    id: "od-files-on-demand",
    gpoName: "OneDrive: Use OneDrive Files On-Demand",
    category: "OneDrive",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\OneDrive",
    valueName: "FilesOnDemandEnabled",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Enables placeholder files to save local disk space.",
    verified: true,
  },

  // Teams
  {
    id: "teams-prevent-mwi",
    gpoName: "Teams: Prevent Microsoft Teams Machine-Wide Installer (Office)",
    category: "Teams",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Office\\16.0\\Common\\OfficeUpdate",
    valueName: "PreventTeamsInstall",
    expectedValue: "1",
    valueType: "DWORD",
    description:
      "Stops Office C2R from re-installing the legacy Teams MWI on Office updates.",
    verified: true,
  },
  {
    id: "teams-mwi-presence",
    gpoName: "Teams: Detect Machine-Wide Installer presence (32-bit Uninstall)",
    category: "Teams",
    registryPath:
      "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{39AF0813-FA7B-4860-ADBE-93B9B214B914}",
    valueName: "DisplayName",
    expectedValue: "Teams Machine-Wide Installer",
    valueType: "String",
    description:
      "Use 32-bit run context. Indicates legacy Teams MWI is installed.",
    verified: true,
  },

  // Edge
  {
    id: "edge-smartscreen",
    gpoName: "Edge: Configure Microsoft Defender SmartScreen",
    category: "Edge",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
    valueName: "SmartScreenEnabled",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Enables SmartScreen URL/file reputation in Edge.",
    verified: true,
  },
  {
    id: "edge-smartscreen-pua",
    gpoName: "Edge: Configure SmartScreen for potentially unwanted apps",
    category: "Edge",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
    valueName: "SmartScreenPuaEnabled",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Blocks potentially unwanted application downloads.",
    verified: true,
  },
  {
    id: "edge-default-browser",
    gpoName: "Edge: Set Microsoft Edge as default browser prompt",
    category: "Edge",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
    valueName: "DefaultBrowserSettingEnabled",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Allows Edge to prompt to be the default browser.",
    verified: true,
  },
  {
    id: "edge-block-3p-cookies",
    gpoName: "Edge: Block third-party cookies",
    category: "Edge",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
    valueName: "BlockThirdPartyCookies",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Blocks all third-party cookies for privacy.",
    verified: true,
  },
  {
    id: "edge-password-manager-off",
    gpoName: "Edge: Disable saving browser history / password manager",
    category: "Edge",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
    valueName: "PasswordManagerEnabled",
    expectedValue: "0",
    valueType: "DWORD",
    description:
      "Disables Edge's built-in password manager (org uses other vault).",
    verified: true,
  },

  // Chrome
  {
    id: "chrome-safe-browsing",
    gpoName: "Chrome: Enable Safe Browsing Protection",
    category: "Chrome",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Google\\Chrome",
    valueName: "SafeBrowsingProtectionLevel",
    expectedValue: "2",
    valueType: "DWORD",
    description: "2 = Enhanced Safe Browsing. 1 = Standard. 0 = Off.",
    verified: true,
  },
  {
    id: "chrome-force-signin",
    gpoName: "Chrome: Force browser sign-in",
    category: "Chrome",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Google\\Chrome",
    valueName: "BrowserSignin",
    expectedValue: "2",
    valueType: "DWORD",
    description: "2 = Force users to sign in to use Chrome.",
    verified: true,
  },
  {
    id: "chrome-incognito",
    gpoName: "Chrome: Disable Incognito mode",
    category: "Chrome",
    registryPath: "HKLM:\\SOFTWARE\\Policies\\Google\\Chrome",
    valueName: "IncognitoModeAvailability",
    expectedValue: "1",
    valueType: "DWORD",
    description: "1 = Incognito disabled. 0 = Available. 2 = Forced.",
    verified: true,
  },

  // Windows Update
  {
    id: "wu-defer-feature",
    gpoName: "WUfB: Select when Preview Builds and Feature Updates are received",
    category: "Windows Update",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate",
    valueName: "DeferFeatureUpdates",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Defers feature updates by DeferFeatureUpdatesPeriodInDays.",
    verified: true,
  },
  {
    id: "wu-defer-quality",
    gpoName: "WUfB: Select when Quality Updates are received",
    category: "Windows Update",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate",
    valueName: "DeferQualityUpdates",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Defers monthly quality updates by configured days (0-30).",
    verified: true,
  },
  {
    id: "wu-wsus-server",
    gpoName: "Windows Update: Specify intranet Microsoft update service location",
    category: "Windows Update",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate",
    valueName: "WUServer",
    expectedValue: "https://wsus.contoso.com:8531",
    valueType: "String",
    description: "Replace with your WSUS server URL. Pair with WUStatusServer.",
    verified: true,
  },
  {
    id: "wu-au-options",
    gpoName: "Windows Update: Configure Automatic Updates",
    category: "Windows Update",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU",
    valueName: "AUOptions",
    expectedValue: "4",
    valueType: "DWORD",
    description:
      "2 = Notify before download. 3 = Auto download, notify install. 4 = Auto download and schedule install. 5 = Allow local admin to choose.",
    verified: true,
  },

  // Defender
  {
    id: "def-realtime",
    gpoName: "Defender: Turn off Microsoft Defender Antivirus real-time protection",
    category: "Defender",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection",
    valueName: "DisableRealtimeMonitoring",
    expectedValue: "0",
    valueType: "DWORD",
    description:
      "0 = Real-time protection enabled. 1 = Disabled (NOT recommended).",
    verified: true,
  },
  {
    id: "def-cloud-level",
    gpoName: "Defender: Join Microsoft MAPS (cloud-delivered protection)",
    category: "Defender",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Spynet",
    valueName: "SpynetReporting",
    expectedValue: "2",
    valueType: "DWORD",
    description:
      "2 = Advanced membership (recommended). 1 = Basic. 0 = Disabled.",
    verified: true,
  },
  {
    id: "def-tamper-protection",
    gpoName: "Defender: Tamper Protection state",
    category: "Defender",
    registryPath: "HKLM:\\SOFTWARE\\Microsoft\\Windows Defender\\Features",
    valueName: "TamperProtection",
    expectedValue: "5",
    valueType: "DWORD",
    description:
      "Read-only telemetry: 5 = enabled, 4 = disabled. Configure via Intune Security Baseline, NOT direct registry write.",
    verified: true,
  },
  {
    id: "def-sample-submission",
    gpoName: "Defender: Send file samples when further analysis is required",
    category: "Defender",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Spynet",
    valueName: "SubmitSamplesConsent",
    expectedValue: "1",
    valueType: "DWORD",
    description:
      "1 = Send safe samples automatically. Required for Block at first sight.",
    verified: true,
  },
  {
    id: "def-cfa",
    gpoName: "Defender: Configure Controlled Folder Access",
    category: "Defender",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Windows Defender Exploit Guard\\Controlled Folder Access",
    valueName: "EnableControlledFolderAccess",
    expectedValue: "1",
    valueType: "DWORD",
    description: "1 = Block. 2 = Audit mode. 0 = Disabled.",
    verified: true,
  },

  // Office
  {
    id: "office-block-macros-internet",
    gpoName: "Office Word: Block macros from running in files from the Internet",
    category: "Office",
    registryPath:
      "HKCU:\\SOFTWARE\\Policies\\Microsoft\\office\\16.0\\word\\security",
    valueName: "blockcontentexecutionfrominternet",
    expectedValue: "1",
    valueType: "DWORD",
    description:
      "Per-app key. Repeat for excel, powerpoint, etc. Run as USER context.",
    verified: true,
  },
  {
    id: "office-protected-view",
    gpoName: "Office Word: Force open in Protected View for legacy formats",
    category: "Office",
    registryPath:
      "HKCU:\\SOFTWARE\\Policies\\Microsoft\\office\\16.0\\word\\security\\fileblock",
    valueName: "openinprotectedview",
    expectedValue: "1",
    valueType: "DWORD",
    description:
      "Forces blocked file types to open in Protected View instead of being denied outright.",
    verified: true,
  },
  {
    id: "office-disable-telemetry",
    gpoName: "Microsoft 365 Apps: Disable Office telemetry agent",
    category: "Office",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\office\\common\\clienttelemetry",
    valueName: "DisableTelemetry",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Stops the Office telemetry agent from sending diagnostic data.",
    verified: true,
  },

  // Privacy / Security
  {
    id: "priv-cortana",
    gpoName: "Search: Allow Cortana",
    category: "Privacy",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search",
    valueName: "AllowCortana",
    expectedValue: "0",
    valueType: "DWORD",
    description: "0 = Disabled. 1 = Allowed.",
    verified: true,
  },
  {
    id: "priv-telemetry",
    gpoName: "Data Collection: Allow Diagnostic Data",
    category: "Privacy",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection",
    valueName: "AllowTelemetry",
    expectedValue: "1",
    valueType: "DWORD",
    description:
      "0 = Security only (Enterprise). 1 = Required. 2 = Enhanced. 3 = Optional.",
    verified: true,
  },
  {
    id: "priv-consumer-features",
    gpoName: "Cloud Content: Turn off Microsoft consumer experiences",
    category: "Privacy",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent",
    valueName: "DisableWindowsConsumerFeatures",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Removes consumer-targeted Start menu suggestions and apps.",
    verified: true,
  },
  {
    id: "sec-pin-length",
    gpoName: "Windows Hello: Minimum PIN length",
    category: "Security",
    registryPath:
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\PassportForWork\\PINComplexity",
    valueName: "MinimumPINLength",
    expectedValue: "6",
    valueType: "DWORD",
    description: "Minimum number of digits required for Windows Hello PIN.",
    verified: true,
  },
  {
    id: "sec-no-lm-hash",
    gpoName: "LSA: Do not store LAN Manager hash value on next password change",
    category: "Security",
    registryPath: "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa",
    valueName: "NoLMHash",
    expectedValue: "1",
    valueType: "DWORD",
    description: "Hardens credential storage. Recommended baseline setting.",
    verified: true,
  },
];

/**
 * Back-compat export: callers that imported `gpoMappings` directly used to
 * receive the curated list. New code should import from `./gpo-lookup` to
 * get the merged dataset (curated + imported).
 */
export const gpoMappings = curatedGpoMappings;

/**
 * Categories used by the curated dataset, kept for back-compat. The lookup
 * UI now derives its filter list from the merged (curated + imported)
 * categories at runtime.
 */
export const gpoCategories: GpoCategory[] = [
  "BitLocker",
  "OneDrive",
  "Teams",
  "Edge",
  "Chrome",
  "Windows Update",
  "Defender",
  "Office",
  "Privacy",
  "Security",
];
