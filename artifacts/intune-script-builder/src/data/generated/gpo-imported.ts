/**
 * GPO Lookup — imported dataset.
 *
 * Generated from a compact source-of-truth of well-documented Microsoft Group
 * Policy / ADMX-backed registry mappings. This file is written by hand using
 * the helper functions below; to refresh from a Microsoft "Group Policy
 * Settings Reference Spreadsheet" (XLSX), drop the file into
 * `scripts/data/raw/` and run:
 *
 *     pnpm --filter @workspace/scripts run import-gpo
 *
 * The importer (see `scripts/src/import-gpo.ts`) merges new rows from the
 * spreadsheet into this file, preserving any hand-curated overrides defined
 * in `gpo-mappings.ts`.
 *
 * Sources used to compile this dataset (verify in your environment):
 *   - learn.microsoft.com/deployedge/microsoft-edge-policies
 *   - learn.microsoft.com/microsoft-365/security/defender-endpoint
 *   - learn.microsoft.com/sharepoint/use-group-policy (OneDrive)
 *   - learn.microsoft.com/deployoffice/admincenter/admx
 *   - learn.microsoft.com/windows/deployment/update/waas-wu-settings
 *   - learn.microsoft.com/windows/security
 *   - chromeenterprise.google/policies
 *   - admx.help (Microsoft & ADMX schema reference)
 *
 * Each entry is a STARTING POINT. Always validate the registry path, value
 * name, expected value, and architecture redirection (Wow6432Node) for your
 * specific Windows / app version before deploying.
 */

import type { GpoMapping } from "@/data/gpo-mappings";

type ValueType = GpoMapping["valueType"];

const slug = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");

interface EntryOpts {
  category: string;
  prefix: string;
  path: string;
}

// Stable, short string hash so IDs that share a prefix+valueName but differ
// by registryPath (e.g. AppLocker SrpV2\Exe vs \Msi vs \Script with the same
// EnforcementMode value) still get unique React keys and entry IDs.
function pathHash(p: string): string {
  let h = 0;
  for (let i = 0; i < p.length; i++) {
    h = (h * 31 + p.charCodeAt(i)) >>> 0;
  }
  return h.toString(36).padStart(4, "0").slice(0, 5);
}

function entry(
  opts: EntryOpts,
  valueName: string,
  valueType: ValueType,
  expected: string,
  name: string,
  description: string,
  supportedOn?: string,
): GpoMapping {
  return {
    id: `${opts.prefix}-${slug(valueName)}-${pathHash(opts.path)}`,
    gpoName: `${opts.category}: ${name}`,
    category: opts.category,
    registryPath: opts.path,
    valueName,
    expectedValue: expected,
    valueType,
    description,
    supportedOn,
    verified: false,
  };
}

// ---------------------------------------------------------------------------
// Microsoft Edge (Chromium)
// ---------------------------------------------------------------------------
const EDGE = {
  category: "Edge",
  prefix: "edge",
  path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
};
const edge = (vn: string, vt: ValueType, ev: string, name: string, desc: string) =>
  entry(EDGE, vn, vt, ev, name, desc, "Microsoft Edge 88+");
const edgeOn = (vn: string, name: string, desc: string) => edge(vn, "DWORD", "1", name, desc);
const edgeOff = (vn: string, name: string, desc: string) => edge(vn, "DWORD", "0", name, desc);

const edgeEntries: GpoMapping[] = [
  edgeOn("AutofillAddressEnabled", "Enable address autofill", "1 = allow address autofill, 0 = block."),
  edgeOff("AutofillCreditCardEnabled", "Disable credit card autofill", "0 = block credit card autofill (recommended in regulated tenants)."),
  edgeOn("AlwaysOpenPdfExternally", "Open PDFs externally instead of inline", "1 = open PDFs in the system default viewer rather than Edge's built-in viewer."),
  edgeOn("BackgroundModeEnabled", "Allow background processing when Edge is closed", "1 = Edge background tasks may run after the window closes."),
  edgeOn("BingAdsSuppression", "Suppress ads in Bing search results", "1 = strip ads from Bing search results; 0 = default (ads shown)."),
  edge("BlockThirdPartyCookies", "DWORD", "1", "Block third-party cookies", "1 = block all third-party cookies (recommended for privacy)."),
  edge("BrowserSignin", "DWORD", "2", "Force browser sign-in", "0 = disable sign-in, 1 = allow user to sign in, 2 = force sign-in (recommended for managed devices)."),
  edgeOff("BrowserAddProfileEnabled", "Disable adding new browser profiles", "0 = users cannot add additional profiles."),
  edgeOff("BrowserGuestModeEnabled", "Disable guest mode", "0 = block guest browsing sessions."),
  edge("ClearBrowsingDataOnExit", "DWORD", "1", "Clear browsing data on exit", "1 = wipe browsing data when Edge closes."),
  edgeOff("ConfigureDoNotTrack", "Send Do Not Track requests", "Set to 1 to send DNT header on outgoing requests."),
  edgeOn("DefaultBrowserSettingEnabled", "Allow default browser prompt", "1 = let Edge prompt to be the default browser."),
  edgeOff("DeveloperToolsAvailability", "Disable developer tools", "2 = disable for all sites. 1 = allow except force-installed extensions. 0 = allow."),
  edge("DiagnosticData", "DWORD", "1", "Diagnostic data level", "0 = off, 1 = required, 2 = optional. Pair with Windows AllowTelemetry."),
  edge("DnsOverHttpsMode", "String", "automatic", "DNS-over-HTTPS mode", "REG_SZ: off | automatic | secure. 'secure' falls back to system if DoH unreachable."),
  edge("DownloadRestrictions", "DWORD", "1", "Block dangerous downloads", "0 = no restriction, 1 = block dangerous, 2 = block potentially dangerous, 3 = block all."),
  edgeOn("EnterpriseModeSiteListManagerAllowed", "Allow Enterprise Mode site list manager", "Required when using IE Mode site lists."),
  edge("ExtensionInstallBlocklist\\1", "String", "*", "Block all extensions by default", "Use '*' to block all extensions, then allowlist via ExtensionInstallAllowlist."),
  edgeOff("ExtensionInstallSources", "Restrict extension install sources", "List of allowed URLs for sideloading extensions."),
  edgeOn("ForceGoogleSafeSearch", "Force Google SafeSearch", "Forces SafeSearch=active on Google search URLs."),
  edgeOn("ForceBingSafeSearch", "Force Bing SafeSearch", "1 = strict, 2 = moderate. Forces Bing adult-content filter."),
  edgeOff("HardwareAccelerationModeEnabled", "Disable hardware acceleration", "0 = disable GPU acceleration (use only when troubleshooting)."),
  edgeOn("HideFirstRunExperience", "Hide first-run experience", "1 = skip first-run setup screens."),
  edge("HomepageIsNewTabPage", "DWORD", "0", "Use HomepageLocation as homepage", "1 = use New Tab Page as homepage; 0 = use the URL configured in HomepageLocation."),
  edge("HomepageLocation", "String", "https://intranet.contoso.com", "Set homepage URL", "REG_SZ: URL shown when the home button is pressed."),
  edgeOn("ImportAutofillFormData", "Import autofill data on first run", "1 = import from default browser at first run."),
  edge("InPrivateModeAvailability", "DWORD", "1", "Disable InPrivate browsing", "1 = InPrivate disabled. 0 = available. 2 = forced InPrivate-only."),
  edgeOff("ImportSavedPasswords", "Skip importing saved passwords", "0 = do not import saved passwords from default browser."),
  edgeOn("InternetExplorerIntegrationLevel", "Enable IE Mode", "1 = IE Mode (sites in Enterprise Mode list open in IE engine)."),
  edge("InternetExplorerIntegrationSiteList", "String", "https://contoso.com/ie-mode-list.xml", "IE Mode site list URL", "REG_SZ: URL of XML file with IE Mode site mappings."),
  edgeOff("MetricsReportingEnabled", "Disable usage metrics reporting", "0 = stop sending diagnostic and usage metrics to Microsoft."),
  edgeOff("NetworkPredictionOptions", "Disable network prediction", "2 = never predict, 1 = predict only on Wi-Fi, 0 = always predict."),
  edge("NewTabPageLocation", "String", "https://intranet.contoso.com", "Custom new tab page URL", "REG_SZ: URL shown for new tabs (replaces default NTP)."),
  edgeOff("PaymentMethodQueryEnabled", "Disable payment method query", "0 = sites cannot check if user has saved payment methods."),
  edgeOff("PasswordManagerEnabled", "Disable built-in password manager", "0 = disable; org should rely on a separate password vault."),
  edgeOn("PreventSmartScreenPromptOverride", "Prevent SmartScreen prompt override", "1 = users cannot bypass SmartScreen warnings for sites."),
  edgeOn("PreventSmartScreenPromptOverrideForFiles", "Prevent SmartScreen override for files", "1 = users cannot bypass SmartScreen warnings for downloads."),
  edge("ProxySettings\\ProxyMode", "String", "system", "Proxy mode", "REG_SZ: 'direct', 'system', 'auto_detect', 'pac_script', or 'fixed_servers'."),
  edgeOn("RestoreOnStartup", "Restore last session on startup", "1 = restore last session, 4 = open list of URLs, 5 = open NTP."),
  edgeOff("SafeBrowsingForTrustedSourcesEnabled", "Disable Safe Browsing for trusted downloads", "0 = skip Safe Browsing for files from trusted sources."),
  edge("SafeBrowsingProtectionLevel", "DWORD", "1", "Safe Browsing protection level", "0 = off, 1 = standard (recommended), 2 = enhanced (real-time URL checks + sample submission)."),
  edge("SearchSuggestEnabled", "DWORD", "0", "Disable search suggestions", "0 = block search suggestions sent to default search provider."),
  edgeOn("ShowHomeButton", "Show Home button", "1 = display the home button in the toolbar."),
  edgeOn("SitePerProcess", "Force site isolation", "1 = process-per-site (mitigates cross-site script attacks)."),
  edgeOn("SmartScreenEnabled", "Configure Microsoft Defender SmartScreen", "1 = SmartScreen URL/file reputation enabled."),
  edgeOn("SmartScreenPuaEnabled", "SmartScreen for potentially unwanted apps", "1 = block PUA downloads."),
  edgeOn("SyncDisabled", "Disable Edge Sync", "1 = disable Sync (recommended for managed devices). 0 = allow Sync."),
  edgeOff("TranslateEnabled", "Disable translate suggestions", "0 = no translate prompt."),
  edge("UrlBlocklist\\1", "String", "facebook.com", "Block specific URL", "REG_SZ: per-index URL pattern to block. Add UrlBlocklist\\2, \\3, ... for more entries."),
  edge("UserDataDir", "String", "${local_app_data}\\Microsoft\\Edge\\User Data", "Set user data directory", "REG_SZ. Useful for FSLogix/non-persistent VDI. Use Edge variables like ${local_app_data}, ${roaming_app_data}."),
  edge("WebRtcLocalhostIpHandling", "String", "default_public_interface_only", "Restrict WebRTC IP exposure", "REG_SZ. Values: default | default_public_and_private_interfaces | default_public_interface_only | disable_non_proxied_udp."),
];

// ---------------------------------------------------------------------------
// Google Chrome
// ---------------------------------------------------------------------------
const CHROME = {
  category: "Chrome",
  prefix: "chrome",
  path: "HKLM:\\SOFTWARE\\Policies\\Google\\Chrome",
};
const chrome = (vn: string, vt: ValueType, ev: string, name: string, desc: string) =>
  entry(CHROME, vn, vt, ev, name, desc, "Chrome 78+");

const chromeEntries: GpoMapping[] = [
  chrome("AllowDinosaurEasterEgg", "DWORD", "0", "Disable dinosaur game on offline page", "0 = hide the offline T-Rex game."),
  chrome("AutofillAddressEnabled", "DWORD", "1", "Enable address autofill", "1 = allow address autofill."),
  chrome("AutofillCreditCardEnabled", "DWORD", "0", "Disable credit card autofill", "0 = block credit card autofill."),
  chrome("BackgroundModeEnabled", "DWORD", "0", "Disable background mode", "0 = Chrome stops when window closes."),
  chrome("BlockThirdPartyCookies", "DWORD", "1", "Block third-party cookies", "1 = block third-party cookies."),
  chrome("BrowserGuestModeEnabled", "DWORD", "0", "Disable guest mode", "0 = block guest browsing sessions."),
  chrome("BrowserSignin", "DWORD", "2", "Force browser sign-in", "2 = force sign-in. Required for cloud-managed Chrome."),
  chrome("ChromeCleanupEnabled", "DWORD", "0", "Disable Chrome software cleanup", "0 = disable the malicious software remover."),
  chrome("DeveloperToolsAvailability", "DWORD", "2", "Disable developer tools", "2 = disable for all sites."),
  chrome("DefaultBrowserSettingEnabled", "DWORD", "0", "Disable Chrome default-browser prompt", "0 = stop Chrome from prompting to be default."),
  chrome("DownloadRestrictions", "DWORD", "3", "Block all downloads", "0=allow, 1=block dangerous, 2=block potentially dangerous, 3=block all."),
  chrome("ExtensionInstallBlocklist\\1", "String", "*", "Block all Chrome extensions by default", "REG_SZ '*' blocks all; pair with ExtensionInstallAllowlist."),
  chrome("ForceGoogleSafeSearch", "DWORD", "1", "Force Google SafeSearch", "1 = always force SafeSearch on."),
  chrome("HomepageIsNewTabPage", "DWORD", "1", "Homepage = new tab page", "1 = NTP as homepage."),
  chrome("HomepageLocation", "String", "https://intranet.contoso.com", "Set homepage URL", "REG_SZ: home button destination."),
  chrome("IncognitoModeAvailability", "DWORD", "1", "Disable Incognito mode", "1 = disabled. 0 = available. 2 = forced."),
  chrome("MetricsReportingEnabled", "DWORD", "0", "Disable usage and crash reporting", "0 = do not send usage statistics or crash reports."),
  chrome("PasswordManagerEnabled", "DWORD", "0", "Disable built-in password manager", "0 = disable Chrome's password vault."),
  chrome("RemoteAccessHostFirewallTraversal", "DWORD", "0", "Disable Chrome Remote Desktop NAT traversal", "0 = block Remote Desktop traversal."),
  chrome("SafeBrowsingProtectionLevel", "DWORD", "2", "Enable Enhanced Safe Browsing", "2 = Enhanced. 1 = Standard. 0 = Off."),
  chrome("SyncDisabled", "DWORD", "1", "Disable Chrome Sync", "1 = sync disabled. 0 = allow."),
  chrome("TranslateEnabled", "DWORD", "0", "Disable translate prompts", "0 = block translate suggestions."),
  chrome("UrlBlocklist\\1", "String", "*", "Block all URLs by default", "REG_SZ '*' blocks all sites; pair with UrlAllowlist."),
];

// ---------------------------------------------------------------------------
// Microsoft Defender Antivirus
// ---------------------------------------------------------------------------
const DEF_ROOT = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender";
const def = (
  subPath: string,
  vn: string,
  vt: ValueType,
  ev: string,
  name: string,
  desc: string,
): GpoMapping =>
  entry(
    {
      category: "Defender",
      prefix: "def",
      path: subPath ? `${DEF_ROOT}\\${subPath}` : DEF_ROOT,
    },
    vn,
    vt,
    ev,
    name,
    desc,
    "Windows 10 1607+ / Windows 11",
  );

const defenderEntries: GpoMapping[] = [
  def("", "DisableAntiSpyware", "DWORD", "0", "Turn off Microsoft Defender Antivirus", "0 = Defender enabled. 1 = disabled (NOT recommended; superseded on Windows 11)."),
  def("", "PUAProtection", "DWORD", "1", "Configure PUA protection", "0 = disabled, 1 = block PUA, 2 = audit PUA."),
  def("", "DisableLocalAdminMerge", "DWORD", "1", "Prevent local admins from overriding policy", "1 = ignore local admin AV exclusions/threat overrides."),
  def("Real-Time Protection", "DisableBehaviorMonitoring", "DWORD", "0", "Behavior monitoring", "0 = enabled. 1 = disabled (NOT recommended)."),
  def("Real-Time Protection", "DisableScanOnRealtimeEnable", "DWORD", "0", "Scan all downloaded files and attachments", "0 = scan, 1 = skip."),
  def("Real-Time Protection", "DisableIOAVProtection", "DWORD", "0", "Scan downloaded files and attachments", "0 = scan IOAV downloads."),
  def("Real-Time Protection", "DisableOnAccessProtection", "DWORD", "0", "On-access (file system) monitoring", "0 = enabled (recommended)."),
  def("Real-Time Protection", "DisableScriptScanning", "DWORD", "0", "Script scanning (PowerShell, JS, VBScript)", "0 = enabled."),
  def("Real-Time Protection", "RealtimeSignatureDelivery", "DWORD", "1", "Real-time signature delivery", "1 = stream signatures from cloud as they arrive."),
  def("Spynet", "SpynetReporting", "DWORD", "2", "Microsoft MAPS membership", "0 = off, 1 = basic, 2 = advanced (recommended)."),
  def("Spynet", "SubmitSamplesConsent", "DWORD", "1", "Sample submission", "0 = always prompt, 1 = send safe samples (required for Block-at-First-Sight), 2 = never send, 3 = send all samples."),
  def("Spynet", "LocalSettingOverrideSpynetReporting", "DWORD", "0", "Block local override of MAPS membership", "0 = group policy wins; 1 = user setting wins."),
  def("MpEngine", "MpCloudBlockLevel", "DWORD", "2", "Cloud block level", "0 = default, 1 = moderate, 2 = high, 4 = high+, 6 = zero tolerance."),
  def("MpEngine", "MpBafsExtendedTimeout", "DWORD", "50", "Cloud check extended timeout (seconds)", "Allow Defender up to 50s to wait for a cloud verdict (Block at First Sight)."),
  def("Scan", "DisableEmailScanning", "DWORD", "0", "Email scanning", "0 = scan email file containers."),
  def("Scan", "DisableArchiveScanning", "DWORD", "0", "Archive scanning (zip, rar, etc.)", "0 = scan inside archives."),
  def("Scan", "DisableRemovableDriveScanning", "DWORD", "0", "Scan removable drives during full scan", "0 = scan USB/removable media."),
  def("Scan", "ScheduleQuickScanTime", "DWORD", "120", "Quick scan time (minutes after midnight)", "120 = 02:00 local time. Set 0-1439."),
  def("Scan", "ScheduleDay", "DWORD", "0", "Scheduled full scan day", "0 = every day, 1 = Sunday, ... 7 = Saturday, 8 = never."),
  def("Scan", "DisableCpuThrottleOnIdleScans", "DWORD", "1", "Disable CPU throttling on idle scans", "1 = use full CPU when system is idle."),
  def("Signature Updates", "ForceUpdateFromMU", "DWORD", "1", "Allow updates from Microsoft Update", "1 = fall back to MU when WSUS is unavailable."),
  def("Signature Updates", "FallbackOrder", "String", "MicrosoftUpdateServer|MMPC", "Update fallback order", "REG_SZ pipe-separated. e.g. InternalDefinitionUpdateServer|MicrosoftUpdateServer|MMPC."),
  def("Signature Updates", "SignatureUpdateInterval", "DWORD", "4", "Signature update check interval (hours)", "Check for updates every N hours (0-24)."),
  def("Windows Defender Exploit Guard\\Network Protection", "EnableNetworkProtection", "DWORD", "1", "Network protection", "0 = disabled, 1 = block, 2 = audit only."),
  def("Windows Defender Exploit Guard\\ASR", "ExploitGuard_ASR_Rules", "DWORD", "1", "Enable ASR rules engine", "1 = enable Attack Surface Reduction."),
  def("Windows Defender Exploit Guard\\Controlled Folder Access", "EnableControlledFolderAccess", "DWORD", "1", "Controlled Folder Access", "0 = off, 1 = block, 2 = audit, 3 = block disk modifications, 4 = audit disk modifications."),
  def("Quarantine", "PurgeItemsAfterDelay", "DWORD", "30", "Purge quarantined items after N days", "0 = keep forever. Recommended 30-90 days for forensics."),
  def("Reporting", "DisableEnhancedNotifications", "DWORD", "0", "Defender enhanced notifications", "0 = show enhanced notifications. 1 = hide."),
  def("Threats", "Threats_ThreatSeverityDefaultAction", "DWORD", "1", "Default action for threat severities", "Combine with ThreatSeverityDefaultAction subkeys (1=Low, 2=Mod, 4=High, 5=Severe)."),
];

// ---------------------------------------------------------------------------
// Microsoft Defender SmartScreen (Windows Explorer + Edge legacy)
// ---------------------------------------------------------------------------
const SS = {
  category: "SmartScreen",
  prefix: "ss",
  path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System",
};
const ss = (vn: string, vt: ValueType, ev: string, name: string, desc: string) =>
  entry(SS, vn, vt, ev, name, desc, "Windows 10 1703+");

const smartScreenEntries: GpoMapping[] = [
  ss("EnableSmartScreen", "DWORD", "1", "Configure Windows Defender SmartScreen", "0 = off, 1 = warn, 2 = warn and prevent bypass."),
  ss("ShellSmartScreenLevel", "String", "Block", "SmartScreen level for unrecognized files", "REG_SZ 'Warn' or 'Block'. Block prevents user override."),
  entry({ category: "SmartScreen", prefix: "ss-edge", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\MicrosoftEdge\\PhishingFilter" }, "EnabledV9", "DWORD", "1", "Legacy Edge SmartScreen", "1 = enable for legacy Edge HTML browser.", "Windows 10 (legacy Edge)"),
  entry({ category: "SmartScreen", prefix: "ss-edge", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\MicrosoftEdge\\PhishingFilter" }, "PreventOverride", "DWORD", "1", "Prevent SmartScreen bypass (legacy Edge)", "1 = users cannot bypass SmartScreen warnings.", "Windows 10 (legacy Edge)"),
  entry({ category: "SmartScreen", prefix: "ss-store", path: "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppHost" }, "EnableWebContentEvaluation", "DWORD", "1", "SmartScreen for Microsoft Store apps", "1 = check URLs that Store apps load.", "Windows 10/11"),
];

// ---------------------------------------------------------------------------
// OneDrive (additional beyond curated)
// ---------------------------------------------------------------------------
const OD = {
  category: "OneDrive",
  prefix: "od",
  path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\OneDrive",
};
const od = (vn: string, vt: ValueType, ev: string, name: string, desc: string) =>
  entry(OD, vn, vt, ev, name, desc, "OneDrive 19.x+");

const onedriveEntries: GpoMapping[] = [
  od("PreventNetworkTrafficPreUserSignIn", "DWORD", "1", "Block OneDrive network traffic before user sign-in", "1 = OneDrive cannot phone home before user logs in (privacy)."),
  od("DisableTutorial", "DWORD", "1", "Disable OneDrive sync app tutorial", "1 = skip the welcome / tutorial UI."),
  od("BlockExternalSync", "DWORD", "1", "Block syncing OneDrive accounts in external orgs", "1 = users cannot sync libraries from other tenants."),
  od("EnableODIgnoreListFromGPO", "DWORD", "1", "Enable Excluded File Extensions list (machine policy)", "Pair with BlockedFileExtensions REG_SZ list."),
  od("DefaultRootDir", "String", "C:\\Users\\%USERNAME%\\OneDrive - Contoso", "Set default OneDrive root directory", "REG_SZ template; OneDrive expands %USERNAME%."),
  od("DiskSpaceCheckThresholdMB", "DWORD", "1024", "Files On-Demand cache size threshold (MB)", "Below this remaining free disk space, OneDrive starts evicting cached files."),
  od("AutomaticUploadBandwidthPercentage", "DWORD", "70", "Automatic upload bandwidth limit (%)", "Limit OneDrive uploads to N% of measured bandwidth (10-99)."),
  od("EnableHoldTheFile", "DWORD", "1", "'Hold the File' on Known Folder conflicts", "1 = pause sync and keep both copies on conflict."),
  od("EnableEnterpriseUpdateRing", "String", "Deferred", "Enterprise update ring", "REG_SZ. 'Production' (default), 'Insiders', or 'Deferred'."),
  od("EnableSyncAdminReports", "DWORD", "1", "Enable OneDrive sync admin reports", "1 = telemetry to OneDrive admin center."),
  od("DisablePauseOnMeteredNetwork", "DWORD", "0", "Allow OneDrive to pause on metered networks", "0 = pause uploads on metered connections (default)."),
];

// ---------------------------------------------------------------------------
// Windows Update for Business
// ---------------------------------------------------------------------------
const WU = {
  category: "Windows Update",
  prefix: "wu",
  path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate",
};
const WUAU = {
  category: "Windows Update",
  prefix: "wu-au",
  path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU",
};
const wu = (vn: string, vt: ValueType, ev: string, name: string, desc: string) =>
  entry(WU, vn, vt, ev, name, desc, "Windows 10 1607+ / Windows 11");
const wuau = (vn: string, vt: ValueType, ev: string, name: string, desc: string) =>
  entry(WUAU, vn, vt, ev, name, desc, "Windows 10 1607+ / Windows 11");

const wuEntries: GpoMapping[] = [
  wu("BranchReadinessLevel", "DWORD", "16", "Servicing channel", "16 = General Availability Channel. 32 = Long-Term Servicing Channel."),
  wu("DeferFeatureUpdatesPeriodInDays", "DWORD", "30", "Defer feature updates (days)", "0-365 day deferral."),
  wu("DeferQualityUpdatesPeriodInDays", "DWORD", "7", "Defer quality updates (days)", "0-30 day deferral."),
  wu("PauseFeatureUpdatesStartTime", "String", "", "Pause feature updates start time", "REG_SZ. ISO 8601 timestamp; pauses for 35 days from this time."),
  wu("ProductVersion", "String", "Windows 11", "Target product version", "REG_SZ. e.g. 'Windows 11' or 'Windows 10' for split fleets."),
  wu("TargetReleaseVersion", "DWORD", "1", "Enable target release version", "1 = pin to TargetReleaseVersionInfo (specific feature update)."),
  wu("TargetReleaseVersionInfo", "String", "23H2", "Pinned feature release", "REG_SZ. e.g. '23H2', '24H2'."),
  wu("DoNotConnectToWindowsUpdateInternetLocations", "DWORD", "1", "Do not connect to Windows Update internet locations", "1 = WSUS only, never fall back to Microsoft Update."),
  wu("DisableDualScan", "DWORD", "1", "Disable dual scan", "1 = WSUS-managed devices only scan WSUS, not WU."),
  wu("WUStatusServer", "String", "https://wsus.contoso.com:8531", "WSUS reporting server URL", "REG_SZ. Pair with WUServer."),
  wu("AcceptTrustedPublisherCerts", "DWORD", "1", "Accept trusted publisher certs", "1 = accept signed updates from trusted publishers."),
  wuau("NoAutoUpdate", "DWORD", "0", "Configure Automatic Updates", "0 = automatic updates enabled. 1 = disabled (NOT recommended)."),
  wuau("ScheduledInstallDay", "DWORD", "0", "Scheduled install day", "0 = every day, 1 = Sunday ... 7 = Saturday."),
  wuau("ScheduledInstallTime", "DWORD", "3", "Scheduled install time (hour)", "0-23 = hour of day to install."),
  wuau("UseWUServer", "DWORD", "1", "Use WSUS server", "1 = use intranet update service (WUServer/WUStatusServer)."),
  wuau("RebootRelaunchTimeoutEnabled", "DWORD", "1", "Reboot relaunch timeout enabled", "Pair with RebootRelaunchTimeout (minutes)."),
  wuau("AutoInstallMinorUpdates", "DWORD", "1", "Auto-install minor updates", "1 = silently install minor updates."),
  wuau("DetectionFrequencyEnabled", "DWORD", "1", "Detection frequency enabled", "Pair with DetectionFrequency (hours, 1-22)."),
  wuau("DetectionFrequency", "DWORD", "8", "Detection frequency (hours)", "How often the device polls for updates."),
];

// ---------------------------------------------------------------------------
// Office 365 / Microsoft 365 Apps
// ---------------------------------------------------------------------------
function officeApp(app: "word" | "excel" | "powerpoint" | "outlook" | "access" | "common") {
  return {
    category: "Office",
    prefix: `office-${app}`,
    pathHKCU: `HKCU:\\SOFTWARE\\Policies\\Microsoft\\office\\16.0\\${app}`,
    pathHKLM: `HKLM:\\SOFTWARE\\Policies\\Microsoft\\office\\16.0\\${app}`,
  };
}
function offUser(
  app: ReturnType<typeof officeApp>,
  sub: string,
  vn: string,
  vt: ValueType,
  ev: string,
  name: string,
  desc: string,
): GpoMapping {
  return entry(
    { category: app.category, prefix: app.prefix, path: sub ? `${app.pathHKCU}\\${sub}` : app.pathHKCU },
    vn,
    vt,
    ev,
    name,
    desc,
    "Microsoft 365 Apps / Office 2016+",
  );
}
function offMachine(
  app: ReturnType<typeof officeApp>,
  sub: string,
  vn: string,
  vt: ValueType,
  ev: string,
  name: string,
  desc: string,
): GpoMapping {
  return entry(
    { category: app.category, prefix: app.prefix, path: sub ? `${app.pathHKLM}\\${sub}` : app.pathHKLM },
    vn,
    vt,
    ev,
    name,
    desc,
    "Microsoft 365 Apps / Office 2016+",
  );
}

const word = officeApp("word");
const excel = officeApp("excel");
const powerpoint = officeApp("powerpoint");
const outlook = officeApp("outlook");
const access = officeApp("access");
const common = officeApp("common");

const officeEntries: GpoMapping[] = [
  // Word
  offUser(word, "security", "vbawarnings", "DWORD", "4", "Word: VBA macro notifications", "1=enable all, 2=disable with notification, 3=disable except signed, 4=disable all without notification."),
  offUser(word, "security", "blockcontentexecutionfrominternet", "DWORD", "1", "Word: Block macros from the Internet", "1 = block macros in files from internet zone."),
  offUser(word, "security\\fileblock", "openinprotectedview", "DWORD", "1", "Word: Open blocked files in Protected View", "1 = blocked file types open in PV instead of being denied."),
  offUser(word, "security\\protectedview", "disableinternetfilesinpv", "DWORD", "0", "Word: Internet zone files in Protected View", "0 = open in PV (default), 1 = bypass PV (NOT recommended)."),
  offUser(word, "security\\protectedview", "disableattachmentsinpv", "DWORD", "0", "Word: Outlook attachments in Protected View", "0 = open in PV (recommended)."),
  offUser(word, "security\\protectedview", "disableunsafelocationsinpv", "DWORD", "0", "Word: Unsafe locations in Protected View", "0 = open in PV (recommended)."),
  offUser(word, "options", "donotpromptforconvert", "DWORD", "1", "Word: Suppress legacy format conversion prompt", "1 = silently use Word XML format."),
  offUser(word, "options", "savezone", "DWORD", "0", "Word: Default save format zone", "0 = save in default Word format."),
  // Excel
  offUser(excel, "security", "vbawarnings", "DWORD", "4", "Excel: VBA macro notifications", "Same scale as Word: 1-4."),
  offUser(excel, "security", "blockcontentexecutionfrominternet", "DWORD", "1", "Excel: Block macros from the Internet", "1 = block macros in files from internet zone."),
  offUser(excel, "security", "extensionhardening", "DWORD", "2", "Excel: File extension hardening", "0 = none, 1 = warn, 2 = block (recommended)."),
  offUser(excel, "security", "datalinkwarnings", "DWORD", "0", "Excel: Suppress data link warnings", "0 = use default behavior. 1 = always prompt. 2 = never prompt."),
  offUser(excel, "security\\protectedview", "disableinternetfilesinpv", "DWORD", "0", "Excel: Internet zone files in Protected View", "0 = open in PV (recommended)."),
  // PowerPoint
  offUser(powerpoint, "security", "vbawarnings", "DWORD", "4", "PowerPoint: VBA macro notifications", "Same scale as Word: 1-4."),
  offUser(powerpoint, "security", "blockcontentexecutionfrominternet", "DWORD", "1", "PowerPoint: Block macros from the Internet", "1 = block macros in files from internet zone."),
  // Outlook
  offUser(outlook, "security", "level", "DWORD", "3", "Outlook: Programmatic security level", "0 = trust all, 1 = always warn, 3 = warn based on AV state (recommended)."),
  offUser(outlook, "security", "promptoomsend", "DWORD", "2", "Outlook: Prompt for programmatic send", "1 = always warn, 2 = warn based on AV."),
  offUser(outlook, "security", "promptoomaddressbookaccess", "DWORD", "2", "Outlook: Prompt for programmatic address book access", "Same scale as promptoomsend."),
  offUser(outlook, "security", "junkmailenablelinks", "DWORD", "0", "Outlook: Enable links in Junk Email folder", "0 = disable links (recommended)."),
  offUser(outlook, "security", "outlooksecuremode", "DWORD", "3", "Outlook: Security mode", "3 = use Group Policy security settings only."),
  offUser(outlook, "preferences", "showpastepasteoptions", "DWORD", "0", "Outlook: Hide paste options button", "0 = hide the inline paste options."),
  // Access
  offUser(access, "security", "vbawarnings", "DWORD", "4", "Access: VBA macro notifications", "Same scale as Word."),
  offUser(access, "security", "blockcontentexecutionfrominternet", "DWORD", "1", "Access: Block macros from the Internet", "1 = block macros in files from internet zone."),
  // Office Common
  offMachine(common, "clienttelemetry", "DisableTelemetry", "DWORD", "1", "Office: Disable telemetry agent", "1 = disable Office telemetry."),
  offMachine(common, "clienttelemetry", "SendTelemetry", "DWORD", "3", "Office: Send telemetry level", "1 = required, 2 = enhanced, 3 = none."),
  offUser(common, "general", "shownfirstrunoptin", "DWORD", "1", "Office: Suppress first-run opt-in screen", "1 = skip first-run opt-in dialog."),
  offUser(common, "internet", "useonlinecontent", "DWORD", "0", "Office: Online content settings", "0 = no internet content. 1 = users choose. 2 = use online content."),
  offUser(common, "privacy", "disconnectedstate", "DWORD", "2", "Office: Connected experiences (privacy)", "0 = enabled (default), 2 = disabled (most restrictive)."),
  offUser(common, "privacy", "controllerconnectedservicesenabled", "DWORD", "0", "Office: Allow connected experiences for analyzing content", "0 = disable; 1 = allow."),
  offUser(common, "privacy", "downloadcontentdisabled", "DWORD", "1", "Office: Allow downloading templates / clip art", "0 = allow (default), 1 = disable."),
  offMachine(common, "general", "EnableUpload", "DWORD", "0", "Office: Disable Customer Experience Improvement Program", "0 = do not participate in CEIP."),
];

// ---------------------------------------------------------------------------
// Privacy / Diagnostic Data
// ---------------------------------------------------------------------------
const PRIVACY_DC = {
  category: "Privacy",
  prefix: "priv-dc",
  path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection",
};
const privDc = (vn: string, vt: ValueType, ev: string, name: string, desc: string) =>
  entry(PRIVACY_DC, vn, vt, ev, name, desc, "Windows 10 / 11");

const privacyEntries: GpoMapping[] = [
  privDc("LimitEnhancedDiagnosticDataWindowsAnalytics", "DWORD", "1", "Limit enhanced diagnostic data to Desktop Analytics", "1 = only the data Desktop Analytics needs is collected."),
  privDc("AllowDeviceNameInTelemetry", "DWORD", "0", "Allow device name in diagnostic data", "0 = strip device name from telemetry. 1 = include."),
  privDc("DisableOneSettingsDownloads", "DWORD", "1", "Disable OneSettings downloads", "1 = block configuration downloads from OneSettings service."),
  privDc("DisableEnterpriseAuthProxy", "DWORD", "1", "Disable enterprise auth proxy for telemetry", "1 = telemetry does not use enterprise auth proxy."),
  privDc("MicrosoftEdgeDataOptIn", "DWORD", "0", "Edge browser history in diagnostic data", "0 = do not include Edge history in telemetry."),
  privDc("DisableTelemetryOptInChangeNotification", "DWORD", "1", "Hide telemetry opt-in change notifications", "1 = users do not see telemetry change UI."),
  privDc("DisableDiagnosticDataViewer", "DWORD", "1", "Disable Diagnostic Data Viewer", "1 = block in-built telemetry viewer (DDV)."),
  privDc("DisableDeviceDelete", "DWORD", "1", "Disable user delete telemetry data", "1 = users cannot trigger delete-my-data."),
  entry({ category: "Privacy", prefix: "priv-input", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Input\\Settings" }, "AllowLinguisticDataCollection", "DWORD", "0", "Allow inking and typing data collection", "0 = disable inking & typing personalization data sent to Microsoft.", "Windows 10 1809+"),
  entry({ category: "Privacy", prefix: "priv-app", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy" }, "LetAppsAccessLocation", "DWORD", "2", "Let apps access location", "0 = user controls, 1 = force allow, 2 = force deny.", "Windows 10/11"),
  entry({ category: "Privacy", prefix: "priv-app", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy" }, "LetAppsAccessCamera", "DWORD", "2", "Let apps access camera", "0 = user controls, 1 = force allow, 2 = force deny.", "Windows 10/11"),
  entry({ category: "Privacy", prefix: "priv-app", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy" }, "LetAppsAccessMicrophone", "DWORD", "2", "Let apps access microphone", "0 = user controls, 1 = force allow, 2 = force deny.", "Windows 10/11"),
  entry({ category: "Privacy", prefix: "priv-app", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy" }, "LetAppsAccessAccountInfo", "DWORD", "2", "Let apps access account info", "0 = user controls, 1 = force allow, 2 = force deny.", "Windows 10/11"),
  entry({ category: "Privacy", prefix: "priv-app", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy" }, "LetAppsAccessContacts", "DWORD", "2", "Let apps access contacts", "0 = user controls, 1 = force allow, 2 = force deny.", "Windows 10/11"),
  entry({ category: "Privacy", prefix: "priv-app", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy" }, "LetAppsActivateWithVoice", "DWORD", "2", "Let apps activate with voice", "0 = user controls, 1 = force allow, 2 = force deny.", "Windows 10/11"),
];

// ---------------------------------------------------------------------------
// Cloud Content / Consumer Experiences / Start Menu
// ---------------------------------------------------------------------------
const CC = {
  category: "Cloud Content",
  prefix: "cc",
  path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent",
};
const cc = (vn: string, vt: ValueType, ev: string, name: string, desc: string) =>
  entry(CC, vn, vt, ev, name, desc, "Windows 10 1607+");

const cloudEntries: GpoMapping[] = [
  cc("DisableSoftLanding", "DWORD", "1", "Disable Windows Spotlight on Action Center", "1 = no spotlight tips in Action Center."),
  cc("DisableThirdPartySuggestions", "DWORD", "1", "Disable third-party software suggestions", "1 = no Candy Crush etc. suggestions."),
  cc("DisableTailoredExperiencesWithDiagnosticData", "DWORD", "1", "Disable tailored experiences", "1 = stop using diagnostic data to personalise content."),
  cc("DisableWindowsConsumerFeatures", "DWORD", "1", "Turn off Microsoft consumer experiences", "1 = remove consumer-targeted Start menu suggestions and apps."),
  cc("DisableWindowsSpotlightFeatures", "DWORD", "1", "Disable Windows Spotlight features", "1 = block all Spotlight features (lock screen, suggestions)."),
  cc("DisableWindowsSpotlightOnSettings", "DWORD", "1", "Disable Windows Spotlight on Settings", "1 = no spotlight on Settings UI."),
  cc("DisableWindowsSpotlightWindowsWelcomeExperience", "DWORD", "1", "Disable Windows Welcome Experience", "1 = block 'Let's finish setting up your device' UI."),
  cc("ConfigureWindowsSpotlightOnLockScreen", "DWORD", "2", "Configure Windows Spotlight on lock screen", "0 = not configured, 1 = enabled, 2 = disabled."),
  entry({ category: "Cloud Content", prefix: "cc-explorer", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer" }, "HideRecommendedSection", "DWORD", "1", "Hide Start menu recommended section", "1 = hide 'Recommended' on Start (Windows 11).", "Windows 11 22H2+"),
  entry({ category: "Cloud Content", prefix: "cc-explorer", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer" }, "ShowOrHideMostUsedApps", "DWORD", "0", "Hide most-used apps on Start", "0 = hide; 1 = show."),
];

// ---------------------------------------------------------------------------
// Lock Screen / Personalisation
// ---------------------------------------------------------------------------
const LS = {
  category: "Lock Screen",
  prefix: "ls",
  path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization",
};
const ls = (vn: string, vt: ValueType, ev: string, name: string, desc: string) =>
  entry(LS, vn, vt, ev, name, desc, "Windows 10 / 11");

const lockScreenEntries: GpoMapping[] = [
  ls("NoLockScreenCamera", "DWORD", "1", "Disable lock screen camera", "1 = no camera access from lock screen."),
  ls("NoLockScreenSlideshow", "DWORD", "1", "Disable lock screen slideshow", "1 = disable Windows lock screen slideshow."),
  ls("LockScreenImage", "String", "C:\\ProgramData\\Contoso\\lockscreen.jpg", "Set lock screen image", "REG_SZ. UNC or local file path to default lock screen image."),
  ls("LockScreenOverlaysDisabled", "DWORD", "1", "Disable lock screen overlays", "1 = no Windows Spotlight / fun fact overlays on lock screen."),
  entry({ category: "Lock Screen", prefix: "ls-system", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System" }, "DontDisplayLastUserName", "DWORD", "1", "Hide last signed-in user on logon screen", "1 = require username + password (no last user shown).", "Windows 10/11"),
  entry({ category: "Lock Screen", prefix: "ls-system", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System" }, "DisableLockScreenAppNotifications", "DWORD", "1", "Disable app notifications on lock screen", "1 = block toast notifications on the lock screen.", "Windows 10/11"),
  entry({ category: "Lock Screen", prefix: "ls-system", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System" }, "DisableAcrylicBackgroundOnLogon", "DWORD", "1", "Disable acrylic blur on logon", "1 = solid color background on the logon screen (faster).", "Windows 10 1903+"),
  entry({ category: "Lock Screen", prefix: "ls-system", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System" }, "BlockUserFromShowingAccountDetailsOnSignin", "DWORD", "1", "Hide email on logon screen", "1 = block displaying email/upn on sign-in screen.", "Windows 10 1703+"),
];

// ---------------------------------------------------------------------------
// Windows Hello for Business / PIN Complexity
// ---------------------------------------------------------------------------
const WH = {
  category: "Windows Hello",
  prefix: "wh",
  path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\PassportForWork\\PINComplexity",
};
const wh = (vn: string, vt: ValueType, ev: string, name: string, desc: string) =>
  entry(WH, vn, vt, ev, name, desc, "Windows 10 1709+");

const helloEntries: GpoMapping[] = [
  wh("MaximumPINLength", "DWORD", "20", "Maximum PIN length", "Set 4-127. Default = 127 (no limit)."),
  wh("Digits", "DWORD", "1", "Require digits in PIN", "0 = forbid, 1 = allow, 2 = require."),
  wh("LowercaseLetters", "DWORD", "1", "Allow lowercase letters in PIN", "0 = forbid, 1 = allow, 2 = require."),
  wh("UppercaseLetters", "DWORD", "1", "Allow uppercase letters in PIN", "0 = forbid, 1 = allow, 2 = require."),
  wh("SpecialCharacters", "DWORD", "1", "Allow special characters in PIN", "0 = forbid, 1 = allow, 2 = require."),
  wh("Expiration", "DWORD", "0", "PIN expiration (days)", "0 = never expires. 1-730 = days."),
  wh("History", "DWORD", "5", "PIN history count", "Number of previous PINs to remember (0-50)."),
  entry({ category: "Windows Hello", prefix: "wh-pfw", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\PassportForWork" }, "Enabled", "DWORD", "1", "Use Windows Hello for Business", "1 = enable WHfB provisioning.", "Windows 10 1607+"),
  entry({ category: "Windows Hello", prefix: "wh-pfw", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\PassportForWork" }, "RequireSecurityDevice", "DWORD", "1", "Require TPM for Windows Hello", "1 = TPM required for Hello provisioning.", "Windows 10 1607+"),
  entry({ category: "Windows Hello", prefix: "wh-bio", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Biometrics" }, "Enabled", "DWORD", "1", "Allow biometrics", "0 = block all biometrics, 1 = allow.", "Windows 10/11"),
];

// ---------------------------------------------------------------------------
// BitLocker (additional beyond curated)
// ---------------------------------------------------------------------------
const BL = {
  category: "BitLocker",
  prefix: "bl",
  path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\FVE",
};
const bl = (vn: string, vt: ValueType, ev: string, name: string, desc: string) =>
  entry(BL, vn, vt, ev, name, desc, "Windows 10 / 11");

const bitlockerEntries: GpoMapping[] = [
  bl("EncryptionMethodWithXtsFdv", "DWORD", "7", "Fixed data drive encryption method", "7 = XTS-AES 256, 6 = XTS-AES 128 (default), 4 = AES 256, 3 = AES 128."),
  bl("EncryptionMethodWithXtsRdv", "DWORD", "4", "Removable data drive encryption method", "4 = AES 256 (recommended for removable). XTS not recommended for cross-version drives."),
  bl("FDVRequireActiveDirectoryBackup", "DWORD", "1", "Require AD backup of fixed-drive recovery", "1 = block enabling BitLocker until AD backup succeeds."),
  bl("FDVActiveDirectoryBackup", "DWORD", "1", "Backup fixed drive recovery info to AD/Entra", "1 = upload recovery key/package."),
  bl("FDVRecovery", "DWORD", "1", "Allow data recovery agent for fixed drives", "1 = allow."),
  bl("OSManageDRA", "DWORD", "1", "Allow data recovery agent for OS drive", "1 = allow."),
  bl("OSEncryptionType", "DWORD", "1", "OS drive encryption type", "1 = full (recommended), 2 = used space only (fast)."),
  bl("FDVHideRecoveryPage", "DWORD", "1", "Hide recovery page from non-admins", "1 = standard users cannot see recovery KEY UI."),
  bl("RDVDenyWriteAccess", "DWORD", "1", "Deny write to non-BitLocker removable drives", "1 = removable drives must be encrypted before they can be written to."),
  bl("RDVDisableBDE", "DWORD", "0", "Disable BitLocker on removable drives", "0 = allow BitLocker on removable. 1 = block."),
];

// ---------------------------------------------------------------------------
// Windows Firewall (Domain / Standard profile)
// ---------------------------------------------------------------------------
function fwProfile(profile: "DomainProfile" | "StandardProfile" | "PublicProfile") {
  return {
    category: "Firewall",
    prefix: `fw-${profile.toLowerCase().replace("profile", "")}`,
    path: `HKLM:\\SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\${profile}`,
  };
}
const fwDomain = fwProfile("DomainProfile");
const fwStd = fwProfile("StandardProfile");
const fwPub = fwProfile("PublicProfile");
const fw = (
  scope: ReturnType<typeof fwProfile>,
  vn: string,
  vt: ValueType,
  ev: string,
  name: string,
  desc: string,
) => entry(scope, vn, vt, ev, name, desc, "Windows 10 / 11");

const firewallEntries: GpoMapping[] = [
  fw(fwDomain, "EnableFirewall", "DWORD", "1", "Domain profile: Enable firewall", "1 = firewall on. 0 = off (NOT recommended)."),
  fw(fwDomain, "DefaultInboundAction", "DWORD", "1", "Domain profile: Default inbound action", "0 = allow, 1 = block (recommended)."),
  fw(fwDomain, "DefaultOutboundAction", "DWORD", "0", "Domain profile: Default outbound action", "0 = allow, 1 = block (rare; breaks updates if no rule)."),
  fw(fwDomain, "DisableNotifications", "DWORD", "1", "Domain profile: Hide notifications", "1 = silent."),
  fw(fwStd, "EnableFirewall", "DWORD", "1", "Private profile: Enable firewall", "1 = firewall on."),
  fw(fwStd, "DefaultInboundAction", "DWORD", "1", "Private profile: Default inbound action", "1 = block (recommended)."),
  fw(fwPub, "EnableFirewall", "DWORD", "1", "Public profile: Enable firewall", "1 = firewall on."),
  fw(fwPub, "DefaultInboundAction", "DWORD", "1", "Public profile: Default inbound action", "1 = block all unsolicited inbound (recommended)."),
  fw(fwPub, "AllowLocalPolicyMerge", "DWORD", "0", "Public profile: Block local rule merge", "0 = ignore local user firewall rules on public networks."),
  fw(fwPub, "AllowLocalIPsecPolicyMerge", "DWORD", "0", "Public profile: Block local IPsec rule merge", "0 = ignore local IPsec rules."),
];

// ---------------------------------------------------------------------------
// Remote Desktop / Terminal Services
// ---------------------------------------------------------------------------
const TS = {
  category: "Remote Desktop",
  prefix: "rd",
  path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services",
};
const rd = (vn: string, vt: ValueType, ev: string, name: string, desc: string) =>
  entry(TS, vn, vt, ev, name, desc, "Windows 10 / 11");

const rdpEntries: GpoMapping[] = [
  rd("fDenyTSConnections", "DWORD", "0", "Allow Remote Desktop connections", "0 = allow RDP. 1 = deny."),
  rd("UserAuthentication", "DWORD", "1", "Require Network Level Authentication", "1 = require NLA (recommended)."),
  rd("MinEncryptionLevel", "DWORD", "3", "Set client connection encryption level", "1 = low, 2 = client-compatible, 3 = high (FIPS-aligned), 4 = FIPS."),
  rd("SecurityLayer", "DWORD", "2", "RDP security layer", "0 = RDP, 1 = negotiate, 2 = SSL/TLS (recommended)."),
  rd("fEncryptRPCTraffic", "DWORD", "1", "Encrypt RPC traffic", "1 = require encrypted RPC for RDP."),
  rd("fDisableCdm", "DWORD", "1", "Disable drive redirection", "1 = block client drive mapping."),
  rd("fDisableCpm", "DWORD", "1", "Disable printer redirection", "1 = block client printer redirection."),
  rd("fDisableCcm", "DWORD", "1", "Disable COM port redirection", "1 = block COM redirection."),
  rd("fDisableLPT", "DWORD", "1", "Disable LPT port redirection", "1 = block LPT redirection."),
  rd("fDisableClip", "DWORD", "0", "Allow clipboard redirection", "0 = allow clipboard. 1 = block."),
  rd("MaxIdleTime", "DWORD", "1800000", "Idle session limit (ms)", "Disconnect idle RDP sessions after N milliseconds (0 = never). 1800000 = 30 min."),
  rd("MaxDisconnectionTime", "DWORD", "3600000", "Disconnected session timeout (ms)", "Log off disconnected sessions after N milliseconds. 3600000 = 1 hr."),
  rd("KeepAliveEnable", "DWORD", "1", "Enable RDP keep-alive", "1 = send keep-alive packets to detect disconnected sessions."),
  rd("AuthenticationLevel", "DWORD", "2", "Require server authentication for RDP client", "0 = always connect, 1 = warn, 2 = do not connect if auth fails."),
];

// ---------------------------------------------------------------------------
// Network / SMB / LSA
// ---------------------------------------------------------------------------
const networkEntries: GpoMapping[] = [
  entry({ category: "Network", prefix: "net-smb-srv", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" }, "SMB1", "DWORD", "0", "Disable SMBv1 server", "0 = SMBv1 server disabled (REQUIRED for security)."),
  entry({ category: "Network", prefix: "net-smb-cli", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mrxsmb10" }, "Start", "DWORD", "4", "Disable SMBv1 client", "4 = service disabled. Required to fully remove SMBv1."),
  entry({ category: "Network", prefix: "net-smb-srv", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" }, "RequireSecuritySignature", "DWORD", "1", "SMB server: require signing", "1 = require packet signing (recommended)."),
  entry({ category: "Network", prefix: "net-smb-cli", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" }, "RequireSecuritySignature", "DWORD", "1", "SMB client: require signing", "1 = require packet signing for outbound SMB."),
  entry({ category: "Network", prefix: "net-smb-cli", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" }, "EnableInsecureGuestLogons", "DWORD", "0", "Disable insecure guest logons (SMB)", "0 = block unauthenticated guest access to SMB shares."),
  entry({ category: "Security", prefix: "lsa", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa" }, "RestrictAnonymous", "DWORD", "1", "LSA: Restrict anonymous access", "1 = no SAM enumeration. 2 = no SAM/share enumeration."),
  entry({ category: "Security", prefix: "lsa", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa" }, "RestrictAnonymousSAM", "DWORD", "1", "LSA: Restrict anonymous SAM enumeration", "1 = no anonymous SAM account enumeration."),
  entry({ category: "Security", prefix: "lsa", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa" }, "EveryoneIncludesAnonymous", "DWORD", "0", "LSA: Everyone includes anonymous", "0 = anonymous excluded from Everyone group (recommended)."),
  entry({ category: "Security", prefix: "lsa", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa" }, "LmCompatibilityLevel", "DWORD", "5", "LAN Manager authentication level", "5 = NTLMv2 only, refuse LM & NTLM (recommended)."),
  entry({ category: "Security", prefix: "lsa", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\MSV1_0" }, "NTLMMinClientSec", "DWORD", "537395200", "NTLM minimum client security", "Decimal 537395200 = require NTLMv2 + 128-bit encryption."),
  entry({ category: "Security", prefix: "lsa", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\MSV1_0" }, "NTLMMinServerSec", "DWORD", "537395200", "NTLM minimum server security", "Decimal 537395200 = require NTLMv2 + 128-bit encryption."),
  entry({ category: "Network", prefix: "net-tcp", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" }, "DisableIPSourceRouting", "DWORD", "2", "Disable IP source routing", "2 = highest protection: source routed packets dropped."),
  entry({ category: "Network", prefix: "net-tcp", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" }, "EnableICMPRedirect", "DWORD", "0", "Disable ICMP redirect override", "0 = ignore ICMP redirects (recommended)."),
];

// ---------------------------------------------------------------------------
// AutoPlay / AutoRun
// ---------------------------------------------------------------------------
const autoplayEntries: GpoMapping[] = [
  entry({ category: "AutoPlay", prefix: "ap", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer" }, "NoAutoplayfornonVolume", "DWORD", "1", "Disable AutoPlay for non-volume devices", "1 = disable AutoPlay for MTP (cameras, phones)."),
  entry({ category: "AutoPlay", prefix: "ap", path: "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" }, "NoDriveTypeAutoRun", "DWORD", "255", "Disable AutoRun on all drives", "255 = disable on all drive types."),
  entry({ category: "AutoPlay", prefix: "ap", path: "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" }, "NoAutorun", "DWORD", "1", "Don't execute autorun.inf commands", "1 = ignore autorun.inf entirely."),
  entry({ category: "AutoPlay", prefix: "ap", path: "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" }, "NoAutoplayfornonVolume", "DWORD", "1", "Block AutoPlay on non-volume devices (MTP)", "1 = block."),
];

// ---------------------------------------------------------------------------
// Power Management
// ---------------------------------------------------------------------------
const PWR = {
  category: "Power",
  prefix: "pwr",
  path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings",
};
const powerEntries: GpoMapping[] = [
  entry(PWR, "ACSettingIndex", "DWORD", "0", "AC: Sleep timeout (seconds)", "0 = never. Otherwise seconds before sleep on AC."),
  entry(PWR, "DCSettingIndex", "DWORD", "1800", "DC: Sleep timeout (seconds)", "0 = never. 1800 = 30 minutes on battery."),
  entry({ category: "Power", prefix: "pwr-screen", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\7516b95f-f776-4464-8c53-06167f40cc99\\3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e" }, "ACSettingIndex", "DWORD", "900", "AC: Screen off timeout (seconds)", "900 = 15 minutes on AC.", "Windows 10 / 11"),
  entry({ category: "Power", prefix: "pwr-system", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\abfc2519-3608-4c2a-94ea-171b0ed546ab" }, "ACSettingIndex", "DWORD", "1", "Allow standby (S1-S3) when sleeping (AC)", "1 = allow standby states.", "Windows 10 / 11"),
];

// ---------------------------------------------------------------------------
// Internet Explorer (legacy but still present in many fleets)
// ---------------------------------------------------------------------------
const IE = {
  category: "Internet Explorer",
  prefix: "ie",
  path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Main",
};
const ie = (vn: string, vt: ValueType, ev: string, name: string, desc: string) =>
  entry(IE, vn, vt, ev, name, desc, "Windows 10 (legacy IE 11)");

const ieEntries: GpoMapping[] = [
  ie("DisableFirstRunCustomize", "DWORD", "1", "Skip IE first-run customization", "1 = bypass first-run setup wizard."),
  ie("Start Page", "String", "https://intranet.contoso.com", "Set IE home page", "REG_SZ default home page URL."),
  entry({ category: "Internet Explorer", prefix: "ie-sec", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Security" }, "DisableSecuritySettingsCheck", "DWORD", "1", "Disable IE security check warnings", "1 = suppress 'Security settings put your computer at risk' nag.", "Windows 10 (legacy IE 11)"),
  entry({ category: "Internet Explorer", prefix: "ie-zone-restricted", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Zones\\4" }, "1A00", "DWORD", "65536", "Restricted zone: disable user authentication", "65536 = anonymous logon. Hardens internet zone.", "Windows 10 (legacy IE 11)"),
];

// ---------------------------------------------------------------------------
// AppLocker / Windows Defender Application Control
// ---------------------------------------------------------------------------
const appLockerEntries: GpoMapping[] = [
  entry({ category: "AppLocker", prefix: "al-srv", path: "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\AppIDSvc" }, "Start", "DWORD", "2", "AppLocker: Application Identity service start type", "2 = automatic. AppLocker requires AppIDSvc running."),
  entry({ category: "AppLocker", prefix: "al-cfg", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\SrpV2\\Exe" }, "EnforcementMode", "DWORD", "1", "AppLocker EXE enforcement mode", "0 = audit only, 1 = enforce."),
  entry({ category: "AppLocker", prefix: "al-cfg", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\SrpV2\\Msi" }, "EnforcementMode", "DWORD", "1", "AppLocker MSI enforcement mode", "0 = audit only, 1 = enforce."),
  entry({ category: "AppLocker", prefix: "al-cfg", path: "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\SrpV2\\Script" }, "EnforcementMode", "DWORD", "1", "AppLocker Script enforcement mode", "0 = audit only, 1 = enforce."),
];

// ---------------------------------------------------------------------------
// LAPS (Local Administrator Password Solution / Windows LAPS)
// ---------------------------------------------------------------------------
const LAPS = {
  category: "LAPS",
  prefix: "laps",
  path: "HKLM:\\SOFTWARE\\Microsoft\\Policies\\LAPS",
};
const lapsEntries: GpoMapping[] = [
  entry(LAPS, "BackupDirectory", "DWORD", "1", "Backup password directory", "1 = backup to Active Directory, 2 = backup to Microsoft Entra (Azure AD)."),
  entry(LAPS, "PasswordAgeDays", "DWORD", "30", "Password age (days)", "How often (in days) to rotate the local admin password."),
  entry(LAPS, "PasswordComplexity", "DWORD", "4", "Password complexity", "1 = letters only, 2 = +numbers, 3 = +specials, 4 = upper+lower+number+special (recommended)."),
  entry(LAPS, "PasswordLength", "DWORD", "20", "Password length", "8-64 characters."),
  entry(LAPS, "PostAuthenticationActions", "DWORD", "5", "Post-authentication actions", "1 = reset password on next reset window, 3 = reset + logoff, 5 = reset + reboot."),
  entry(LAPS, "AdministratorAccountName", "String", "", "Local admin account name override", "REG_SZ. Leave blank to use default Administrator account (RID 500)."),
];

// ---------------------------------------------------------------------------
// Final exported list
// ---------------------------------------------------------------------------

export const importedGpoMappings: GpoMapping[] = [
  ...edgeEntries,
  ...chromeEntries,
  ...defenderEntries,
  ...smartScreenEntries,
  ...onedriveEntries,
  ...wuEntries,
  ...officeEntries,
  ...privacyEntries,
  ...cloudEntries,
  ...lockScreenEntries,
  ...helloEntries,
  ...bitlockerEntries,
  ...firewallEntries,
  ...rdpEntries,
  ...networkEntries,
  ...autoplayEntries,
  ...powerEntries,
  ...ieEntries,
  ...appLockerEntries,
  ...lapsEntries,
];
