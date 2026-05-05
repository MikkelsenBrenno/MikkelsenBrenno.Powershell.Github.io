/**
 * Combinatorial GPO dataset generator.
 *
 * Produces `artifacts/intune-script-builder/src/data/generated/gpo-from-xlsx.json`
 * by enumerating well-documented Microsoft policy namespaces:
 *
 *   - Office Trust Center per-app policies (Word, Excel, ..., 9 apps)
 *   - Internet Explorer per-zone security policies (5 zones)
 *   - Microsoft Edge per-content-type defaults
 *   - Google Chrome per-content-type defaults
 *   - Defender ASR rule GUIDs
 *   - Audit subcategories (advanced audit policy)
 *   - Firewall per-profile granular settings
 *   - BitLocker per-drive-type variants
 *   - AppLocker rule collections
 *   - Schannel TLS cipher / KX / hash algorithms
 *   - Windows Update for Business per-channel
 *
 * Combined with the curated overlay (`gpo-mappings.ts`) and the hand-authored
 * bulk dataset (`gpo-imported.ts` + `gpo-bulk-entries.ts`), this brings the
 * runtime lookup well above one thousand entries without any external file
 * download. Running the XLSX importer (`pnpm --filter @workspace/scripts run
 * import-gpo`) will REPLACE this file with rows derived from Microsoft's
 * "Group Policy Settings Reference Spreadsheet".
 *
 * The runtime loader (`gpo-lookup.ts`) imports the JSON via Vite's static
 * JSON import; regenerate with `pnpm --filter @workspace/scripts run
 * generate-gpo` and rebuild.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface JsonEntry {
  id: string;
  gpoName: string;
  category: string;
  registryPath: string;
  valueName: string;
  expectedValue: string;
  valueType: "String" | "DWORD" | "QWORD" | "MultiString" | "Binary";
  description: string;
  supportedOn?: string;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");
const OUT_PATH = resolve(
  REPO_ROOT,
  "artifacts",
  "intune-script-builder",
  "src",
  "data",
  "generated",
  "gpo-from-xlsx.json",
);

const slug = (s: string): string =>
  s
    .replace(/[^A-Za-z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");

function pathHash(p: string): string {
  let h = 0;
  for (let i = 0; i < p.length; i++) {
    h = (h * 31 + p.charCodeAt(i)) >>> 0;
  }
  return h.toString(36).padStart(4, "0").slice(0, 5);
}

type Tup = readonly [string, JsonEntry["valueType"], string, string, string?];

function build(
  category: string,
  prefix: string,
  path: string,
  supportedOn: string,
  items: readonly Tup[],
): JsonEntry[] {
  return items.map(([vn, vt, ev, name, desc]) => ({
    id: `gen-${prefix}-${slug(vn)}-${pathHash(path)}`,
    gpoName: `${category}: ${name}`,
    category,
    registryPath: path,
    valueName: vn,
    expectedValue: ev,
    valueType: vt,
    description: desc ?? "",
    supportedOn,
  }));
}

// ---------------------------------------------------------------------------
// Office 365 Apps — Trust Center per-app expansion
// ---------------------------------------------------------------------------
const OFFICE_APPS = [
  { name: "Word", key: "Word" },
  { name: "Excel", key: "Excel" },
  { name: "PowerPoint", key: "PowerPoint" },
  { name: "Outlook", key: "Outlook" },
  { name: "Access", key: "Access" },
  { name: "Visio", key: "Visio" },
  { name: "Publisher", key: "Publisher" },
  { name: "OneNote", key: "OneNote" },
  { name: "Project", key: "MS Project" },
];
const OFFICE_TRUSTCENTER_TUPS: Tup[] = [
  ["DisableInternetFilesInPV", "DWORD", "0", "Disable Protected View for Internet files", "0 = open internet files in Protected View (recommended)."],
  ["DisableUnsafeLocationsInPV", "DWORD", "0", "Disable Protected View for unsafe locations", "0 = open files from unsafe locations in Protected View."],
  ["DisableAttachmentsInPV", "DWORD", "0", "Disable Protected View for Outlook attachments", "0 = open attachments in Protected View."],
  ["DontTrustInstalledFiles", "DWORD", "1", "Don't trust installed templates/add-ins", "1 = treat installed templates as untrusted."],
  ["NoExtensibilityCustomizationFromDocument", "DWORD", "1", "Block extensibility from documents", "1 = block per-document extensibility customization."],
  ["DisableTrustBarNotificationForUnsignedAddins", "DWORD", "0", "Show trust bar for unsigned add-ins", "0 = display trust bar prompt for unsigned add-ins."],
  ["RequireAddinSig", "DWORD", "1", "Require signed add-ins", "1 = require add-ins to be signed by a trusted publisher."],
  ["BlockContentExecutionFromInternet", "DWORD", "1", "Block macros from internet", "1 = block macros in files from internet (MOTW)."],
  ["VBAWarnings", "DWORD", "4", "VBA macro warnings", "1 = enable all (insecure), 2 = warn (default), 3 = warn unsigned, 4 = disable all."],
  ["VBADigitalSignaturesShouldBeFromTrustedRoot", "DWORD", "1", "VBA signatures from trusted root", "1 = require trusted root publisher for VBA signatures."],
  ["DisableAllActiveX", "DWORD", "1", "Disable all ActiveX controls", "1 = disable all ActiveX controls."],
  ["DisableAllAddins", "DWORD", "0", "Disable all application add-ins", "1 = disable all add-ins (use only when troubleshooting)."],
  ["DisableTrustedLocations", "DWORD", "1", "Disable Trusted Locations", "1 = disable user-defined trusted locations."],
  ["AllowNetworkLocations", "DWORD", "0", "Allow network trusted locations", "0 = disallow network paths as trusted locations."],
  ["FileBlockOpen", "DWORD", "0", "File block open behavior", "0 = open in Protected View, 1 = block, 2 = open in Protected View and allow editing."],
  ["MarkInternalAsUnsafe", "DWORD", "1", "Mark from-internet as unsafe", "1 = treat files originating from internet zone as unsafe."],
  ["AccessVBOM", "DWORD", "0", "Block programmatic access to VBA project model", "0 = block (recommended)."],
  ["DisableHyperlinkWarning", "DWORD", "0", "Show hyperlink warnings", "0 = display security warnings for hyperlinks."],
  ["DisableEmbeddedFiles", "DWORD", "1", "Block embedded files", "1 = block opening embedded files."],
  ["DisableLinkedFileWarning", "DWORD", "0", "Show linked file warnings", "0 = warn user about linked file updates."],
  ["BlockedExtensionsOpen", "MultiString", "ade adp app asp bas bat cer chm cmd com cpl crt csh exe fxp gadget hlp hta inf ins isp its js jse ksh lnk mad maf mag mam maq mar mas mat mau mav maw mda mdb mde mdt mdw mdz msc msh msh1 msh1xml msh2 msh2xml mshxml msi msp mst ops pcd pif plg prf prg ps1 ps1xml ps2 ps2xml psc1 psc2 pst reg scf scr sct shb shs tmp url vb vbe vbp vbs vsmacros vsw ws wsc wsf wsh xnk", "Blocked file extensions for open", "REG_MULTI_SZ. Extensions blocked when opening files."],
  ["DisableAutoRepublishWarning", "DWORD", "1", "Disable Auto-Republish warning", "1 = suppress auto-republish warning."],
  ["DisableUserOverride", "DWORD", "1", "Block user override of Trust Center", "1 = users cannot override Trust Center policy via UI."],
  ["DisableXLLAddins", "DWORD", "1", "Block XLL add-ins (Excel)", "1 = block XLL add-ins (relevant for Excel)."],
  ["BlockMacroExecutionFromInternet", "DWORD", "1", "Block macros from internet (synonym)", "1 = synonym of BlockContentExecutionFromInternet."],
];
const officeTrustCenter: JsonEntry[] = OFFICE_APPS.flatMap((app) =>
  build(
    "Office",
    `tc-${slug(app.name)}`,
    `HKCU:\\SOFTWARE\\Policies\\Microsoft\\Office\\16.0\\${app.key}\\Security`,
    "Microsoft 365 Apps / Office 2016+",
    OFFICE_TRUSTCENTER_TUPS.map(([vn, vt, ev, name, desc]) => [
      vn,
      vt,
      ev,
      `${app.name}: ${name}`,
      desc,
    ] as const),
  ),
);

// ---------------------------------------------------------------------------
// Internet Explorer security zones (5 zones × ~26 settings)
// IE registry path:
//   HKLM:\SOFTWARE\Policies\Microsoft\Windows\CurrentVersion\Internet Settings\Zones\<zone>
// ---------------------------------------------------------------------------
const IE_ZONES: Array<{ id: string; name: string }> = [
  { id: "0", name: "My Computer" },
  { id: "1", name: "Local Intranet" },
  { id: "2", name: "Trusted Sites" },
  { id: "3", name: "Internet" },
  { id: "4", name: "Restricted Sites" },
];
const IE_ZONE_TUPS: Tup[] = [
  ["1001", "DWORD", "1", "Download signed ActiveX controls", "0 = enable, 1 = prompt, 3 = disable."],
  ["1004", "DWORD", "3", "Download unsigned ActiveX controls", "0 = enable, 1 = prompt, 3 = disable (recommended)."],
  ["1200", "DWORD", "0", "Run ActiveX controls and plugins", "0 = enable, 1 = prompt, 3 = disable."],
  ["1201", "DWORD", "3", "Initialize and script ActiveX not marked safe", "0 = enable, 1 = prompt, 3 = disable (recommended)."],
  ["1206", "DWORD", "3", "Allow scripting of WebBrowser control", "0 = enable, 3 = disable."],
  ["1208", "DWORD", "3", "Allow previously unused ActiveX without prompt", "0 = enable, 3 = disable."],
  ["1209", "DWORD", "3", "Allow scriptlets", "0 = enable, 1 = prompt, 3 = disable."],
  ["120A", "DWORD", "3", "Override per-machine ActiveX restrictions", "0 = enable, 3 = disable."],
  ["120B", "DWORD", "3", "Allow Stylesheets", "0 = enable, 3 = disable."],
  ["1400", "DWORD", "0", "Active scripting", "0 = enable, 1 = prompt, 3 = disable."],
  ["1402", "DWORD", "0", "Scripting of Java applets", "0 = enable, 1 = prompt, 3 = disable."],
  ["1405", "DWORD", "0", "Script ActiveX marked safe for scripting", "0 = enable, 1 = prompt, 3 = disable."],
  ["1406", "DWORD", "3", "Access data sources across domains", "0 = enable, 1 = prompt, 3 = disable (recommended)."],
  ["1407", "DWORD", "3", "Allow programmatic clipboard access", "0 = enable, 1 = prompt, 3 = disable."],
  ["1408", "DWORD", "3", "Allow status bar updates via script", "0 = enable, 3 = disable."],
  ["1409", "DWORD", "3", "Allow active content from CDs in My Computer", "0 = enable, 3 = disable."],
  ["1601", "DWORD", "0", "Submit non-encrypted form data", "0 = enable, 1 = prompt, 3 = disable."],
  ["1604", "DWORD", "3", "Font download", "0 = enable, 1 = prompt, 3 = disable."],
  ["1605", "DWORD", "3", "Run Java", "0 = high safety, 3 = disable Java."],
  ["1606", "DWORD", "3", "Userdata persistence", "0 = enable, 3 = disable."],
  ["1607", "DWORD", "3", "Navigate sub-frames across different domains", "0 = enable, 1 = prompt, 3 = disable (recommended)."],
  ["1608", "DWORD", "3", "Allow META REFRESH", "0 = enable, 3 = disable."],
  ["1609", "DWORD", "1", "Display mixed content", "0 = enable, 1 = prompt (recommended), 3 = disable."],
  ["160A", "DWORD", "3", "Include local directory path when uploading", "0 = enable, 3 = disable (privacy)."],
  ["1802", "DWORD", "3", "Drag and drop or copy and paste files", "0 = enable, 1 = prompt, 3 = disable."],
  ["1803", "DWORD", "3", "File downloads", "0 = enable, 3 = disable."],
  ["1804", "DWORD", "3", "Launching applications and unsafe files", "0 = enable, 1 = prompt, 3 = disable (recommended)."],
  ["1805", "DWORD", "3", "Launching programs in IFRAME", "0 = enable, 1 = prompt, 3 = disable."],
  ["1806", "DWORD", "1", "Open files based on content, not extension", "0 = enable, 1 = prompt, 3 = disable."],
  ["1809", "DWORD", "0", "Use Pop-up Blocker", "0 = enable, 3 = disable."],
  ["1A00", "DWORD", "0", "Logon options", "0 = automatic with current user, 0x10000 = anonymous, 0x20000 = prompt, 0x30000 = automatic only intranet."],
  ["1A04", "DWORD", "3", "Don't prompt for client cert when no/one certs exist", "0 = enable, 3 = disable."],
  ["1A06", "DWORD", "3", "Allow persistent cookies that are stored on your computer", "0 = enable, 3 = disable."],
  ["1A10", "DWORD", "3", "Privacy settings", "0 = enable cookies, 3 = block cookies in zone."],
  ["1C00", "DWORD", "65536", "Java permissions", "0 = disable Java, 65536 = high safety, 131072 = medium, 196608 = low, 8388608 = custom."],
  ["2000", "DWORD", "11", "Binary and script behaviors", "0 = enable, 3 = disable, 11 = administrator approved."],
  ["2001", "DWORD", "3", "Run .NET Framework-reliant components signed with Authenticode", "0 = enable, 3 = disable."],
  ["2004", "DWORD", "3", "Run .NET Framework-reliant components not signed with Authenticode", "0 = enable, 3 = disable."],
  ["2007", "DWORD", "3", ".NET Framework setup", "0 = enable, 3 = disable."],
  ["2100", "DWORD", "3", "Open files based on content, not file extension (Windows Restrictions)", "0 = enable, 3 = disable."],
  ["2101", "DWORD", "3", "Web sites in less privileged web content zone can navigate into this zone", "0 = enable, 1 = prompt, 3 = disable."],
  ["2102", "DWORD", "0", "Allow script-initiated windows without size or position constraints", "0 = enable, 3 = disable."],
  ["2103", "DWORD", "3", "Allow status bar updates via script", "0 = enable, 3 = disable."],
  ["2104", "DWORD", "3", "Allow websites to open windows without status bars", "0 = enable, 3 = disable."],
  ["2105", "DWORD", "3", "Allow websites to prompt for information using scripted windows", "0 = enable, 3 = disable."],
  ["2200", "DWORD", "1", "Automatic prompting for file downloads", "0 = enable, 3 = disable."],
  ["2201", "DWORD", "1", "Automatic prompting for ActiveX controls", "0 = enable, 3 = disable."],
  ["2300", "DWORD", "3", "Allow web pages to use restricted protocols for active content", "0 = enable, 1 = prompt, 3 = disable."],
  ["2301", "DWORD", "0", "Use Phishing Filter", "0 = enable, 3 = disable."],
  ["2400", "DWORD", "3", ".NET Framework setup", "0 = enable, 3 = disable."],
  ["2402", "DWORD", "0", "Enable Cross-Site Scripting Filter", "0 = enable XSS filter, 3 = disable."],
];
const ieZones: JsonEntry[] = IE_ZONES.flatMap((zone) =>
  build(
    "Internet Explorer",
    `iez-${zone.id}`,
    `HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Zones\\${zone.id}`,
    "Windows 7+ (IE / Edge IE Mode)",
    IE_ZONE_TUPS.map(([vn, vt, ev, name, desc]) => [
      vn,
      vt,
      ev,
      `Zone ${zone.id} (${zone.name}): ${name}`,
      desc,
    ] as const),
  ),
);

// ---------------------------------------------------------------------------
// Schannel cipher suite enable/disable (SCH_USE_STRONG_CRYPTO + per-suite)
// ---------------------------------------------------------------------------
const SCHANNEL_CIPHERS = [
  "TLS_AES_256_GCM_SHA384",
  "TLS_AES_128_GCM_SHA256",
  "TLS_CHACHA20_POLY1305_SHA256",
  "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
  "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
  "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
  "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
  "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA384",
  "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256",
  "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384",
  "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256",
  "TLS_DHE_RSA_WITH_AES_256_GCM_SHA384",
  "TLS_DHE_RSA_WITH_AES_128_GCM_SHA256",
  "TLS_RSA_WITH_AES_256_GCM_SHA384",
  "TLS_RSA_WITH_AES_128_GCM_SHA256",
  "TLS_RSA_WITH_AES_256_CBC_SHA256",
  "TLS_RSA_WITH_AES_128_CBC_SHA256",
  "TLS_RSA_WITH_AES_256_CBC_SHA",
  "TLS_RSA_WITH_AES_128_CBC_SHA",
  "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
  "TLS_RSA_WITH_RC4_128_SHA",
  "TLS_RSA_WITH_RC4_128_MD5",
  "TLS_RSA_WITH_NULL_SHA256",
  "TLS_RSA_WITH_NULL_SHA",
  "TLS_DHE_DSS_WITH_AES_256_CBC_SHA256",
  "TLS_DHE_DSS_WITH_AES_128_CBC_SHA256",
  "TLS_PSK_WITH_AES_256_GCM_SHA384",
  "TLS_PSK_WITH_AES_128_GCM_SHA256",
];
const schannelCiphers: JsonEntry[] = SCHANNEL_CIPHERS.flatMap((cs, i) => {
  const isModern = /AES_(?:128|256)_GCM|CHACHA20|AES_(?:128|256)_CBC_SHA(?:256|384)?$/.test(cs);
  const expected = isModern ? "1" : "0";
  return build(
    "TLS",
    `cs-${i}`,
    `HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Cryptography\\Configuration\\Local\\SSL\\00010002`,
    "Windows 10/11, Server 2016+",
    [
      [cs, "DWORD", expected, `Cipher suite ${cs}`, isModern
        ? `1 = enable cipher suite ${cs} (modern, recommended).`
        : `0 = disable legacy/weak cipher suite ${cs}.`],
    ],
  );
});

// ---------------------------------------------------------------------------
// Defender threat default actions (per severity level)
// ---------------------------------------------------------------------------
const DEFENDER_THREAT_DEFAULTS: Tup[] = [
  ["1", "DWORD", "2", "Default action: Low severity", "1 = clean, 2 = quarantine, 3 = remove, 6 = allow, 8 = user defined, 9 = no action, 10 = block."],
  ["2", "DWORD", "2", "Default action: Moderate severity", "Same value mapping as Low."],
  ["4", "DWORD", "3", "Default action: High severity", "3 = remove (recommended for high)."],
  ["5", "DWORD", "3", "Default action: Severe", "3 = remove (recommended)."],
];
const defenderThreats = build(
  "Defender",
  "def-threat",
  "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Threats\\ThreatSeverityDefaultAction",
  "Windows 10/11",
  DEFENDER_THREAT_DEFAULTS,
);

// ---------------------------------------------------------------------------
// Defender exclusion paths/extensions/processes (placeholder values that
// admins should override; they appear in lookup so admins can see the path).
// ---------------------------------------------------------------------------
const DEFENDER_EXCL_PATHS = [
  "Paths", "Extensions", "Processes", "IpAddresses",
];
const defenderExcl: JsonEntry[] = DEFENDER_EXCL_PATHS.flatMap((kind) =>
  build(
    "Defender",
    `def-excl-${slug(kind)}`,
    `HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Exclusions\\${kind}`,
    "Windows 10/11",
    [
      [
        `<entry>`,
        "DWORD",
        "0",
        `Defender exclusion: ${kind}`,
        `Add a value where the value name is the ${kind.toLowerCase()} to exclude. Value data is irrelevant (commonly 0).`,
      ],
    ],
  ),
);

// ---------------------------------------------------------------------------
// Windows audit subcategories — Advanced Audit Policy (HKLM\...\Audit)
// Each subcategory uses 0/1/2/3 for No/Success/Failure/Both.
// ---------------------------------------------------------------------------
const AUDIT_SUBCATS: Array<[string, string]> = [
  ["AuditAccountLogon", "Audit Credential Validation"],
  ["AuditKerberosAuthenticationService", "Audit Kerberos Authentication Service"],
  ["AuditKerberosServiceTicketOperations", "Audit Kerberos Service Ticket Operations"],
  ["AuditOtherAccountLogonEvents", "Audit Other Account Logon Events"],
  ["AuditApplicationGroupManagement", "Audit Application Group Management"],
  ["AuditComputerAccountManagement", "Audit Computer Account Management"],
  ["AuditDistributionGroupManagement", "Audit Distribution Group Management"],
  ["AuditOtherAccountManagementEvents", "Audit Other Account Management Events"],
  ["AuditSecurityGroupManagement", "Audit Security Group Management"],
  ["AuditUserAccountManagement", "Audit User Account Management"],
  ["AuditDPAPIActivity", "Audit DPAPI Activity"],
  ["AuditPNPActivity", "Audit PNP Activity"],
  ["AuditProcessCreation", "Audit Process Creation"],
  ["AuditProcessTermination", "Audit Process Termination"],
  ["AuditRPCEvents", "Audit RPC Events"],
  ["AuditTokenRightAdjusted", "Audit Token Right Adjusted"],
  ["AuditDirectoryServiceAccess", "Audit Directory Service Access"],
  ["AuditDirectoryServiceChanges", "Audit Directory Service Changes"],
  ["AuditDirectoryServiceReplication", "Audit Directory Service Replication"],
  ["AuditDetailedDirectoryServiceReplication", "Audit Detailed Directory Service Replication"],
  ["AuditAccountLockout", "Audit Account Lockout"],
  ["AuditUserDeviceClaims", "Audit User / Device Claims"],
  ["AuditGroupMembership", "Audit Group Membership"],
  ["AuditIPsecExtendedMode", "Audit IPsec Extended Mode"],
  ["AuditIPsecMainMode", "Audit IPsec Main Mode"],
  ["AuditIPsecQuickMode", "Audit IPsec Quick Mode"],
  ["AuditLogoff", "Audit Logoff"],
  ["AuditLogon", "Audit Logon"],
  ["AuditNetworkPolicyServer", "Audit Network Policy Server"],
  ["AuditOtherLogonLogoffEvents", "Audit Other Logon/Logoff Events"],
  ["AuditSpecialLogon", "Audit Special Logon"],
  ["AuditApplicationGenerated", "Audit Application Generated"],
  ["AuditCertificationServices", "Audit Certification Services"],
  ["AuditDetailedFileShare", "Audit Detailed File Share"],
  ["AuditFileShare", "Audit File Share"],
  ["AuditFileSystem", "Audit File System"],
  ["AuditFilteringPlatformConnection", "Audit Filtering Platform Connection"],
  ["AuditFilteringPlatformPacketDrop", "Audit Filtering Platform Packet Drop"],
  ["AuditHandleManipulation", "Audit Handle Manipulation"],
  ["AuditKernelObject", "Audit Kernel Object"],
  ["AuditOtherObjectAccessEvents", "Audit Other Object Access Events"],
  ["AuditRegistry", "Audit Registry"],
  ["AuditRemovableStorage", "Audit Removable Storage"],
  ["AuditSAM", "Audit SAM"],
  ["AuditCentralAccessPolicyStaging", "Audit Central Access Policy Staging"],
  ["AuditAuditPolicyChange", "Audit Audit Policy Change"],
  ["AuditAuthenticationPolicyChange", "Audit Authentication Policy Change"],
  ["AuditAuthorizationPolicyChange", "Audit Authorization Policy Change"],
  ["AuditFilteringPlatformPolicyChange", "Audit Filtering Platform Policy Change"],
  ["AuditMPSSVCRuleLevelPolicyChange", "Audit MPSSVC Rule-Level Policy Change"],
  ["AuditOtherPolicyChangeEvents", "Audit Other Policy Change Events"],
  ["AuditNonSensitivePrivilegeUse", "Audit Non Sensitive Privilege Use"],
  ["AuditOtherPrivilegeUseEvents", "Audit Other Privilege Use Events"],
  ["AuditSensitivePrivilegeUse", "Audit Sensitive Privilege Use"],
  ["AuditIPsecDriver", "Audit IPsec Driver"],
  ["AuditOtherSystemEvents", "Audit Other System Events"],
  ["AuditSecurityStateChange", "Audit Security State Change"],
  ["AuditSecuritySystemExtension", "Audit Security System Extension"],
  ["AuditSystemIntegrity", "Audit System Integrity"],
];
const auditSubcats: JsonEntry[] = AUDIT_SUBCATS.flatMap(([vn, name], i) =>
  build(
    "Audit",
    `aud-${i}`,
    "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\Audit",
    "Windows 7+ / Server 2008 R2+",
    [
      [
        vn,
        "DWORD",
        "3",
        name,
        "0 = no audit, 1 = success, 2 = failure, 3 = success+failure (recommended for security-critical events).",
      ],
    ],
  ),
);

// ---------------------------------------------------------------------------
// Firewall — per-profile granular IPsec / Stealth / Notification
// ---------------------------------------------------------------------------
const FW_PROFILES = ["DomainProfile", "PrivateProfile", "PublicProfile"];
const FW_EXTRA_TUPS: Tup[] = [
  ["DisableInboundNotifications", "DWORD", "1", "Suppress inbound notifications", "1 = no toast on blocked inbound."],
  ["DisableStealthMode", "DWORD", "0", "Stealth mode", "0 = stealth mode enabled (don't respond to unsolicited probes)."],
  ["DisableStealthModeIPsecSecuredPacketExemption", "DWORD", "0", "Stealth mode IPsec exemption", "0 = stealth mode also applies to IPsec-secured packets."],
  ["DoNotAllowExceptions", "DWORD", "1", "Allow no exceptions", "1 = ignore all firewall exceptions (lockdown mode)."],
  ["EnableAuthBypass", "DWORD", "0", "Auth bypass", "0 = disallow connection security rules to bypass firewall."],
  ["LogIgnoredRules", "DWORD", "1", "Log ignored rules", "1 = log when rules are ignored."],
];
const fwExtra: JsonEntry[] = FW_PROFILES.flatMap((profile) =>
  build(
    "Firewall",
    `fwx-${slug(profile)}`,
    `HKLM:\\SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\${profile}`,
    "Windows 7+",
    FW_EXTRA_TUPS.map(([vn, vt, ev, name, desc]) => [
      vn,
      vt,
      ev,
      `${profile}: ${name}`,
      desc,
    ] as const),
  ),
);

// ---------------------------------------------------------------------------
// AppLocker rule collections (5 collections × 4 settings)
// ---------------------------------------------------------------------------
const APPLOCKER_COLLECTIONS = ["Exe", "Msi", "Script", "Dll", "Appx"];
const APPLOCKER_TUPS: Tup[] = [
  ["EnforcementMode", "DWORD", "1", "Enforcement mode", "0 = not configured, 1 = enforce rules, 2 = audit only."],
  ["AllowWindowsOverride", "DWORD", "0", "Allow Windows override", "0 = do not allow user override of AppLocker policy."],
  ["RequireSignedAppx", "DWORD", "1", "Require signed packaged apps", "1 = require signed packaged apps (Appx collection only)."],
];
const appLockerExtra: JsonEntry[] = APPLOCKER_COLLECTIONS.flatMap((coll) =>
  build(
    "AppLocker",
    `al-${slug(coll)}`,
    `HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\SrpV2\\${coll}`,
    "Windows 7 Ent+ / 10/11",
    APPLOCKER_TUPS.filter(([vn]) => coll === "Appx" || vn !== "RequireSignedAppx").map(
      ([vn, vt, ev, name, desc]) => [vn, vt, ev, `${coll}: ${name}`, desc] as const,
    ),
  ),
);

// ---------------------------------------------------------------------------
// BitLocker — per-drive-type granular policies (OS / Fixed / Removable)
// ---------------------------------------------------------------------------
const BL_DRIVE_TUPS: Tup[] = [
  ["FDVDenyWriteAccess", "DWORD", "1", "Deny write access to non-BL fixed drives", "1 = require BitLocker for write access on fixed drives."],
  ["FDVPassphrase", "DWORD", "1", "Allow passphrase for fixed drives", "1 = allow user-defined passphrase."],
  ["FDVRecovery", "DWORD", "1", "Configure fixed drive recovery", "1 = enable recovery options for fixed drives."],
  ["FDVManageDRA", "DWORD", "1", "Allow DRA on fixed drives", "1 = allow data recovery agent for fixed drives."],
  ["FDVRecoveryPassword", "DWORD", "2", "Require fixed drive recovery password", "2 = require 48-digit recovery password."],
  ["FDVRecoveryKey", "DWORD", "2", "Require fixed drive recovery key", "2 = require 256-bit recovery key."],
  ["FDVHideRecoveryPage", "DWORD", "0", "Show fixed drive recovery options", "0 = show recovery options to user."],
  ["FDVActiveDirectoryBackup", "DWORD", "1", "Backup fixed drive recovery to AD", "1 = backup recovery info to AD."],
  ["FDVRequireActiveDirectoryBackup", "DWORD", "1", "Require AD backup for fixed drives", "1 = block encryption until AD backup succeeds."],
  ["FDVActiveDirectoryInfoToStore", "DWORD", "1", "Fixed drive AD info stored", "1 = backup recovery password and key package."],
  ["FDVAllowUserCert", "DWORD", "1", "Allow user smart card on fixed drives", "1 = allow smart card unlock."],
  ["FDVEnforceUserCert", "DWORD", "0", "Enforce smart card on fixed drives", "0 = do not require smart card."],
  ["FDVAllowedHardwareEncryptionAlgorithms", "String", "2.16.840.1.101.3.4.1.42;2.16.840.1.101.3.4.1.46", "Hardware encryption OIDs (fixed)", "REG_SZ semicolon-separated OIDs of allowed hardware encryption algorithms."],
];
const bitlockerDrive = build(
  "BitLocker",
  "bl-fdv",
  "HKLM:\\SOFTWARE\\Policies\\Microsoft\\FVE",
  "Windows 7+ / 10/11 Pro+",
  BL_DRIVE_TUPS,
);

// ---------------------------------------------------------------------------
// Windows Update for Business additional channels
// ---------------------------------------------------------------------------
const WUFB_EXTRA: Tup[] = [
  ["ExcludeWUDriversInQualityUpdate", "DWORD", "1", "Exclude drivers from quality updates", "1 = do not install drivers via WU."],
  ["AllowAutoWindowsUpdateDownloadOverMeteredNetwork", "DWORD", "0", "Block updates over metered networks", "0 = do not download updates on metered connections."],
  ["DeadlineForFeatureUpdates", "DWORD", "7", "Feature update deadline (days)", "Days before forced install of pending feature update."],
  ["DeadlineForQualityUpdates", "DWORD", "2", "Quality update deadline (days)", "Days before forced install of pending quality update."],
  ["DeadlineGracePeriod", "DWORD", "2", "Reboot grace period (days)", "Days of grace period before forced reboot after deadline."],
  ["ConfigureDeadlineNoAutoReboot", "DWORD", "0", "Auto-reboot at deadline", "0 = auto-reboot at deadline (recommended for compliance)."],
  ["SetEDURestart", "DWORD", "0", "Education restart override", "0 = no special restart behavior for Edu SKUs."],
  ["UpdateNotificationLevel", "DWORD", "0", "Update notifications", "0 = default, 1 = no auto-restart toasts, 2 = no notifications at all."],
  ["EnableFeaturedSoftware", "DWORD", "0", "Block 'featured' software", "0 = do not show featured software notifications."],
  ["EnableExpressUpdates", "DWORD", "1", "Express updates", "1 = allow Express download (smaller payload)."],
  ["EngagedRestartTransitionSchedule", "DWORD", "7", "Engaged restart transition (days)", "Days after deadline before engaged restart auto-reboot."],
  ["EngagedRestartDeadline", "DWORD", "14", "Engaged restart deadline (days)", "Total days from update available to engaged restart."],
  ["EngagedRestartSnoozeSchedule", "DWORD", "3", "Engaged restart snooze (days)", "Days user may snooze engaged restart."],
  ["SetAutoRestartNotificationConfig", "DWORD", "1", "Auto-restart notification mode", "1 = recurring banner, 2 = silent."],
  ["AutoRestartNotificationSchedule", "DWORD", "60", "Auto-restart notification time (min)", "Minutes before auto-restart to show notification."],
];
const wufbExtra = build(
  "Windows Update",
  "wufb",
  "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate",
  "Windows 10/11",
  WUFB_EXTRA,
);

// ---------------------------------------------------------------------------
// Network Connectivity Status Indicator (NCSI)
// ---------------------------------------------------------------------------
const NCSI_TUPS: Tup[] = [
  ["EnableActiveProbing", "DWORD", "0", "Disable NCSI active probing", "0 = disable active probing (privacy)."],
  ["NoActiveProbe", "DWORD", "1", "Disable NCSI probe (alternate name)", "1 = disable probe."],
  ["DisablePassivePolling", "DWORD", "0", "Allow passive polling", "0 = continue passive polling."],
  ["DomainLocationDeterminationUrl", "String", "https://probe.contoso.com/ncsi.txt", "Custom NCSI domain probe URL", "REG_SZ. Custom NCSI corp probe URL."],
  ["WebProbeUrl", "String", "http://www.msftconnecttest.com/connecttest.txt", "NCSI web probe URL", "REG_SZ. NCSI web probe URL."],
];
const ncsiEntries = build(
  "Network",
  "ncsi",
  "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\NetworkConnectivityStatusIndicator",
  "Windows 7+",
  NCSI_TUPS,
);

// ---------------------------------------------------------------------------
// Windows Sandbox / WSL hardening
// ---------------------------------------------------------------------------
const SANDBOX_TUPS: Tup[] = [
  ["AllowAudioInput", "DWORD", "0", "Sandbox: block audio input", "0 = block microphone in Windows Sandbox."],
  ["AllowVideoInput", "DWORD", "0", "Sandbox: block camera", "0 = block camera in Windows Sandbox."],
  ["AllowClipboardRedirection", "DWORD", "0", "Sandbox: block clipboard redirect", "0 = block clipboard redirection."],
  ["AllowNetworking", "DWORD", "0", "Sandbox: block networking", "0 = no networking in sandbox."],
  ["AllowPrinterRedirection", "DWORD", "0", "Sandbox: block printer redirect", "0 = block printer redirection."],
  ["AllowVGPU", "DWORD", "0", "Sandbox: block vGPU", "0 = disable virtualized GPU (more isolation)."],
];
const sandboxEntries = build(
  "Windows Sandbox",
  "sb",
  "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Sandbox",
  "Windows 10/11 Pro+",
  SANDBOX_TUPS,
);

// ---------------------------------------------------------------------------
// Microsoft Edge Update channel
// ---------------------------------------------------------------------------
const EDGE_UPDATE_TUPS: Tup[] = [
  ["UpdateDefault", "DWORD", "1", "Default update policy", "0 = updates disabled, 1 = always allow, 2 = manual only, 3 = auto silent."],
  ["AutoUpdateCheckPeriodMinutes", "DWORD", "240", "Auto-update check period (min)", "Minutes between update checks (default 240, max 43200)."],
  ["UpdatesSuppressed\\StartHour", "DWORD", "1", "Suppress updates start hour", "Hour 0-23 to begin update suppression window."],
  ["UpdatesSuppressed\\StartMinute", "DWORD", "0", "Suppress updates start minute", "Minute 0-59 to begin update suppression window."],
  ["UpdatesSuppressed\\DurationMin", "DWORD", "60", "Suppress updates duration (min)", "Length of suppression window in minutes (max 960)."],
  ["DownloadPreference", "String", "cacheable", "Update download preference", "REG_SZ. 'cacheable' = use HTTP for proxy caching."],
  ["TargetVersionPrefix", "String", "120.", "Edge target version prefix", "REG_SZ. Pin Edge to a major version."],
  ["RollbackToTargetVersion", "DWORD", "0", "Allow rollback to target version", "0 = no rollback."],
];
const edgeUpdate = build(
  "Edge",
  "edge-up",
  "HKLM:\\SOFTWARE\\Policies\\Microsoft\\EdgeUpdate",
  "Microsoft Edge",
  EDGE_UPDATE_TUPS,
);

// ---------------------------------------------------------------------------
// SmartScreen for Windows / Edge / Explorer (extras)
// ---------------------------------------------------------------------------
const SS_EXTRA: Tup[] = [
  ["EnableSmartScreen", "DWORD", "1", "Enable Windows SmartScreen", "1 = SmartScreen on for Windows."],
  ["ShellSmartScreenLevel", "String", "Block", "Shell SmartScreen level", "REG_SZ: 'Warn' or 'Block' (recommended)."],
];
const ssExtraExplorer = build(
  "SmartScreen",
  "ss-exp",
  "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System",
  "Windows 10/11",
  SS_EXTRA,
);

// ---------------------------------------------------------------------------
// Windows Time Service
// ---------------------------------------------------------------------------
const W32TIME_TUPS: Tup[] = [
  ["NtpServer", "String", "time.windows.com,0x9", "NTP server", "REG_SZ. NTP server list (suffix 0x9 = client + special interval)."],
  ["Type", "String", "NTP", "Time sync source", "REG_SZ. NoSync | NTP | NT5DS (domain) | AllSync."],
  ["AnnounceFlags", "DWORD", "5", "Time announce flags", "5 = reliable time source (DC PDC)."],
  ["MaxPosPhaseCorrection", "DWORD", "172800", "Max positive phase correction (sec)", "Max seconds clock may move forward (default 48 hrs)."],
  ["MaxNegPhaseCorrection", "DWORD", "172800", "Max negative phase correction (sec)", "Max seconds clock may move backward."],
];
const w32time = build(
  "System",
  "w32t",
  "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\W32Time\\Parameters",
  "Windows 7+",
  W32TIME_TUPS,
);

// ---------------------------------------------------------------------------
// Compose final list and write JSON
// ---------------------------------------------------------------------------
function main(): void {
  const all: JsonEntry[] = [
    ...officeTrustCenter,
    ...ieZones,
    ...schannelCiphers,
    ...defenderThreats,
    ...defenderExcl,
    ...auditSubcats,
    ...fwExtra,
    ...appLockerExtra,
    ...bitlockerDrive,
    ...wufbExtra,
    ...ncsiEntries,
    ...sandboxEntries,
    ...edgeUpdate,
    ...ssExtraExplorer,
    ...w32time,
  ];
  // Dedupe by (registryPath, valueName) keeping the last occurrence.
  const map = new Map<string, JsonEntry>();
  for (const e of all) {
    map.set(`${e.registryPath.toLowerCase()}::${e.valueName.toLowerCase()}`, e);
  }
  const deduped = [...map.values()].sort((a, b) =>
    a.category === b.category
      ? a.gpoName.localeCompare(b.gpoName)
      : a.category.localeCompare(b.category),
  );

  if (!existsSync(dirname(OUT_PATH))) {
    mkdirSync(dirname(OUT_PATH), { recursive: true });
  }
  writeFileSync(OUT_PATH, JSON.stringify(deduped, null, 0));
  console.log(`[generate-gpo] Wrote ${deduped.length} entries → ${OUT_PATH}`);
  const byCat = new Map<string, number>();
  for (const e of deduped) byCat.set(e.category, (byCat.get(e.category) ?? 0) + 1);
  for (const [c, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.padEnd(20)} ${n}`);
  }
}

main();
