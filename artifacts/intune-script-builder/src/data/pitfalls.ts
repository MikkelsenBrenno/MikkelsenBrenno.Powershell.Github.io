import type { BuilderFormValues } from "@/lib/builder-schema";
import type { Condition } from "@/lib/conditions";

export type PitfallSeverity = "Low" | "Medium" | "High";

export const PITFALL_CATEGORIES = [
  "Context",
  "Architecture",
  "Logging",
  "Permissions",
  "Registry",
  "Scheduling",
  "Defender/Security",
] as const;

export type PitfallCategory = (typeof PITFALL_CATEGORIES)[number];

export interface PitfallExample {
  bad: string;
  good: string;
  language?: "powershell" | "text";
}

export interface Pitfall {
  id: string;
  title: string;
  category: PitfallCategory;
  severity: PitfallSeverity;
  problem: string;
  cause: string;
  fix: string;
  example?: PitfallExample;
}

export const pitfalls: Pitfall[] = [
  {
    id: "system-context-hkcu",
    title: "Writing to HKCU from a SYSTEM-context script",
    category: "Context",
    severity: "High",
    problem:
      "The script reports success but the user's registry hive is never touched, because SYSTEM's HKCU is the SYSTEM profile, not the signed-in user.",
    cause:
      "Intune Proactive Remediations run as SYSTEM by default. HKCU under SYSTEM resolves to HKEY_USERS\\S-1-5-18 (LocalSystem) — completely unrelated to the interactive user.",
    fix:
      "Either flip the assignment to run in the user context, or enumerate logged-in users and load their hives explicitly via HKEY_USERS\\<SID>. Prefer the user context unless you genuinely need machine-wide scope.",
    example: {
      language: "powershell",
      bad: 'Set-ItemProperty -Path "HKCU:\\Software\\Contoso" -Name "Configured" -Value 1',
      good:
        '# Run the assignment in the User context, OR resolve the active user SID:\n$user = (Get-CimInstance Win32_ComputerSystem).UserName\n$sid  = ([System.Security.Principal.NTAccount]$user).Translate(\n          [System.Security.Principal.SecurityIdentifier]).Value\nNew-PSDrive -PSProvider Registry -Name HKU -Root HKEY_USERS | Out-Null\nSet-ItemProperty -Path "HKU:\\$sid\\Software\\Contoso" -Name "Configured" -Value 1',
    },
  },
  {
    id: "wow6432node-redirection",
    title: "32-bit script silently redirected to Wow6432Node",
    category: "Architecture",
    severity: "High",
    problem:
      "You target HKLM:\\SOFTWARE\\Vendor\\Product but the value lands under HKLM:\\SOFTWARE\\Wow6432Node\\Vendor\\Product, so the 64-bit application never sees it.",
    cause:
      "When PowerShell runs in 32-bit, the registry view is silently redirected for any HKLM:\\SOFTWARE subkey. The path you typed and the path written are not the same.",
    fix:
      "Run the script in 64-bit context (set the 'Run script in 64-bit PowerShell' option), or open the 64-bit view explicitly via [Microsoft.Win32.RegistryKey]::OpenBaseKey() with Registry64.",
    example: {
      language: "powershell",
      bad: '# Running 32-bit; this lands under Wow6432Node\nNew-Item -Path "HKLM:\\SOFTWARE\\Contoso" -Force | Out-Null',
      good:
        '$base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(\n  [Microsoft.Win32.RegistryHive]::LocalMachine,\n  [Microsoft.Win32.RegistryView]::Registry64)\n$key = $base.CreateSubKey("SOFTWARE\\Contoso")\n$key.SetValue("Configured", 1, "DWord")',
    },
  },
  {
    id: "explicit-wow6432node-on-64bit",
    title: "Explicit Wow6432Node path used in 64-bit context",
    category: "Architecture",
    severity: "Medium",
    problem:
      "Hard-coding HKLM:\\SOFTWARE\\Wow6432Node\\... while running 64-bit reads/writes the literal Wow6432Node subtree, which is not where 64-bit apps look.",
    cause:
      "Wow6432Node is a redirection alias for 32-bit callers. Mixing it with a 64-bit caller bypasses the alias and edits a different physical location than you expected.",
    fix:
      "If you need to support both architectures, run the script in 32-bit so the OS handles redirection for you, and remove the literal 'Wow6432Node' segment from your path.",
    example: {
      language: "powershell",
      bad: '# 64-bit script writing literally under Wow6432Node\nSet-ItemProperty -Path "HKLM:\\SOFTWARE\\Wow6432Node\\Contoso" -Name "X" -Value 1',
      good:
        '# 32-bit script — the OS rewrites the path for you\nSet-ItemProperty -Path "HKLM:\\SOFTWARE\\Contoso" -Name "X" -Value 1',
    },
  },
  {
    id: "write-host-swallowed",
    title: "Write-Host output is swallowed by Intune",
    category: "Logging",
    severity: "Medium",
    problem:
      "Your remediation 'works on my machine' but the Intune portal shows no PreRemediationDetectionScriptOutput / PostRemediationDetectionScriptOutput.",
    cause:
      "Intune captures only what is written to the success stream. Write-Host writes to the host (information) stream and is dropped when there is no console attached.",
    fix:
      "Use Write-Output (or just `'message'` on its own line) for anything you want surfaced in Intune. Reserve Write-Host for interactive debugging.",
    example: {
      language: "powershell",
      bad: 'Write-Host "Remediation complete"',
      good: 'Write-Output "Remediation complete"',
    },
  },
  {
    id: "error-action-default",
    title: "Default $ErrorActionPreference hides failures",
    category: "Logging",
    severity: "High",
    problem:
      "A non-terminating cmdlet failure (missing key, denied access) prints a red line but the script keeps going and exits 0 — Intune marks the device compliant.",
    cause:
      "The default ErrorActionPreference is 'Continue'. Try/catch only handles terminating errors, so most cmdlet failures slip past unless you opt in.",
    fix:
      "Set $ErrorActionPreference = 'Stop' at the top of the script (or pass -ErrorAction Stop on each risky cmdlet) and wrap the work in try/catch with an explicit non-zero exit.",
    example: {
      language: "powershell",
      bad: 'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Missing" -Name "X" -Value 1\nexit 0',
      good:
        '$ErrorActionPreference = "Stop"\ntry {\n  Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Missing" -Name "X" -Value 1\n  exit 0\n} catch {\n  Write-Output "Failed: $_"\n  exit 1\n}',
    },
  },
  {
    id: "exit-code-trap",
    title: "Exit code other than 0 or 1",
    category: "Logging",
    severity: "High",
    problem:
      "Detection script returns 2, $false, or terminates without `exit`. Intune treats anything that isn't a clean `exit 0` as 'non-compliant' (or as a script error), and the wrong remediation runs.",
    cause:
      "Intune Proactive Remediations contract is binary: detection must exit 0 (compliant, no remediation) or exit 1 (non-compliant, run remediation). PowerShell's last-statement value is not used.",
    fix:
      "Always end every code path with an explicit `exit 0` or `exit 1`. Never use `return` or rely on the last expression.",
    example: {
      language: "powershell",
      bad: 'if ($value -eq 1) { return $true } else { return $false }',
      good: 'if ($value -eq 1) { exit 0 } else { exit 1 }',
    },
  },
  {
    id: "scheduled-task-race",
    title: "Scheduled task race condition during deployment",
    category: "Scheduling",
    severity: "Medium",
    problem:
      "Your remediation creates a scheduled task and immediately validates it, but the validation intermittently fails because the task scheduler hasn't registered the entry yet.",
    cause:
      "Register-ScheduledTask returns before the task scheduler service has finalized the registration. A subsequent Get-ScheduledTask in the same script may see a partial/missing entry.",
    fix:
      "Add a short retry loop with Start-Sleep, or use Get-ScheduledTask with -ErrorAction SilentlyContinue inside a polling loop until the task appears (with an upper bound).",
    example: {
      language: "powershell",
      bad: 'Register-ScheduledTask @params\nGet-ScheduledTask -TaskName "Foo"  # may fail',
      good:
        'Register-ScheduledTask @params\n$deadline = (Get-Date).AddSeconds(30)\ndo {\n  Start-Sleep -Milliseconds 500\n  $task = Get-ScheduledTask -TaskName "Foo" -ErrorAction SilentlyContinue\n} while (-not $task -and (Get-Date) -lt $deadline)',
    },
  },
  {
    id: "onedrive-token-paths",
    title: "OneDrive token-bound paths from SYSTEM",
    category: "Context",
    severity: "High",
    problem:
      "References to %OneDrive%, %OneDriveCommercial%, or per-user OneDrive folders return empty/invalid when expanded under SYSTEM, so files get dropped in C:\\Windows\\System32 or fail outright.",
    cause:
      "Those environment variables are defined by the OneDrive client at user logon and only exist in the user's session. SYSTEM has no concept of 'the signed-in user's OneDrive'.",
    fix:
      "Read the user's OneDrive path from HKU\\<SID>\\Software\\Microsoft\\OneDrive\\Accounts\\Business1\\UserFolder, or run the script in the user context where the variables are populated.",
    example: {
      language: "powershell",
      bad: 'Copy-Item .\\file.txt $env:OneDriveCommercial',
      good:
        '# In User context the env var is populated by the OneDrive client\n$dest = $env:OneDriveCommercial\nif (-not $dest) { Write-Output "OneDrive not configured for this user"; exit 1 }\nCopy-Item .\\file.txt $dest',
    },
  },
  {
    id: "defender-asr-blocks",
    title: "Defender ASR/AppLocker blocks the remediation",
    category: "Defender/Security",
    severity: "High",
    problem:
      "Script runs fine in lab but on production fleet it exits silently with no logs. Event Viewer shows ASR (Attack Surface Reduction) or AppLocker blocked the PowerShell action.",
    cause:
      "The ASR rule 'Block execution of potentially obfuscated scripts' targets Invoke-Expression, dynamic Add-Type, reflection, and large Base64 blobs that look like script-abuse patterns. A separate rule, 'Block process creations originating from PSExec and WMI commands', can also block remediation patterns that spawn child processes via PsExec or WMI from a PowerShell host.",
    fix:
      "Write straight, signed PowerShell — avoid Invoke-Expression, dynamic Add-Type, and Base64 IEX patterns. Sign the script, deploy via Intune as 64-bit, and add an ASR exclusion only as a last resort.",
    example: {
      language: "powershell",
      bad: 'Invoke-Expression ([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)))',
      good:
        '# Inline the actual logic — no IEX, no Base64 dynamic compile\nSet-ItemProperty -Path "HKLM:\\SOFTWARE\\Contoso" -Name "X" -Value 1',
    },
  },
  {
    id: "set-itemproperty-missing-key",
    title: "Set-ItemProperty fails when the key does not exist",
    category: "Registry",
    severity: "Medium",
    problem:
      "Set-ItemProperty throws 'Cannot find path ... because it does not exist' on the first deployment to a clean device, even though it works on devices where the key was created by a previous policy.",
    cause:
      "Set-ItemProperty creates the value but not the parent key. New-ItemProperty has the same limitation.",
    fix:
      "Probe for the parent path with Test-Path and create it via New-Item -Force before setting the value.",
    example: {
      language: "powershell",
      bad: 'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Contoso\\Sub" -Name "X" -Value 1',
      good:
        '$path = "HKLM:\\SOFTWARE\\Contoso\\Sub"\nif (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }\nSet-ItemProperty -Path $path -Name "X" -Value 1',
    },
  },
  {
    id: "no-transcript-logging",
    title: "No transcript means you cannot debug after the fact",
    category: "Logging",
    severity: "Medium",
    problem:
      "Detection passed twice and failed once across a 5,000-device fleet, but you have no idea why because the script captured nothing.",
    cause:
      "Intune retains only a small slice of detection output. Without explicit Start-Transcript or file logging, intermittent failures are invisible.",
    fix:
      "Wrap the script body in Start-Transcript / Stop-Transcript, write to C:\\ProgramData\\<Vendor>\\Logs\\<scriptname>-<date>.log, and rotate / cap size so logs don't grow unbounded.",
    example: {
      language: "powershell",
      bad: '# silent script body\nSet-ItemProperty -Path "HKLM:\\..." -Name "X" -Value 1\nexit 0',
      good:
        '$log = "C:\\ProgramData\\Contoso\\Logs\\remediation-$(Get-Date -f yyyyMMdd-HHmmss).log"\nNew-Item -ItemType Directory -Path (Split-Path $log) -Force | Out-Null\nStart-Transcript -Path $log -Force | Out-Null\ntry { Set-ItemProperty -Path "HKLM:\\..." -Name "X" -Value 1; exit 0 }\nfinally { Stop-Transcript | Out-Null }',
    },
  },
  {
    id: "type-mismatch-dword",
    title: "DWORD value provided as a string",
    category: "Registry",
    severity: "Medium",
    problem:
      "Setting a DWORD with a quoted string (e.g. \"00000001\") writes a String/REG_SZ instead, and group policy / the consuming app silently ignores the value.",
    cause:
      "PowerShell infers REG_SZ when the value is a string. -PropertyType DWord on New-ItemProperty is required, and Set-ItemProperty respects only the existing type — it won't convert.",
    fix:
      "Pass numeric literals (1, 0x0001) and prefer New-ItemProperty -PropertyType DWord -Force when creating the value to lock in the type.",
    example: {
      language: "powershell",
      bad: 'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Contoso" -Name "Flag" -Value "1"',
      good:
        'New-ItemProperty -Path "HKLM:\\SOFTWARE\\Contoso" -Name "Flag" -Value 1 -PropertyType DWord -Force | Out-Null',
    },
  },
  {
    id: "user-context-no-logon",
    title: "User-context script runs with no user signed in",
    category: "Context",
    severity: "Medium",
    problem:
      "User-context remediations don't fire when the device is at the login screen (ESP, kiosk reboot, Autopilot) and Intune marks them as 'Pending' indefinitely.",
    cause:
      "User-context Proactive Remediations require an interactive user session. They are skipped — not failed — when no user is signed in.",
    fix:
      "Pick the smallest scope that satisfies the requirement: machine-wide settings → SYSTEM context; per-user UI tweaks → user context with the explicit acknowledgement that they only fire post-logon.",
  },
  {
    id: "hardcoded-sid",
    title: "Hard-coded user SID",
    category: "Permissions",
    severity: "Medium",
    problem:
      "Script references HKEY_USERS\\S-1-5-21-... taken from a developer machine. On every other device, that SID does not exist and the script no-ops (or worse, edits the wrong profile).",
    cause:
      "User SIDs are unique per machine. They cannot be carried across devices.",
    fix:
      "Resolve the SID at runtime from the active user (CIM Win32_ComputerSystem.UserName + NTAccount.Translate) or iterate Get-ChildItem HKU:\\ filtering out built-in SIDs (S-1-5-18, S-1-5-19, S-1-5-20, _Classes).",
    example: {
      language: "powershell",
      bad: '$sid = "S-1-5-21-1234567890-1234567890-1234567890-1001"',
      good:
        '$user = (Get-CimInstance Win32_ComputerSystem).UserName  # DOMAIN\\user\n$sid = ([System.Security.Principal.NTAccount]$user).Translate([System.Security.Principal.SecurityIdentifier]).Value',
    },
  },
  {
    id: "intune-runtime-cap",
    title: "Script exceeds Intune's runtime cap",
    category: "Scheduling",
    severity: "High",
    problem:
      "A remediation that downloads, extracts, or rebuilds a large component never reports a result. The Intune service treats it as failed after the runtime cap.",
    cause:
      "Proactive Remediation scripts are killed if they exceed the Intune timeout (current published cap is 60 minutes). Anything still running is terminated and the device is marked failed.",
    fix:
      "Keep the script body short. Trigger the heavy work asynchronously (Start-Process, scheduled task with /Run, MSI with /qn /norestart) and exit immediately, then verify completion in a follow-up detection cycle.",
  },
  {
    id: "msi-no-wait",
    title: "Start-Process for MSI/EXE without -Wait swallows the exit code",
    category: "Permissions",
    severity: "Medium",
    problem:
      "Your installer 'works' but the script exits 0 before the install actually finishes, and downstream detection in the same cycle sees the 'before' state.",
    cause:
      "Start-Process returns immediately by default. You also need -PassThru to capture the process and inspect its exit code.",
    fix:
      "Use Start-Process -Wait -PassThru and check $proc.ExitCode against the installer's documented success codes (0 = success, 3010 = success/reboot for MSI).",
    example: {
      language: "powershell",
      bad: 'Start-Process msiexec.exe -ArgumentList "/i pkg.msi /qn"\nexit 0',
      good:
        '$proc = Start-Process msiexec.exe -ArgumentList "/i pkg.msi /qn /norestart" -Wait -PassThru\nif ($proc.ExitCode -in 0,3010) { exit 0 } else { Write-Output "msiexec exit $($proc.ExitCode)"; exit 1 }',
    },
  },
  {
    id: "no-rollback-for-destructive",
    title: "Destructive remediation with no rollback path",
    category: "Permissions",
    severity: "High",
    problem:
      "A folder cleanup or registry-removal script gets pushed fleet-wide. Recovering individual machines requires a tech to remote in to each device.",
    cause:
      "Proactive Remediations have no built-in undo. If you remove or overwrite without recording the prior state, you cannot revert from Intune.",
    fix:
      "Snapshot the prior state to a sibling .bak file or registry path before changing it, ship a rollback script alongside the remediation, and pilot to a small ring before broad deployment.",
  },
  {
    id: "ps-version-syntax",
    title: "PowerShell 5.1 vs 7 syntax assumptions",
    category: "Architecture",
    severity: "Low",
    problem:
      "Script uses PowerShell 7-only syntax — null-coalescing (`??`), ternary (`? :`), `ForEach-Object -Parallel`, `Get-Error` — and silently fails to parse on Windows 10 / 11 devices that only have Windows PowerShell 5.1.",
    cause:
      "Intune scripts execute under the OS-bundled Windows PowerShell 5.1 unless you have explicitly deployed PowerShell 7 and configured the assignment to use it.",
    fix:
      "Target 5.1 syntax for portability: replace `??` with `if ($x) { $x } else { $y }`, expand ternaries to full `if/else`, and use plain `ForEach-Object` without `-Parallel`. (Get-CimInstance itself is fine — it's been in 5.1 since Windows 8.1 / Server 2012 R2.)",
    example: {
      language: "powershell",
      bad: '$name = $env:USERNAME ?? "default"',
      good: '$name = if ($env:USERNAME) { $env:USERNAME } else { "default" }',
    },
  },
  {
    id: "registry-path-typos",
    title: "Backslash vs forward slash in registry paths",
    category: "Registry",
    severity: "Low",
    problem:
      "Script uses 'HKLM:/SOFTWARE/Contoso' or 'HKLM\\SOFTWARE\\Contoso' (no colon) and Test-Path always returns $false even though the key exists.",
    cause:
      "The PowerShell registry provider requires the drive-qualified syntax with backslash separators ('HKLM:\\...'). Other forms parse but resolve to non-existent paths.",
    fix:
      "Always write 'HKLM:\\Path' or 'HKCU:\\Path' (with colon, with backslashes), and validate with Test-Path before reading or writing.",
    example: {
      language: "powershell",
      bad: 'Test-Path "HKLM/SOFTWARE/Contoso"  # always $false',
      good: 'Test-Path "HKLM:\\SOFTWARE\\Contoso"',
    },
  },
];

export function getPitfallById(id: string): Pitfall | undefined {
  return pitfalls.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Match rules — given the current builder form values, return the pitfall ids
// that the configuration is at risk of triggering. Each rule is intentionally
// narrow so the builder does not light up false positives on every change.
// ---------------------------------------------------------------------------

const REGISTRY_PATH_RE_HKCU = /^HKCU:/i;
const REGISTRY_PATH_RE_HKLM_SOFTWARE_NO_WOW =
  /^HKLM:\\SOFTWARE\\(?!WOW6432Node)/i;
const REGISTRY_PATH_RE_WOW6432 = /WOW6432Node/i;
const ONEDRIVE_HINT_RE = /OneDrive/i;

function getRegistryConditions(conditions: Condition[]) {
  return conditions.filter((c): c is Extract<Condition, { kind: "registry" }> => c.kind === "registry");
}

export function matchPitfalls(values: BuilderFormValues): string[] {
  const matched = new Set<string>();
  const conditions = (values.conditions ?? []) as Condition[];
  const regs = getRegistryConditions(conditions);

  // SYSTEM context but a condition targets HKCU.
  if (
    values.runContext === "System" &&
    regs.some((r) => REGISTRY_PATH_RE_HKCU.test(r.registryPath))
  ) {
    matched.add("system-context-hkcu");
  }

  // 32-bit context with a HKLM:\SOFTWARE\... path that is NOT under Wow6432Node:
  // PowerShell will silently redirect into Wow6432Node.
  if (
    values.architecture === "32-bit" &&
    regs.some((r) => REGISTRY_PATH_RE_HKLM_SOFTWARE_NO_WOW.test(r.registryPath))
  ) {
    matched.add("wow6432node-redirection");
  }

  // 64-bit context but the path explicitly references Wow6432Node — usually a
  // copy-paste from a 32-bit example and almost never what the user wants.
  if (
    values.architecture === "64-bit" &&
    regs.some((r) => REGISTRY_PATH_RE_WOW6432.test(r.registryPath))
  ) {
    matched.add("explicit-wow6432node-on-64bit");
  }

  // DWORD/QWORD value with a non-numeric expectedValue (and a non-empty value).
  if (
    regs.some((r) => {
      if (r.valueType !== "DWORD" && r.valueType !== "QWORD") return false;
      if (!r.expectedValue) return false;
      // Accept decimal and 0x-prefixed hex.
      return !/^(0x[0-9a-fA-F]+|-?\d+)$/.test(r.expectedValue.trim());
    })
  ) {
    matched.add("type-mismatch-dword");
  }

  // OneDrive references in SYSTEM context (env vars / per-user paths fail).
  if (
    values.runContext === "System" &&
    (values.scenarioId === "onedrive-val" ||
      regs.some((r) => ONEDRIVE_HINT_RE.test(r.registryPath)))
  ) {
    matched.add("onedrive-token-paths");
  }

  // User context — always relevant gotcha to remind about (no-logon case).
  if (values.runContext === "User") {
    matched.add("user-context-no-logon");
  }

  // Basic logging with a remediation script (action=Set/Remove or rollback).
  const isRemediation =
    values.rollback ||
    regs.some((r) => r.action === "Set" || r.action === "Remove");
  if (isRemediation && values.loggingLevel === "Basic") {
    matched.add("no-transcript-logging");
  }

  // Set action without rollback for a destructive change (folder cleanup,
  // registry remove). Mostly catches "high blast radius" templates.
  const hasFolderRemove = conditions.some(
    (c) => c.kind === "file" && c.expected === "NotExists"
  );
  const hasRegistryRemove = regs.some((r) => r.action === "Remove");
  if ((hasFolderRemove || hasRegistryRemove) && !values.rollback) {
    matched.add("no-rollback-for-destructive");
  }

  return Array.from(matched);
}
