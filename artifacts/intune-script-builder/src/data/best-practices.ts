export type BestPracticeImpact = "Low" | "Medium" | "High";

export const BEST_PRACTICE_CATEGORIES = [
  "Execution Context",
  "Environment & Paths",
  "Configuration",
  "Portability",
  "Idempotency & Exit Codes",
  "Logging & Troubleshooting",
  "Permissions & Secrets",
  "Performance & Scale",
] as const;

export type BestPracticeCategory = (typeof BEST_PRACTICE_CATEGORIES)[number];

export interface BestPracticeExample {
  code: string;
  language?: "powershell" | "text";
}

export interface BestPractice {
  id: string;
  title: string;
  category: BestPracticeCategory;
  impact: BestPracticeImpact;
  why: string;
  how: string;
  example?: BestPracticeExample;
}

export const bestPractices: BestPractice[] = [
  {
    id: "detect-running-user",
    title: "Detect who the script is actually running as",
    category: "Execution Context",
    impact: "High",
    why:
      "Most 'it works on my box' bugs come from assuming the script runs as the signed-in user when Intune actually launched it as SYSTEM. Knowing the running identity up front lets you branch correctly and produces a log line you'll thank yourself for later.",
    how:
      "At the top of every script, capture the current identity, whether it is SYSTEM, and whether it is elevated. Log it. Then key any user-profile work off that, never off assumptions.",
    example: {
      language: "powershell",
      code:
        '$id        = [Security.Principal.WindowsIdentity]::GetCurrent()\n$principal = [Security.Principal.WindowsPrincipal]$id\n$isSystem  = $id.User.Value -eq "S-1-5-18"\n$isAdmin   = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)\n\nWrite-Output "Running as: $($id.Name)  System=$isSystem  Admin=$isAdmin"',
    },
  },
  {
    id: "detect-bitness",
    title: "Detect 32-bit vs 64-bit host (and the OS)",
    category: "Execution Context",
    impact: "High",
    why:
      "PowerShell silently redirects HKLM:\\SOFTWARE and %WINDIR%\\System32 when the host process is 32-bit. If you don't know which bitness you're in, you can't reason about which path you actually wrote to.",
    how:
      "Check `[Environment]::Is64BitProcess` for your host and `[Environment]::Is64BitOperatingSystem` for the box. When you need to break out of a 32-bit host on a 64-bit OS, re-launch yourself via `\\Windows\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe` — note `Sysnative` is a virtual alias only visible to 32-bit processes, so the relaunch must be guarded by the bitness check below.",
    example: {
      language: "powershell",
      code:
        'if (-not [Environment]::Is64BitProcess -and [Environment]::Is64BitOperatingSystem) {\n  $sysnative = "$env:WINDIR\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe"\n  & $sysnative -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath @args\n  exit $LASTEXITCODE\n}',
    },
  },
  {
    id: "use-environment-variables",
    title: "Use environment variables instead of hard-coded paths",
    category: "Environment & Paths",
    impact: "High",
    why:
      "Hard-coded paths like `C:\\Users\\jsmith\\AppData\\...` break the moment the script lands on a device with a different username, a non-default profile location, or a non-C: system drive (think Autopilot reset machines or VDI templates).",
    how:
      "Lean on the env vars Windows guarantees: `$env:ProgramData`, `$env:ProgramFiles`, `$env:WINDIR`, `$env:TEMP`. For per-user folders use `[Environment]::GetFolderPath()` instead of `$env:USERPROFILE` directly — it stays correct under redirected profiles.",
    example: {
      language: "powershell",
      code:
        '# Machine-wide working data\n$dataDir = Join-Path $env:ProgramData "Contoso\\Intune"\n\n# Per-user (when running in user context)\n$appData = [Environment]::GetFolderPath("ApplicationData")\n$desktop = [Environment]::GetFolderPath("Desktop")\n\nNew-Item -ItemType Directory -Path $dataDir -Force | Out-Null',
    },
  },
  {
    id: "resolve-active-user",
    title: "Resolve the active user from a SYSTEM-context script",
    category: "Environment & Paths",
    impact: "High",
    why:
      "When you run as SYSTEM but need to touch the signed-in user's profile, hive, or OneDrive folder, you have to discover them — `$env:USERNAME` will say `SYSTEM` and `HKCU` will be the SYSTEM hive.",
    how:
      "Read the active user from `Win32_ComputerSystem.UserName` (or the explorer.exe owner), translate to a SID, then build paths against `HKEY_USERS\\<SID>` or the user's profile path from the registry's ProfileList.",
    example: {
      language: "powershell",
      code:
        '$user = (Get-CimInstance Win32_ComputerSystem).UserName\nif (-not $user) { Write-Output "No interactive user"; exit 0 }\n\n$sid = ([Security.Principal.NTAccount]$user).Translate(\n          [Security.Principal.SecurityIdentifier]).Value\n$profilePath = (Get-ItemProperty\n  "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$sid"\n).ProfileImagePath\n\nNew-PSDrive -PSProvider Registry -Name HKU -Root HKEY_USERS | Out-Null\n$userKey = "HKU:\\$sid\\Software\\Contoso"',
    },
  },
  {
    id: "external-config",
    title: "Read tunables from config, not from inline literals",
    category: "Configuration",
    impact: "Medium",
    why:
      "Tenant IDs, install paths, log levels, and feature flags scattered through a script become unmaintainable across environments. A small config layer means one script ships everywhere and the differences are data.",
    how:
      "Define defaults in the script, layer a JSON file under `$env:ProgramData\\Contoso\\config.json` on top, then let environment variables prefixed with `CONTOSO_*` override both. The result is one script, environment-specific behavior, no edits required to ship.",
    example: {
      language: "powershell",
      code:
        '$cfg = @{ LogLevel = "Info"; Endpoint = "https://api.contoso.com" }\n\n$jsonPath = "$env:ProgramData\\Contoso\\config.json"\nif (Test-Path $jsonPath) {\n  (Get-Content $jsonPath -Raw | ConvertFrom-Json).PSObject.Properties |\n    ForEach-Object { $cfg[$_.Name] = $_.Value }\n}\n\nforeach ($k in $cfg.Keys.Clone()) {\n  $envName = "CONTOSO_$($k.ToUpper())"\n  if (Test-Path "Env:$envName") { $cfg[$k] = (Get-Item "Env:$envName").Value }\n}',
    },
  },
  {
    id: "requires-directives",
    title: "Declare PowerShell version and required modules",
    category: "Portability",
    impact: "Medium",
    why:
      "A script that quietly relies on PowerShell 7 syntax or a module that isn't on every device will fail in the field with an unhelpful parse error. `#Requires` makes the contract explicit and fails fast on the wrong host.",
    how:
      "Put `#Requires` lines at the very top of the script (before any other code). Target Windows PowerShell 5.1 unless you have proof PowerShell 7 is installed, and list each module you import.",
    example: {
      language: "powershell",
      code:
        '#Requires -Version 5.1\n#Requires -RunAsAdministrator\n#Requires -Modules Microsoft.PowerShell.Management\n\nSet-StrictMode -Version Latest\n$ErrorActionPreference = "Stop"',
    },
  },
  {
    id: "ascii-output",
    title: "Keep output ASCII-safe and culture-independent",
    category: "Portability",
    impact: "Medium",
    why:
      "Smart quotes, em-dashes, and locale-formatted dates will round-trip through Intune's UTF-8 capture and break log parsers, comparisons, and CSV exports. Culture-formatted dates also fail equality checks across regions.",
    how:
      "Stick to ASCII in any string Intune surfaces back to you. Format dates with explicit, invariant patterns (`yyyy-MM-dd HH:mm:ss`) and parse with `[DateTime]::ParseExact(... [Globalization.CultureInfo]::InvariantCulture)`.",
    example: {
      language: "powershell",
      code:
        '$now = (Get-Date).ToString(\n  "yyyy-MM-dd HH:mm:ss",\n  [Globalization.CultureInfo]::InvariantCulture)\nWrite-Output "[$now] Remediation complete"',
    },
  },
  {
    id: "idempotent-design",
    title: "Make every script safe to run twice",
    category: "Idempotency & Exit Codes",
    impact: "High",
    why:
      "Intune will re-run detection on every cycle and remediation more often than you expect. Scripts that assume a clean slate will create duplicate scheduled tasks, append to files forever, or 'fix' something that's already fixed.",
    how:
      "Always probe for the desired state first and no-op if you're already there. Use `-Force` on `New-Item`, check `Get-ScheduledTask -ErrorAction SilentlyContinue` before registering, and prefer `Set-`/`New-` cmdlets over `Add-`.",
    example: {
      language: "powershell",
      code:
        '$path = "HKLM:\\SOFTWARE\\Contoso"\n$want = 1\n\n$current = (Get-ItemProperty -Path $path -Name Configured -ErrorAction SilentlyContinue).Configured\nif ($current -eq $want) { Write-Output "Already compliant"; exit 0 }\n\nif (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }\nNew-ItemProperty -Path $path -Name Configured -Value $want -PropertyType DWord -Force | Out-Null\nexit 0',
    },
  },
  {
    id: "exit-code-discipline",
    title: "Exit explicitly on every code path",
    category: "Idempotency & Exit Codes",
    impact: "High",
    why:
      "Intune Proactive Remediations are a binary contract: detection must `exit 0` (compliant) or `exit 1` (non-compliant). Falling off the end of the script, returning a value, or letting an exception propagate gives Intune the wrong signal.",
    how:
      "Wrap the body in `try/catch/finally`, set `$ErrorActionPreference = 'Stop'`, and end every branch — including the `catch` — with an explicit numeric `exit`. Never use `return` from the script root.",
    example: {
      language: "powershell",
      code:
        '$ErrorActionPreference = "Stop"\ntry {\n  if (Test-Compliance) { exit 0 } else { exit 1 }\n}\ncatch {\n  Write-Output "Detection error: $($_.Exception.Message)"\n  exit 1\n}',
    },
  },
  {
    id: "transcript-logging",
    title: "Write a transcript to a known, predictable location",
    category: "Logging & Troubleshooting",
    impact: "High",
    why:
      "Intune only retains a tiny slice of stdout. When a remediation behaves differently on 1% of the fleet, the only way to know why is a local log file you can collect via Intune diagnostics, RMM, or remote shell.",
    how:
      "Start a transcript to `$env:ProgramData\\<Vendor>\\Logs\\<script>-<yyyyMMdd>.log`, ensure the folder exists, wrap the body in `try/finally` so `Stop-Transcript` always runs, and rotate by date so logs don't grow forever.",
    example: {
      language: "powershell",
      code:
        '$logDir  = Join-Path $env:ProgramData "Contoso\\Logs"\nNew-Item -ItemType Directory -Path $logDir -Force | Out-Null\n$logFile = Join-Path $logDir ("remediation-{0:yyyyMMdd}.log" -f (Get-Date))\n\nStart-Transcript -Path $logFile -Append | Out-Null\ntry {\n  # ... work ...\n  exit 0\n}\nfinally { Stop-Transcript | Out-Null }',
    },
  },
  {
    id: "structured-log-lines",
    title: "Log structured, timestamped lines you can grep",
    category: "Logging & Troubleshooting",
    impact: "Medium",
    why:
      "When you're staring at 5,000 transcripts in a SIEM, free-form `Write-Host \"done\"` lines are useless. A consistent shape — timestamp, level, message — turns the same output into something you can filter and chart.",
    how:
      "Define a small `Write-Log` helper that prefixes every line with an ISO timestamp and a level (`INFO`, `WARN`, `ERROR`). Use `Write-Output` so Intune captures it, not `Write-Host`.",
    example: {
      language: "powershell",
      code:
        'function Write-Log {\n  param([string]$Level = "INFO", [Parameter(Mandatory)][string]$Message)\n  $ts = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")\n  Write-Output ("{0} [{1,-5}] {2}" -f $ts, $Level, $Message)\n}\n\nWrite-Log -Message "Starting compliance check"\nWrite-Log -Level WARN -Message "Registry value missing, will remediate"',
    },
  },
  {
    id: "test-as-system",
    title: "Test locally as SYSTEM before you deploy",
    category: "Logging & Troubleshooting",
    impact: "High",
    why:
      "A script that passes when you run it from your admin PowerShell window can still fail under SYSTEM because of profile, environment, or registry-view differences. Catching that locally beats finding out from a 'failed: 5,000 devices' dashboard.",
    how:
      "Use Sysinternals `PsExec64.exe -i -s -d powershell.exe` to open an interactive SYSTEM-context PowerShell on your test box, then run the script the same way Intune will. The IME logs at `C:\\ProgramData\\Microsoft\\IntuneManagementExtension\\Logs\\AgentExecutor.log` and `IntuneManagementExtension.log` are also gold for postmortem.",
    example: {
      language: "text",
      code:
        '# Open a SYSTEM-context interactive shell on your test machine:\nPsExec64.exe -i -s -d powershell.exe\n\n# Then in that shell:\nwhoami            # NT AUTHORITY\\SYSTEM\n.\\detection.ps1\n$LASTEXITCODE     # should be 0 or 1\n\n# Postmortem log locations on the device:\n#   C:\\ProgramData\\Microsoft\\IntuneManagementExtension\\Logs\\AgentExecutor.log\n#   C:\\ProgramData\\Microsoft\\IntuneManagementExtension\\Logs\\IntuneManagementExtension.log',
    },
  },
  {
    id: "no-embedded-secrets",
    title: "Never embed secrets in the script body",
    category: "Permissions & Secrets",
    impact: "High",
    why:
      "Anything you paste into the script is downloaded in clear text to every targeted device and is recoverable from disk and the IME logs. Tokens, app secrets, and connection strings should never live there.",
    how:
      "Authenticate with managed identity or a certificate-based service principal where possible. If you need an API key on the device, fetch it just-in-time from Key Vault or a tenant-scoped endpoint protected by Entra ID, and never log the value.",
    example: {
      language: "powershell",
      code:
        '# DON\'T:\n# $token = "eyJhbGciOi..."  # baked into the script — leaked forever\n\n# DO: fetch with a cert-bound app principal at runtime\n$cert = Get-ChildItem Cert:\\LocalMachine\\My |\n  Where-Object Thumbprint -eq $env:CONTOSO_APP_CERT_THUMBPRINT\nConnect-MgGraph -ClientId $env:CONTOSO_APP_ID -TenantId $env:CONTOSO_TENANT -Certificate $cert',
    },
  },
  {
    id: "least-privilege-check",
    title: "Fail fast when you don't have the rights you need",
    category: "Permissions & Secrets",
    impact: "Medium",
    why:
      "A script that needs admin but isn't elevated will half-do its job and exit 0, leaving devices in an inconsistent state. Intune will report success and you'll never know.",
    how:
      "Check elevation up front and exit non-zero with a clear message if you don't have it. Same idea for module availability, network reachability, and any other hard precondition.",
    example: {
      language: "powershell",
      code:
        '$id        = [Security.Principal.WindowsIdentity]::GetCurrent()\n$principal = [Security.Principal.WindowsPrincipal]$id\nif (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {\n  Write-Output "Not elevated; cannot continue"\n  exit 1\n}',
    },
  },
  {
    id: "prefer-cim-over-wmi",
    title: "Prefer CIM cmdlets over the deprecated WMI ones",
    category: "Performance & Scale",
    impact: "Low",
    why:
      "`Get-WmiObject` is deprecated, slower, and not present in PowerShell 7. `Get-CimInstance` is faster, supports `-Filter` server-side, and works on both 5.1 and 7.",
    how:
      "Use `Get-CimInstance` and push filtering into the `-Filter` parameter (WQL) so the work happens on the provider side, not in PowerShell. Reserve client-side `Where-Object` for the final shape.",
    example: {
      language: "powershell",
      code:
        '# Slower: drags every service back, then filters in-process\nGet-WmiObject Win32_Service | Where-Object { $_.State -eq "Running" }\n\n# Faster: filter server-side, return only what you need\nGet-CimInstance Win32_Service -Filter "State = \'Running\'"',
    },
  },
  {
    id: "scope-filesystem-walks",
    title: "Scope filesystem walks tightly",
    category: "Performance & Scale",
    impact: "Medium",
    why:
      "`Get-ChildItem -Recurse C:\\` on a busy device will spike disk and CPU, hit the Intune timeout, and possibly trip Defender's behavioural heuristics. It is almost never what you actually wanted.",
    how:
      "Always anchor the walk to a known subtree, set a sensible `-Depth`, use `-Filter` (provider-side) instead of `-Include` (client-side), and add `-ErrorAction SilentlyContinue` so a single locked file doesn't tank the whole scan.",
    example: {
      language: "powershell",
      code:
        '# DON\'T: full-disk recursion\n# Get-ChildItem -Path C:\\ -Recurse -Filter *.log\n\n# DO: bounded, filtered, fault-tolerant\nGet-ChildItem -Path "$env:ProgramData\\Contoso" `\n              -Filter *.log `\n              -Recurse -Depth 3 `\n              -ErrorAction SilentlyContinue',
    },
  },
];

export function getBestPracticeById(id: string): BestPractice | undefined {
  return bestPractices.find((p) => p.id === id);
}
