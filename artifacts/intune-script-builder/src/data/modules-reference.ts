// Curated reference catalog of PowerShell modules and cmdlets that come
// up over and over in Intune detection / remediation scripts. Hand-
// written, opinionated, and intentionally short — for a "what do I
// reach for?" quick read, not a replacement for Microsoft Learn.

export const REFERENCE_CATEGORIES = [
  "Inventory & Detection",
  "Registry",
  "Files & Paths",
  "Windows Update",
  "Microsoft Graph & Intune APIs",
  "Identity & Permissions",
  "Apps & Packaging",
  "Networking",
  "Logging & Notifications",
] as const;

export type ReferenceCategory = (typeof REFERENCE_CATEGORIES)[number];

export const REFERENCE_KINDS = [
  "Built-in cmdlet",
  "Built-in module",
  "Gallery module",
  ".NET API",
] as const;

export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export interface ReferenceExample {
  code: string;
  language?: "powershell" | "text";
}

export interface ReferenceEntry {
  id: string;
  name: string;
  kind: ReferenceKind;
  category: ReferenceCategory;
  // One-paragraph "what is this thing".
  summary: string;
  // When / why you'd reach for it specifically inside an Intune script.
  intuneNotes: string;
  // Pitfalls / footguns to mention in passing.
  gotchas: string[];
  example?: ReferenceExample;
  // Canonical Microsoft Learn or PowerShell Gallery URL.
  externalUrl: string;
}

export const referenceEntries: ReferenceEntry[] = [
  // ------------------------------------------------------------------
  // Inventory & Detection
  // ------------------------------------------------------------------
  {
    id: "get-ciminstance",
    name: "Get-CimInstance",
    kind: "Built-in cmdlet",
    category: "Inventory & Detection",
    summary:
      "The modern way to query the Windows management surface (CIM/WMI). Returns hardware, OS, BIOS, services, scheduled tasks, installed apps — almost any inventory fact you need for a detection script.",
    intuneNotes:
      "This should be your default for detection. It is fast, available on every supported Windows build, works in both Windows PowerShell 5.1 and PowerShell 7, and accepts a server-side -Filter so you only pull back the rows you care about.",
    gotchas: [
      "Use -Filter (WQL) instead of piping to Where-Object — filtering server-side is dramatically faster on big classes like Win32_Process or CIM_DataFile.",
      "The CIM session protocol talks to the local WMI service; if WMI is wedged on a device the cmdlet will hang. Wrap with -OperationTimeoutSec on slow fleets.",
      "WQL string comparisons are case-insensitive *for ASCII* but the Windows-1252 collation can surprise you on accented characters — keep filter literals plain ASCII when you can.",
    ],
    example: {
      language: "powershell",
      code:
        '# Server-side filter, returns only what you need\nGet-CimInstance Win32_Service -Filter "State = \'Running\' AND StartMode = \'Auto\'" |\n  Select-Object Name, DisplayName',
    },
    externalUrl:
      "https://learn.microsoft.com/powershell/module/cimcmdlets/get-ciminstance",
  },
  {
    id: "get-computerinfo",
    name: "Get-ComputerInfo",
    kind: "Built-in cmdlet",
    category: "Inventory & Detection",
    summary:
      "One-shot inventory cmdlet that returns 200+ properties about the device — OS build, BIOS, TPM, domain, time zone, secure boot state, last boot time, Windows edition, and more — in a single object.",
    intuneNotes:
      "Great for ad-hoc detections where you want one or two facts about the device without learning the underlying CIM class. For high-volume fleet checks, prefer Get-CimInstance against the specific class you need — Get-ComputerInfo gathers everything and is comparatively heavy.",
    gotchas: [
      "Property names differ from the underlying WMI classes (e.g. WindowsProductName, not Caption) — check the output once before relying on names.",
      "Can take 1–3 seconds even on a healthy machine. Don't call it in a loop.",
      "Windows-only cmdlet. Introduced in Windows PowerShell 5.1 (ships in-box on Windows 10 / Server 2016 and newer; older hosts need WMF 5.1) and still available in PowerShell 7 on Windows.",
    ],
    example: {
      language: "powershell",
      code:
        '$info = Get-ComputerInfo -Property OsName, OsBuildNumber, BiosFirmwareType, CsManufacturer, CsModel\n"OS  : $($info.OsName) build $($info.OsBuildNumber)"\n"BIOS: $($info.BiosFirmwareType)"\n"HW  : $($info.CsManufacturer) $($info.CsModel)"',
    },
    externalUrl:
      "https://learn.microsoft.com/powershell/module/microsoft.powershell.management/get-computerinfo",
  },
  {
    id: "get-wmiobject-legacy",
    name: "Get-WmiObject (legacy)",
    kind: "Built-in cmdlet",
    category: "Inventory & Detection",
    summary:
      "The original WMI cmdlet from Windows PowerShell 1.0. Still works on Windows PowerShell 5.1 but is slower than Get-CimInstance, uses a different (DCOM) protocol, and has been removed from PowerShell 7.",
    intuneNotes:
      "Listed here so you recognise it in older scripts and migrate them. New Intune scripts should use Get-CimInstance — both because PowerShell 7 will eventually be the IME default and because CIM is faster server-side.",
    gotchas: [
      "Not present in PowerShell 7 / pwsh.exe — calling it there throws CommandNotFoundException.",
      "Returns full PSObject wrappers around every property; CIM returns lighter typed objects, which adds up across thousands of devices.",
      "Migration is usually mechanical: Get-WmiObject Win32_Foo → Get-CimInstance Win32_Foo. Watch for `Get-WmiObject -Query` → `Get-CimInstance -Query`.",
    ],
    example: {
      language: "powershell",
      code:
        '# Old (avoid in new scripts):\nGet-WmiObject Win32_OperatingSystem | Select-Object Caption, BuildNumber\n\n# New equivalent:\nGet-CimInstance Win32_OperatingSystem | Select-Object Caption, BuildNumber',
    },
    externalUrl:
      "https://learn.microsoft.com/powershell/module/microsoft.powershell.management/get-wmiobject",
  },

  // ------------------------------------------------------------------
  // Registry
  // ------------------------------------------------------------------
  {
    id: "get-set-itemproperty",
    name: "Get-ItemProperty / Set-ItemProperty",
    kind: "Built-in cmdlet",
    category: "Registry",
    summary:
      "PowerShell's native way to read and write registry values, exposed through the HKLM:, HKCU:, and HKCR: PSDrives. Pairs with New-Item / Remove-Item to manage keys and Test-Path to probe existence.",
    intuneNotes:
      "Use these for almost every registry-based detection or remediation. They are clean, scriptable, and play nicely with -ErrorAction SilentlyContinue when a key may not exist yet.",
    gotchas: [
      "PSDrive paths use backslashes inside the path (HKLM:\\SOFTWARE\\Foo) — paste failures here are the #1 source of 'value not found' bugs.",
      "Set-ItemProperty does not create missing keys. Wrap with `if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }`.",
      "When the script runs in a 32-bit host on 64-bit Windows, HKLM:\\SOFTWARE silently redirects to ...\\WOW6432Node. Either enforce a 64-bit host or use the Microsoft.Win32.Registry .NET API (next entry) to pick the view explicitly.",
    ],
    example: {
      language: "powershell",
      code:
        '$key = "HKLM:\\SOFTWARE\\Contoso\\Compliance"\nif (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }\n\nSet-ItemProperty -Path $key -Name "Configured" -Value 1 -Type DWord\n$current = (Get-ItemProperty -Path $key -Name "Configured" -ErrorAction SilentlyContinue).Configured',
    },
    externalUrl:
      "https://learn.microsoft.com/powershell/module/microsoft.powershell.management/get-itemproperty",
  },
  {
    id: "win32-registry-api",
    name: "Microsoft.Win32.Registry (.NET API)",
    kind: ".NET API",
    category: "Registry",
    summary:
      "The underlying .NET registry classes (Registry, RegistryKey, RegistryHive, RegistryView). Lets you open a specific 32-bit or 64-bit view of the registry from any host, bypassing PSDrive redirection entirely.",
    intuneNotes:
      "Reach for this when you must read or write a 64-bit key from a 32-bit Intune script (e.g. some Win32 app detection scripts), or when you need to walk HKEY_USERS for the active interactive user from a SYSTEM-context script.",
    gotchas: [
      "You're responsible for disposing the RegistryKey objects — wrap in try/finally and call .Dispose() (or use a using-style helper).",
      "Path syntax uses backslashes and no PSDrive prefix (e.g. SOFTWARE\\Contoso, not HKLM:\\SOFTWARE\\Contoso).",
      "Returns $null on missing keys — check before chaining .GetValue().",
    ],
    example: {
      language: "powershell",
      code:
        '$baseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey(\n  [Microsoft.Win32.RegistryHive]::LocalMachine,\n  [Microsoft.Win32.RegistryView]::Registry64)\n\ntry {\n  $sub = $baseKey.OpenSubKey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion")\n  if ($sub) { $sub.GetValue("CurrentBuild") }\n}\nfinally { if ($baseKey) { $baseKey.Dispose() } }',
    },
    externalUrl:
      "https://learn.microsoft.com/dotnet/api/microsoft.win32.registry",
  },
  {
    id: "policyfileeditor",
    name: "PolicyFileEditor",
    kind: "Gallery module",
    category: "Registry",
    summary:
      "PowerShell module by Dave Wyatt that reads and writes the registry.pol file used by Local Group Policy — i.e. the place LGPO.exe writes. Lets you set Computer or User policies on a device with no DC required.",
    intuneNotes:
      "Useful when the setting you actually need lives under HKLM:\\SOFTWARE\\Policies\\... and you want it to behave like a real GPO (with the lock icon in the Settings UI), not a plain registry value an admin user could clear. Common alternative to bundling LGPO.exe in a Win32 app.",
    gotchas: [
      "Has to be installed on the device — use `Install-Module PolicyFileEditor -Scope AllUsers -Force` from a SYSTEM-context bootstrap, or vendor it into the package.",
      "You're editing the policy *file*, not the live registry — call `gpupdate /force` (or restart) to make the change apply.",
      "User-side policies need the user's NTUSER.DAT loaded; from a SYSTEM script you usually want the machine-side registry.pol.",
    ],
    example: {
      language: "powershell",
      code:
        'Import-Module PolicyFileEditor\n$pol = "$env:SystemRoot\\System32\\GroupPolicy\\Machine\\registry.pol"\n\nSet-PolicyFileEntry -Path $pol `\n  -Key  "SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent" `\n  -ValueName "DisableWindowsConsumerFeatures" `\n  -Data 1 -Type DWord\n\n& gpupdate /target:computer /force | Out-Null',
    },
    externalUrl:
      "https://www.powershellgallery.com/packages/PolicyFileEditor",
  },

  // ------------------------------------------------------------------
  // Files & Paths
  // ------------------------------------------------------------------
  {
    id: "test-resolve-path",
    name: "Test-Path / Resolve-Path",
    kind: "Built-in cmdlet",
    category: "Files & Paths",
    summary:
      "Test-Path returns $true/$false for whether a path exists; Resolve-Path expands wildcards and relative paths into the absolute, canonical form. Both work for filesystem paths, registry paths, and any other PSDrive.",
    intuneNotes:
      "Use Test-Path as the first line of any registry or file detection so a missing key/file becomes a clean exit 1, not an exception. Use Resolve-Path when accepting user-supplied paths to fail loudly on typos before you write anything.",
    gotchas: [
      "Test-Path on a registry value (`...\\Foo\\Bar`) returns true if the *key* exists, regardless of whether the value name is set. Use `Get-ItemProperty -Name ... -ErrorAction SilentlyContinue` to test a specific value.",
      "Resolve-Path throws if the path doesn't exist — pair with -ErrorAction SilentlyContinue or pre-check with Test-Path.",
      "Both honour the current PSDrive provider. `Test-Path HKLM:\\SOFTWARE\\Foo` works the same way as `Test-Path C:\\Temp\\foo.txt`.",
    ],
    example: {
      language: "powershell",
      code:
        '$marker = "$env:ProgramData\\Contoso\\installed.flag"\nif (-not (Test-Path $marker)) {\n  Write-Output "Not installed"\n  exit 1\n}\n\n$abs = Resolve-Path $marker\nWrite-Output "Found at $abs"\nexit 0',
    },
    externalUrl:
      "https://learn.microsoft.com/powershell/module/microsoft.powershell.management/test-path",
  },
  {
    id: "join-split-path",
    name: "Join-Path / Split-Path",
    kind: "Built-in cmdlet",
    category: "Files & Paths",
    summary:
      "Join-Path glues path components together with the right separator; Split-Path tears a path apart into its parent, leaf, drive, or qualifier. The boring, correct alternative to gluing strings with backslashes.",
    intuneNotes:
      "Use everywhere you build a path from variables — especially when one of the parts comes from an environment variable that may or may not have a trailing slash. Prevents the classic `C:\\ProgramData\\\\Contoso` and `C:Contoso` bugs.",
    gotchas: [
      "By default Join-Path does not check that the resulting path actually exists — pass `-Resolve` if you want it to fail loudly when the file/key isn't there yet.",
      "Use Split-Path -Parent / -Leaf rather than substring math; it works on UNC paths and registry paths too.",
      "On PowerShell 7 you can pass multiple child paths in one call: `Join-Path $env:ProgramData Contoso Logs file.log`.",
    ],
    example: {
      language: "powershell",
      code:
        '$logDir  = Join-Path $env:ProgramData "Contoso\\Logs"\n$logFile = Join-Path $logDir ("remediation-{0:yyyyMMdd}.log" -f (Get-Date))\n\nNew-Item -ItemType Directory -Path $logDir -Force | Out-Null\n$parent  = Split-Path -Parent $logFile   # ...\\Contoso\\Logs',
    },
    externalUrl:
      "https://learn.microsoft.com/powershell/module/microsoft.powershell.management/join-path",
  },

  // ------------------------------------------------------------------
  // Windows Update
  // ------------------------------------------------------------------
  {
    id: "pswindowsupdate",
    name: "PSWindowsUpdate",
    kind: "Gallery module",
    category: "Windows Update",
    summary:
      "Long-standing community module by Michał Gajda that wraps the Windows Update Agent COM API. Lists, downloads, installs, hides, and reboots for Windows updates from the command line.",
    intuneNotes:
      "Useful for one-off remediations like 'install this specific KB' or 'force a scan now'. For ongoing patch policy, prefer Windows Update for Business + Update Rings — running PSWindowsUpdate from Intune Proactive Remediations on every cycle will fight your update policy.",
    gotchas: [
      "Must be installed on the device. Either bake it into a Win32 package or run `Install-Module PSWindowsUpdate -Scope AllUsers -Force` from an elevated bootstrap.",
      "`Install-WindowsUpdate -AcceptAll -AutoReboot` will reboot the user's machine without warning. Use `-IgnoreReboot` and schedule the reboot through your normal channel.",
      "Some cmdlets can only run interactively as the active user, not as SYSTEM — read the help for each one before scheduling.",
    ],
    example: {
      language: "powershell",
      code:
        'Import-Module PSWindowsUpdate\n\n# What patches are pending?\nGet-WindowsUpdate -MicrosoftUpdate\n\n# Install a specific KB without rebooting\nInstall-WindowsUpdate -KBArticleID KB5034441 -AcceptAll -IgnoreReboot',
    },
    externalUrl:
      "https://www.powershellgallery.com/packages/PSWindowsUpdate",
  },

  // ------------------------------------------------------------------
  // Microsoft Graph & Intune APIs
  // ------------------------------------------------------------------
  {
    id: "microsoft-graph-authentication",
    name: "Microsoft.Graph.Authentication",
    kind: "Gallery module",
    category: "Microsoft Graph & Intune APIs",
    summary:
      "The Connect-MgGraph / Disconnect-MgGraph / Get-MgContext core of the Microsoft Graph PowerShell SDK. Every other Microsoft.Graph.* sub-module depends on it for token acquisition.",
    intuneNotes:
      "Use this module to authenticate from automation: cert-bound app registration for unattended jobs, device code for interactive admin tasks. Avoid embedding client secrets in scripts that ship to devices — prefer certificates or managed identity.",
    gotchas: [
      "Connect-MgGraph caches the token in-process — call Disconnect-MgGraph at the end of long-running runspaces, especially in Azure Automation.",
      "Required scopes change per cmdlet. Pass -Scopes explicitly so the consent prompt covers what you'll actually use.",
      "The v2 SDK split scope-bearing cmdlets across many sub-modules. You typically install Microsoft.Graph.Authentication + only the workload modules you need (e.g. Microsoft.Graph.DeviceManagement) — not the meta `Microsoft.Graph` module, which is huge.",
    ],
    example: {
      language: "powershell",
      code:
        'Import-Module Microsoft.Graph.Authentication\n\n# Cert-bound app principal for unattended scripts\nConnect-MgGraph `\n  -ClientId  $env:CONTOSO_APP_ID `\n  -TenantId  $env:CONTOSO_TENANT `\n  -CertificateThumbprint $env:CONTOSO_APP_CERT_THUMBPRINT\n\n(Get-MgContext).Scopes\nDisconnect-MgGraph',
    },
    externalUrl:
      "https://www.powershellgallery.com/packages/Microsoft.Graph.Authentication",
  },
  {
    id: "microsoft-graph-devicemanagement",
    name: "Microsoft.Graph.DeviceManagement",
    kind: "Gallery module",
    category: "Microsoft Graph & Intune APIs",
    summary:
      "The Intune-facing slice of the Microsoft Graph SDK. Lists managed devices, retrieves compliance and configuration policies, kicks off remote actions like sync / wipe / retire, and reads detected apps.",
    intuneNotes:
      "This is the supported, modern way to talk to Intune from PowerShell automation (Azure Automation, GitHub Actions, on-prem scheduled jobs). The older standalone `Microsoft.Graph.Intune` module is in maintenance — new automations should use this one.",
    gotchas: [
      "Pair with Microsoft.Graph.Authentication and request the `DeviceManagementManagedDevices.ReadWrite.All` (or .Read.All) scope explicitly.",
      "List endpoints page at 1,000 by default — use `-All` (or page manually) when enumerating a real tenant.",
      "Some Intune properties only exist on the beta endpoint. In Graph SDK v2, `Select-MgProfile` is gone — install the parallel `Microsoft.Graph.Beta.DeviceManagement` module and use its cmdlets instead.",
    ],
    example: {
      language: "powershell",
      code:
        'Connect-MgGraph -Scopes "DeviceManagementManagedDevices.Read.All"\nImport-Module Microsoft.Graph.DeviceManagement\n\n# All Windows devices that haven\'t synced in 30 days\n$cutoff = (Get-Date).AddDays(-30)\nGet-MgDeviceManagementManagedDevice -All `\n  -Filter "operatingSystem eq \'Windows\'" |\n  Where-Object { $_.LastSyncDateTime -lt $cutoff } |\n  Select-Object DeviceName, UserPrincipalName, LastSyncDateTime',
    },
    externalUrl:
      "https://www.powershellgallery.com/packages/Microsoft.Graph.DeviceManagement",
  },
  {
    id: "intunewin32app",
    name: "IntuneWin32App",
    kind: "Gallery module",
    category: "Microsoft Graph & Intune APIs",
    summary:
      "Community module by Nickolaj Andersen (MSEndpointMgr) that wraps the Win32 app side of Intune: build .intunewin packages, upload them, define detection rules, requirements, dependencies, and assignments — all from PowerShell.",
    intuneNotes:
      "The fastest way to script Win32 app deployment without clicking through the Intune portal. Pair with a Git-tracked source folder per app and you have a reproducible packaging pipeline.",
    gotchas: [
      "Wraps `IntuneWinAppUtil.exe` for the actual packaging — the module downloads it on first use; air-gapped environments need to vendor it manually.",
      "Detection-rule cmdlets (`New-IntuneWin32AppDetectionRule*`) are easy to misuse: a wrong key name silently produces an app that always reinstalls. Test detection before assigning broadly.",
      "Authenticates via Microsoft.Graph.Authentication — same scope and certificate considerations apply.",
    ],
    example: {
      language: "powershell",
      code:
        'Import-Module IntuneWin32App\nConnect-MSIntuneGraph -TenantID $env:CONTOSO_TENANT -ClientID $env:CONTOSO_APP_ID `\n  -ClientCert (Get-Item Cert:\\CurrentUser\\My\\$env:CONTOSO_APP_CERT_THUMBPRINT)\n\n$pkg = New-IntuneWin32AppPackage -SourceFolder ".\\source" `\n         -SetupFile "install.ps1" -OutputFolder ".\\out"\n\n$detect = New-IntuneWin32AppDetectionRuleRegistry -Existence `\n           -KeyPath "HKLM\\SOFTWARE\\Contoso\\App" -ValueName "Installed" `\n           -DetectionType "exists"',
    },
    externalUrl: "https://www.powershellgallery.com/packages/IntuneWin32App",
  },

  // ------------------------------------------------------------------
  // Identity & Permissions
  // ------------------------------------------------------------------
  {
    id: "localaccounts",
    name: "Get-LocalUser / Get-LocalGroupMember",
    kind: "Built-in module",
    category: "Identity & Permissions",
    summary:
      "Cmdlets from the built-in `Microsoft.PowerShell.LocalAccounts` module for managing local users and groups: enumerate, create, disable, reset password, add/remove from a group.",
    intuneNotes:
      "Use these for detections like 'is the local Administrator account disabled?' or remediations like 'add the Azure AD device admin group to the local Administrators group'. Available out of the box on Windows 10 / Server 2016 and later.",
    gotchas: [
      "Not present on Windows PowerShell 7+ on ARM/Server Core in some configurations — check with `Get-Module -ListAvailable Microsoft.PowerShell.LocalAccounts` before assuming.",
      "`-SID` takes a SecurityIdentifier object, not a wildcard string. To find an account by RID (e.g. the built-in Administrator at RID 500), enumerate and filter on `$_.SID.Value`.",
      "On Azure AD-joined devices, `Add-LocalGroupMember` accepts an AAD *user* as `'AzureAD\\<UPN>'`, but for AAD *groups* the friendly name does not resolve — pass the group SID (the `S-1-12-1-...` form derived from the objectId) instead.",
      "These cmdlets only manage *local* identities; for AAD/Entra users use the Microsoft.Graph SDK.",
    ],
    example: {
      language: "powershell",
      code:
        '# Built-in Administrator is always RID 500 under the machine SID\n$builtinAdmin = Get-LocalUser | Where-Object { $_.SID.Value -like "S-1-5-21-*-500" }\nif ($builtinAdmin -and $builtinAdmin.Enabled) {\n  Write-Output "Built-in Administrator is enabled — non-compliant"\n  exit 1\n}\n\nGet-LocalGroupMember -Group Administrators |\n  Select-Object Name, ObjectClass, PrincipalSource',
    },
    externalUrl:
      "https://learn.microsoft.com/powershell/module/microsoft.powershell.localaccounts/",
  },
  {
    id: "get-set-service",
    name: "Get-Service / Set-Service / Start-Service",
    kind: "Built-in cmdlet",
    category: "Identity & Permissions",
    summary:
      "The Windows service control surface from PowerShell: enumerate, query state, change start mode, start/stop/restart. Backed by the Service Control Manager — same as services.msc.",
    intuneNotes:
      "Bread-and-butter for compliance checks ('is BITS set to Manual?') and remediations ('disable Xbox Live Auth Manager on shared kiosks'). Always couple with explicit exit codes so a transient service failure doesn't pollute Intune reporting.",
    gotchas: [
      "Set-Service can change StartType but not the credentials the service runs under — use sc.exe config for that.",
      "Stopping a service with dependents fails unless you pass -Force; even then, re-check state instead of trusting the return.",
      "Some services (e.g. WinDefend) are protected — Set-Service will return Access Denied even from a SYSTEM-context script. Use the underlying Defender cmdlets instead.",
    ],
    example: {
      language: "powershell",
      code:
        '$svc = Get-Service -Name "BITS" -ErrorAction SilentlyContinue\nif (-not $svc) { exit 1 }\n\nif ($svc.StartType -ne "Manual") {\n  Set-Service -Name BITS -StartupType Manual\n}\nif ($svc.Status -ne "Running") {\n  Start-Service -Name BITS\n}',
    },
    externalUrl:
      "https://learn.microsoft.com/powershell/module/microsoft.powershell.management/get-service",
  },

  // ------------------------------------------------------------------
  // Apps & Packaging
  // ------------------------------------------------------------------
  {
    id: "appx-cmdlets",
    name: "Get-AppxPackage / Remove-AppxProvisionedPackage",
    kind: "Built-in cmdlet",
    category: "Apps & Packaging",
    summary:
      "The Appx module manages Microsoft Store / UWP apps. Get-AppxPackage lists what's installed for a user or all users; Remove-AppxPackage removes them; Remove-AppxProvisionedPackage prevents new users from getting them.",
    intuneNotes:
      "Classic 'remove the bloatware shipped on this OEM image' use case. For Intune, you almost always want both the per-user remove (for existing accounts) *and* the provisioned remove (so the next sign-in doesn't bring it back).",
    gotchas: [
      "Get-AppxPackage with no -AllUsers only sees the *current* user — running as SYSTEM gives you the SYSTEM profile, which is usually empty. Use `-AllUsers` from elevated contexts.",
      "Some inbox apps refuse to be uninstalled (Microsoft Edge, Microsoft Store on Windows 11) — DISM/AppxProvisioning cmdlets can fail silently.",
      "Removing Edge or Store via Appx can break Windows Update servicing; prefer the supported policy paths.",
    ],
    example: {
      language: "powershell",
      code:
        '$bloat = "Microsoft.XboxGamingOverlay"\n\n# Remove for every existing user\nGet-AppxPackage -AllUsers $bloat |\n  Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue\n\n# Stop new users from getting it\nGet-AppxProvisionedPackage -Online |\n  Where-Object DisplayName -eq $bloat |\n  Remove-AppxProvisionedPackage -Online | Out-Null',
    },
    externalUrl:
      "https://learn.microsoft.com/powershell/module/appx/",
  },

  // ------------------------------------------------------------------
  // Networking
  // ------------------------------------------------------------------
  {
    id: "invoke-webrequest-restmethod",
    name: "Invoke-WebRequest / Invoke-RestMethod",
    kind: "Built-in cmdlet",
    category: "Networking",
    summary:
      "Built-in HTTP clients. Invoke-WebRequest returns a full response object (headers, status, content); Invoke-RestMethod assumes a JSON or XML body and returns the parsed object directly.",
    intuneNotes:
      "Use for hitting internal APIs (config endpoints, status webhooks) and for downloading payloads in remediation scripts. For Microsoft Graph specifically, prefer Microsoft.Graph.* cmdlets — they handle auth, paging, and throttling for you.",
    gotchas: [
      "On Windows PowerShell 5.1, both cmdlets default to using the Internet Explorer engine for parsing — pass `-UseBasicParsing` (or just don't reference the parsed DOM) on Server Core / IE-disabled images.",
      "Throws a terminating error on non-2xx by default. Wrap in try/catch and inspect `$_.Exception.Response.StatusCode` to react to 404s or 429s.",
      "Defaults to TLS based on .NET version. If you target older endpoints, set `[Net.ServicePointManager]::SecurityProtocol = 'Tls12'` once at the top of the script.",
    ],
    example: {
      language: "powershell",
      code:
        'try {\n  $cfg = Invoke-RestMethod -Uri "https://config.contoso.local/intune/policy" `\n           -Headers @{ "X-Device-Id" = $env:COMPUTERNAME } -TimeoutSec 15\n  Write-Output "Policy version: $($cfg.version)"\n}\ncatch {\n  Write-Output "Config endpoint unreachable: $($_.Exception.Message)"\n  exit 1\n}',
    },
    externalUrl:
      "https://learn.microsoft.com/powershell/module/microsoft.powershell.utility/invoke-restmethod",
  },
  {
    id: "test-netconnection",
    name: "Test-NetConnection",
    kind: "Built-in cmdlet",
    category: "Networking",
    summary:
      "All-in-one connectivity probe: ICMP ping, TCP port test, traceroute, route lookup, and DNS resolution. Part of the built-in NetTCPIP module.",
    intuneNotes:
      "Great as a quick precondition check at the top of a remediation ('can I reach the package server before I try?'). Don't loop it across hundreds of hosts — it's slow per call.",
    gotchas: [
      "ICMP is blocked on a lot of corp networks; a failing ping does not mean the host is down. Use `-Port` to test the actual TCP port you care about.",
      "Default timeout is generous (multiple seconds). Pass `-InformationLevel Quiet -WarningAction SilentlyContinue` for fast boolean checks, or use `[Net.Sockets.TcpClient]` directly when you need true sub-second behavior.",
      "Returns a rich object even on failure — check `.TcpTestSucceeded` rather than relying on exit code.",
    ],
    example: {
      language: "powershell",
      code:
        '$ok = Test-NetConnection -ComputerName "package.contoso.local" -Port 443 `\n        -InformationLevel Quiet -WarningAction SilentlyContinue\nif (-not $ok) {\n  Write-Output "Package server unreachable; deferring"\n  exit 1\n}',
    },
    externalUrl:
      "https://learn.microsoft.com/powershell/module/nettcpip/test-netconnection",
  },

  // ------------------------------------------------------------------
  // Logging & Notifications
  // ------------------------------------------------------------------
  {
    id: "transcript-cmdlets",
    name: "Start-Transcript / Stop-Transcript",
    kind: "Built-in cmdlet",
    category: "Logging & Notifications",
    summary:
      "Captures everything written to the host (Write-Output, Write-Verbose with -Verbose, errors, exceptions) into a plain-text log file for the duration of the session.",
    intuneNotes:
      "The simplest, most reliable way to get diagnostic output off a device for an Intune script. Combine with a known per-script path under $env:ProgramData and the IME diagnostics collection picks it up automatically when you pull device logs.",
    gotchas: [
      "Always wrap the body in try/finally so Stop-Transcript runs even on a thrown exception — otherwise buffered output may not be flushed and the tail of the log goes missing.",
      "Append mode (`-Append`) avoids overwriting prior runs; rotate by date in the filename so the file stays a sane size.",
      "Transcripts capture the host writer, not native exe stdout. Pipe `& foo.exe 2>&1` if you want external command output in the log too.",
    ],
    example: {
      language: "powershell",
      code:
        '$logDir  = Join-Path $env:ProgramData "Contoso\\Logs"\nNew-Item -ItemType Directory -Path $logDir -Force | Out-Null\n$logFile = Join-Path $logDir ("remediation-{0:yyyyMMdd}.log" -f (Get-Date))\n\nStart-Transcript -Path $logFile -Append | Out-Null\ntry {\n  # ... script body ...\n  exit 0\n}\nfinally { Stop-Transcript | Out-Null }',
    },
    externalUrl:
      "https://learn.microsoft.com/powershell/module/microsoft.powershell.host/start-transcript",
  },
  {
    id: "burnttoast",
    name: "BurntToast",
    kind: "Gallery module",
    category: "Logging & Notifications",
    summary:
      "Community module by Joshua King for raising native Windows toast notifications from PowerShell — text, images, buttons, hero images, and custom protocols.",
    intuneNotes:
      "Useful for user-facing remediations where you need to tell the signed-in user something happened ('your VPN client was updated, please sign in again'). Must run in the *user's* session — a toast raised from SYSTEM context will not appear.",
    gotchas: [
      "Won't display from SYSTEM. The standard pattern is: a SYSTEM script schedules a per-user task that re-runs the toast in the user context.",
      "Toast banners are governed by Focus Assist / Notifications settings — your toast may be silently suppressed.",
      "The module registers an AppId with Windows. Use a stable -AppId so updates don't pile up duplicate sender entries in Settings → Notifications.",
    ],
    example: {
      language: "powershell",
      code:
        'Import-Module BurntToast\n\nNew-BurntToastNotification `\n  -AppId "Contoso.IT" `\n  -Text  "Compliance update", "Your device finished applying a security policy. No action needed." `\n  -Silent',
    },
    externalUrl: "https://www.powershellgallery.com/packages/BurntToast",
  },
  {
    id: "importexcel",
    name: "ImportExcel",
    kind: "Gallery module",
    category: "Logging & Notifications",
    summary:
      "Doug Finke's module for reading and writing real .xlsx files from PowerShell — no Excel install required. Backed by EPPlus.",
    intuneNotes:
      "Not for the device script itself, but invaluable when you build the *reporting* side of an Intune workflow: dumping a compliance report, an inventory snapshot, or a list of stragglers into a workbook your service desk will actually open.",
    gotchas: [
      "Underlying EPPlus changed licensing in 5.x — older Gallery versions ship the LGPL-licensed 4.x; the module wraps the difference but read the license note before using commercially.",
      "Column types are inferred from the first row of data. Force the format on the columns that matter via `-NumberFormat` on `Export-Excel` (or `Set-ExcelColumn -NumberFormat` after the fact) so Excel doesn't turn your serial numbers into dates.",
      "Output files can grow surprisingly large with 100k+ rows — prefer CSV when downstream consumers don't actually need formatting.",
    ],
    example: {
      language: "powershell",
      code:
        'Import-Module ImportExcel\n\nConnect-MgGraph -Scopes "DeviceManagementManagedDevices.Read.All"\nGet-MgDeviceManagementManagedDevice -All -Filter "operatingSystem eq \'Windows\'" |\n  Select-Object DeviceName, UserPrincipalName, ComplianceState, LastSyncDateTime |\n  Export-Excel -Path ".\\compliance-$(Get-Date -Format yyyyMMdd).xlsx" `\n               -AutoSize -FreezeTopRow -BoldTopRow -TableName "Devices"',
    },
    externalUrl: "https://www.powershellgallery.com/packages/ImportExcel",
  },
];

export function getReferenceEntryById(id: string): ReferenceEntry | undefined {
  return referenceEntries.find((e) => e.id === id);
}
