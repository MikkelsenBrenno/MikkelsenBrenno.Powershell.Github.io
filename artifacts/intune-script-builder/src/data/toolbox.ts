export const TOOLBOX_CATEGORIES = [
  "App Logs",
  "Launching Apps",
  "Process & Crash Inspection",
  "Event Log",
  "Microsoft Graph",
  "Secrets & Key Vault",
  "Notifications (Teams/Slack/Email)",
  "File Shares & Transfer",
  "Scheduled & Background Work",
] as const;

export type ToolboxCategory = (typeof TOOLBOX_CATEGORIES)[number];

export type ToolboxTheme = "Troubleshooting" | "Integration";

export interface ToolboxExample {
  code: string;
  language?: "powershell" | "text";
}

export type ToolboxSeeAlso =
  | { kind: "reference"; id: string; label?: string }
  | { kind: "best-practice"; id: string; label?: string }
  | { kind: "pitfall"; id: string; label?: string };

export interface ToolboxRecipe {
  id: string;
  title: string;
  category: ToolboxCategory;
  theme: ToolboxTheme;
  whenToUse: string;
  how: string;
  example: ToolboxExample;
  seeAlso?: ToolboxSeeAlso[];
  docsUrl?: string;
}

export const toolboxRecipes: ToolboxRecipe[] = [
  {
    id: "tail-app-log",
    title: "Tail an app's log file live while you reproduce a bug",
    category: "App Logs",
    theme: "Troubleshooting",
    whenToUse:
      "You're trying to reproduce a hang or error in a desktop app and want to watch its log roll past in real time without opening it in Notepad and refreshing.",
    how:
      "Use Get-Content with -Wait so the cmdlet keeps the handle open and streams new lines as the app writes them. Pre-create the file if the app only opens it on the first event so you don't get a 'path not found' error before the first write.",
    example: {
      language: "powershell",
      code:
        '$log = "$env:LOCALAPPDATA\\Contoso\\App\\app.log"\nif (-not (Test-Path -LiteralPath $log)) {\n  New-Item -ItemType File -Path $log -Force | Out-Null\n}\nGet-Content -LiteralPath $log -Tail 50 -Wait',
    },
    seeAlso: [{ kind: "best-practice", id: "transcript-everything", label: "Transcript every run" }],
    docsUrl:
      "https://learn.microsoft.com/powershell/module/microsoft.powershell.management/get-content",
  },
  {
    id: "launch-as-signed-in-user",
    title: "Launch an app as the signed-in user from a SYSTEM script",
    category: "Launching Apps",
    theme: "Troubleshooting",
    whenToUse:
      "Intune ran your script as SYSTEM but you actually need the app to start in the user's interactive session — for example to show a UI, hit HKCU, or read the user's profile.",
    how:
      "Find the active explorer.exe and read its owner SID, then schedule a one-shot task that runs as INTERACTIVE. Don't try to Start-Process the app directly from SYSTEM — it'll launch into session 0 and the user will never see it.",
    example: {
      language: "powershell",
      code:
        '$explorer = Get-CimInstance Win32_Process -Filter "Name=\'explorer.exe\'" |\n  Select-Object -First 1\nif (-not $explorer) { Write-Output "No interactive user signed in"; exit 0 }\n\n$owner = Invoke-CimMethod -InputObject $explorer -MethodName GetOwner\n$user  = "$($owner.Domain)\\$($owner.User)"\n\n$taskName = "ContosoLaunch_$([guid]::NewGuid().Guid.Substring(0,8))"\n$action   = "C:\\Program Files\\Contoso\\App.exe"\n\nschtasks.exe /Create /TN $taskName /TR "`"$action`"" /SC ONCE /ST 00:00 /RU $user /IT /F | Out-Null\nschtasks.exe /Run    /TN $taskName | Out-Null\nStart-Sleep -Seconds 5\nschtasks.exe /Delete /TN $taskName /F | Out-Null',
    },
    seeAlso: [
      { kind: "pitfall", id: "system-context-hkcu", label: "SYSTEM can't see HKCU" },
      { kind: "best-practice", id: "detect-running-user", label: "Detect who you're running as" },
    ],
  },
  {
    id: "find-installed-app",
    title: "Find an app's install path and version without guessing",
    category: "App Logs",
    theme: "Troubleshooting",
    whenToUse:
      "Before you troubleshoot you need to know whether the app is actually installed, where it landed, and what version is on disk. Don't trust `Program Files` — 32-bit installers go to `Program Files (x86)` and per-user installers go under `AppData`.",
    how:
      "Read the Uninstall keys from both the 64-bit and 32-bit registry views and filter by DisplayName. This is what the Intune detection-script docs recommend over Get-WmiObject Win32_Product (which is slow and triggers MSI repair).",
    example: {
      language: "powershell",
      code:
        '$paths = @(\n  "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",\n  "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",\n  "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"\n)\n\n$match = Get-ItemProperty -Path $paths -ErrorAction SilentlyContinue |\n  Where-Object { $_.DisplayName -like "Contoso App*" } |\n  Select-Object DisplayName, DisplayVersion, InstallLocation, UninstallString\n\nif (-not $match) { Write-Output "Not installed"; exit 1 }\n$match | Format-List',
    },
    seeAlso: [{ kind: "pitfall", id: "wmi-product-class", label: "Avoid Win32_Product" }],
  },
  {
    id: "capture-hung-process-dump",
    title: "Capture a memory dump of a hung process",
    category: "Process & Crash Inspection",
    theme: "Troubleshooting",
    whenToUse:
      "An app is unresponsive on a user's machine and you want a dump you can open in WinDbg or hand to the vendor — without asking the user to install anything they'll have to remove later.",
    how:
      "Stage procdump.exe from your distribution share, accept the EULA non-interactively with `-accepteula`, and write a full dump (`-ma`) named after the process and timestamp. Always validate that the PID still exists before invoking — a stale PID will silently produce nothing useful.",
    example: {
      language: "powershell",
      code:
        '$tool   = "C:\\ProgramData\\Contoso\\Tools\\procdump.exe"\n$outDir = "C:\\ProgramData\\Contoso\\Dumps"\nNew-Item -ItemType Directory -Path $outDir -Force | Out-Null\n\n$proc = Get-Process -Name "ContosoApp" -ErrorAction SilentlyContinue |\n  Select-Object -First 1\nif (-not $proc) { Write-Output "Process not running"; exit 0 }\n\n$stamp = Get-Date -Format "yyyyMMdd-HHmmss"\n$dump  = Join-Path $outDir "ContosoApp-$($proc.Id)-$stamp.dmp"\n\n& $tool -accepteula -ma $proc.Id $dump\nWrite-Output "Dump written: $dump"',
    },
  },
  {
    id: "read-app-event-log",
    title: "Read recent app errors from the Windows Event Log",
    category: "Event Log",
    theme: "Troubleshooting",
    whenToUse:
      "An app is failing silently for some users and you want to scoop the last hour of Application-log errors and warnings tied to its provider, without scrolling Event Viewer.",
    how:
      "Use Get-WinEvent with a FilterHashtable — it pushes the filter down into the event-log API, so it returns in milliseconds even on busy servers. Get-EventLog is the legacy alternative and is dramatically slower on large logs.",
    example: {
      language: "powershell",
      code:
        '$filter = @{\n  LogName      = "Application"\n  ProviderName = "Contoso App"\n  Level        = 1, 2  # 1=Critical, 2=Error\n  StartTime    = (Get-Date).AddHours(-1)\n}\n\nGet-WinEvent -FilterHashtable $filter -ErrorAction SilentlyContinue |\n  Select-Object TimeCreated, Id, LevelDisplayName, Message |\n  Format-Table -AutoSize -Wrap',
    },
    docsUrl:
      "https://learn.microsoft.com/powershell/module/microsoft.powershell.diagnostics/get-winevent",
  },
  {
    id: "service-health-check",
    title: "Verify a Windows service the app depends on is healthy",
    category: "Process & Crash Inspection",
    theme: "Troubleshooting",
    whenToUse:
      "The app is broken and you suspect a background service it relies on (print spooler, BITS, vendor agent) has crashed or been disabled by another remediation.",
    how:
      "Check current status with Get-Service, pull the configured start mode via Get-CimInstance Win32_Service (Get-Service hides this), and if it's stopped but should be Auto, restart it and wait for the controller to confirm Running.",
    example: {
      language: "powershell",
      code:
        '$name = "Spooler"\n$svc  = Get-Service -Name $name -ErrorAction Stop\n$cfg  = Get-CimInstance Win32_Service -Filter "Name=\'$name\'"\n\n"{0}: Status={1} StartMode={2}" -f $name, $svc.Status, $cfg.StartMode | Write-Output\n\nif ($svc.Status -ne "Running" -and $cfg.StartMode -in @("Auto", "Automatic")) {\n  Restart-Service -Name $name -Force\n  $svc.WaitForStatus("Running", "00:00:30")\n  Write-Output "Restarted: $($svc.Status)"\n}',
    },
  },
  {
    id: "connect-mggraph",
    title: "Call Microsoft Graph from a script",
    category: "Microsoft Graph",
    theme: "Integration",
    whenToUse:
      "You want a remediation or scheduled job to read or update something in Entra / Intune (sign-in logs, group membership, device tags) without standing up a separate web app.",
    how:
      "When the script runs on an Azure-hosted host (Automation runbook, Function, AKS, VM), prefer `Connect-MgGraph -Identity` so there's no secret to manage. Off-Azure (an Intune endpoint, a build agent), fall back to a registered app and `Connect-MgGraph -ClientSecretCredential`. Request the smallest set of application scopes the work needs and Disconnect-MgGraph in a finally so leftover sessions don't pile up.",
    example: {
      language: "powershell",
      code:
        '$tenantId = "<tenant-guid>"\n$clientId = "<app-id>"\n$secret   = ConvertTo-SecureString $env:GRAPH_CLIENT_SECRET -AsPlainText -Force\n$cred     = [pscredential]::new($clientId, $secret)\n\ntry {\n  Connect-MgGraph -TenantId $tenantId -ClientSecretCredential $cred -NoWelcome\n  Get-MgUser -Top 5 -Property Id, DisplayName, UserPrincipalName |\n    Format-Table\n}\nfinally {\n  Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null\n}',
    },
    seeAlso: [
      { kind: "reference", id: "microsoft-graph-authentication", label: "Microsoft.Graph.Authentication" },
    ],
    docsUrl:
      "https://learn.microsoft.com/powershell/microsoftgraph/authentication-commands",
  },
  {
    id: "keyvault-secret",
    title: "Pull a secret from Azure Key Vault at runtime",
    category: "Secrets & Key Vault",
    theme: "Integration",
    whenToUse:
      "Your script needs a webhook URL, API key, or service-account password and you don't want it baked into the .ps1 file (or sitting in source control).",
    how:
      "Prefer a managed identity when the script runs on an Azure-hosted host (Automation runbook, AKS pod, VM). Fall back to a service principal with a client secret only when running off-Azure (an Intune endpoint, a developer machine).",
    example: {
      language: "powershell",
      code:
        '$vault  = "contoso-prod-kv"\n$secret = "ContosoApp-WebhookUrl"\n\ntry {\n  Connect-AzAccount -Identity -ErrorAction Stop | Out-Null\n} catch {\n  $tenantId = "<tenant-guid>"\n  $appId    = "<app-id>"\n  $sp       = ConvertTo-SecureString $env:AZ_SP_SECRET -AsPlainText -Force\n  $cred     = [pscredential]::new($appId, $sp)\n  Connect-AzAccount -ServicePrincipal -TenantId $tenantId -Credential $cred | Out-Null\n}\n\n$value = (Get-AzKeyVaultSecret -VaultName $vault -Name $secret -AsPlainText)\nif (-not $value) { throw "Secret $secret not found in $vault" }',
    },
    docsUrl:
      "https://learn.microsoft.com/azure/key-vault/secrets/quick-create-powershell",
  },
  {
    id: "post-teams-webhook",
    title: "Post a status update to Teams or Slack via webhook",
    category: "Notifications (Teams/Slack/Email)",
    theme: "Integration",
    whenToUse:
      "You want remediation runs to announce themselves in a channel — success, failure, or 'I had to reboot a fleet machine' — without standing up an email relay.",
    how:
      "Webhooks are dumb HTTP — Invoke-RestMethod with a JSON body is enough. On Windows PowerShell 5.1, force TLS 1.2 first or the request will fail against modern endpoints. For Teams, the old Office 365 Connector / `MessageCard` webhooks have been retired — create a 'Post to a channel when a webhook request is received' Power Automate Workflow and post an Adaptive Card to the URL it gives you. Slack still uses the simple `{ text: ... }` shape.",
    example: {
      language: "powershell",
      code:
        'if ($PSVersionTable.PSVersion.Major -lt 6) {\n  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12\n}\n\n$webhook = $env:TEAMS_WORKFLOW_URL  # from the "Post to channel..." Power Automate workflow\n\n$card = @{\n  type        = "message"\n  attachments = @(@{\n    contentType = "application/vnd.microsoft.card.adaptive"\n    content = @{\n      type    = "AdaptiveCard"\n      "$schema" = "http://adaptivecards.io/schemas/adaptive-card.json"\n      version = "1.4"\n      body    = @(\n        @{ type = "TextBlock"; size = "Medium"; weight = "Bolder"\n           text = "Contoso remediation completed" }\n        @{ type = "TextBlock"; wrap = $true\n           text = "Host $env:COMPUTERNAME finished cleanup at $(Get-Date -Format o)." }\n      )\n    }\n  })\n} | ConvertTo-Json -Depth 8\n\nInvoke-RestMethod -Method Post -Uri $webhook -ContentType "application/json" -Body $card | Out-Null',
    },
    docsUrl:
      "https://learn.microsoft.com/microsoftteams/m365-custom-connectors",
  },
  {
    id: "smtp-without-send-mailmessage",
    title: "Send an SMTP alert without Send-MailMessage",
    category: "Notifications (Teams/Slack/Email)",
    theme: "Integration",
    whenToUse:
      "You need to email a report or alert from a script, but Send-MailMessage is officially deprecated and won't get fixes for new TLS or auth requirements.",
    how:
      "Use System.Net.Mail.SmtpClient (built in) for plain SMTP+STARTTLS, or MailKit (NuGet) for modern auth and OAuth. Always wrap the client in try/finally so you Dispose() it — leaked connections hold the auth session open.",
    example: {
      language: "powershell",
      code:
        '$smtpHost = "smtp.contoso.com"\n$port     = 587\n$user     = $env:SMTP_USER\n$pass     = $env:SMTP_PASS\n\n$msg = New-Object System.Net.Mail.MailMessage\n$msg.From = "alerts@contoso.com"\n$msg.To.Add("ops@contoso.com")\n$msg.Subject = "Remediation report - $env:COMPUTERNAME"\n$msg.Body    = "Run completed at $(Get-Date -Format o)."\n\n$client = New-Object System.Net.Mail.SmtpClient($smtpHost, $port)\n$client.EnableSsl   = $true\n$client.Credentials = New-Object System.Net.NetworkCredential($user, $pass)\n\ntry   { $client.Send($msg) }\nfinally {\n  $msg.Dispose()\n  $client.Dispose()\n}',
    },
    docsUrl:
      "https://learn.microsoft.com/powershell/module/microsoft.powershell.utility/send-mailmessage",
  },
  {
    id: "smb-share-with-credential",
    title: "Mount and copy from an SMB share with explicit credentials",
    category: "File Shares & Transfer",
    theme: "Integration",
    whenToUse:
      "You need to pull an installer or staging payload from a file share that the local SYSTEM account can't reach, without saving the credential to disk.",
    how:
      "Use New-PSDrive in the current PowerShell session only (`-Persist:$false` is the default — don't pass `-Persist`). Wrap the work in try/finally and Remove-PSDrive so the credential isn't left mapped if the script crashes.",
    example: {
      language: "powershell",
      code:
        '$share = "\\\\fileserver\\Software"\n$user  = "CONTOSO\\svc-installer"\n$pass  = ConvertTo-SecureString $env:SHARE_PW -AsPlainText -Force\n$cred  = [pscredential]::new($user, $pass)\n\ntry {\n  New-PSDrive -Name SW -PSProvider FileSystem -Root $share -Credential $cred -Scope Script | Out-Null\n  Copy-Item -Path "SW:\\ContosoApp\\setup.exe" -Destination "$env:TEMP\\setup.exe" -Force\n}\nfinally {\n  Remove-PSDrive -Name SW -ErrorAction SilentlyContinue\n}',
    },
  },
  {
    id: "register-scheduled-task",
    title: "Register and trigger a scheduled task from PowerShell",
    category: "Scheduled & Background Work",
    theme: "Integration",
    whenToUse:
      "You want background work to keep happening after the user signs out, retry on next logon, or run as SYSTEM on a fixed cadence — without taking a dependency on the Intune agent's schedule.",
    how:
      "Compose Action / Trigger / Principal / Settings objects, then Register-ScheduledTask. Register- is idempotent if you pass `-Force`. For an immediate one-off run, follow with Start-ScheduledTask; for cleanup-after-success, set the task to delete itself with -DeleteExpiredTaskAfter on a one-time trigger.",
    example: {
      language: "powershell",
      code:
        '$action    = New-ScheduledTaskAction -Execute "powershell.exe" `\n  -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\\ProgramData\\Contoso\\heartbeat.ps1"\n$trigger   = New-ScheduledTaskTrigger -Daily -At 3am\n$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest\n$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries\n\nRegister-ScheduledTask -TaskName "ContosoHeartbeat" `\n  -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null\n\nStart-ScheduledTask -TaskName "ContosoHeartbeat"',
    },
    docsUrl:
      "https://learn.microsoft.com/powershell/module/scheduledtasks/register-scheduledtask",
  },
];
