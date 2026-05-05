import type {
  Condition,
  Variable,
} from "./conditions";
import { findUnresolvedRefs, substituteVariables } from "./conditions";

// Apply variable substitution to a condition's string fields BEFORE they are
// fed into psQuote/PowerShell escaping. This is critical: if substitution
// happened after psQuote, a variable value containing ", `, or $ would break
// the surrounding string literal or alter PowerShell evaluation.
function substituteInCondition(c: Condition, vars: Variable[]): Condition {
  const s = (x: string) => substituteVariables(x, vars);
  switch (c.kind) {
    case "registry":
      return {
        ...c,
        registryPath: s(c.registryPath),
        registryValueName: s(c.registryValueName),
        expectedValue: s(c.expectedValue),
      };
    case "service":
      return { ...c, serviceName: s(c.serviceName) };
    case "file":
      return { ...c, filePath: s(c.filePath) };
    case "scheduledTask":
      return { ...c, taskName: s(c.taskName) };
  }
}

function withSubstitutedConditions(inputs: ScriptInputs): ScriptInputs {
  return {
    ...inputs,
    conditions: inputs.conditions.map((c) => substituteInCondition(c, inputs.variables)),
  };
}

// Safe fallback when the user has zero conditions defined. We emit a valid,
// self-explanatory PowerShell script rather than producing broken syntax like
// `$compliant = ()`. Detection exits 1 so Intune surfaces the misconfiguration.
function emptyConditionsScript(scriptName: string, kind: "Detection" | "Remediation" | "Rollback"): string {
  return `<#
.SYNOPSIS
${scriptName} - ${kind} Script (no conditions defined)
.DESCRIPTION
This script has no conditions configured. Open the Intune Script Builder
and add at least one condition (Registry, Service, File, or Scheduled Task)
before deploying.
#>

Write-Output "ERROR: No conditions defined. Edit the script in the builder and add at least one condition."
exit 1
`;
}

export interface ScriptInputs {
  scriptName: string;
  description: string;
  // Optional in spirit (empty string is fine). Surfaced in the script
  // header as a labelled line; omitted entirely when blank.
  purpose: string;
  // Echoed in the script header so a reviewer can see who owns this
  // change without leaving the .ps1 file.
  publisher: string;
  conditions: Condition[];
  combinator: "AND" | "OR";
  rollback: boolean;
  inverseMode: boolean;
  variables: Variable[];
  loggingLevel: string;
  logPath: string;
  runContext: "System" | "User";
  architecture: "64-bit" | "32-bit";
  dryRunMode: boolean;
  pilotGroup: boolean;
}

// Build the labelled "Description / Purpose / Publisher" lines that
// open the .DESCRIPTION block. Each line is omitted entirely when the
// corresponding field is blank so the generated script never carries a
// stray "Purpose:" with nothing after it.
function buildDetailsHeader(inputs: ScriptInputs): string {
  const lines: string[] = [];
  if (inputs.description && inputs.description.trim()) {
    lines.push(`Description: ${inputs.description}`);
  }
  if (inputs.purpose && inputs.purpose.trim()) {
    lines.push(`Purpose: ${inputs.purpose}`);
  }
  if (inputs.publisher && inputs.publisher.trim()) {
    lines.push(`Publisher: ${inputs.publisher}`);
  }
  return lines.join("\n");
}

// Number of trailing log lines to surface in the Intune script output column
// after Stop-Transcript. Kept short so the output stays readable in the portal
// but long enough to capture the meaningful failure context.
const LOG_TAIL_LINES = 10;

function escapePsString(s: string): string {
  return s.replace(/`/g, "``").replace(/"/g, '`"').replace(/\$/g, "`$");
}

function psQuote(s: string): string {
  return `"${escapePsString(s)}"`;
}

// Escape a string for embedding in a PowerShell *expandable* (double-quoted)
// string literal while preserving `$` so admins can use environment-variable
// expressions like `$env:ProgramData\Logs` directly. Only backticks and double
// quotes are escaped.
function escapePsExpandableString(s: string): string {
  return s.replace(/`/g, "``").replace(/"/g, '`"');
}

function buildHeaderSummary(inputs: ScriptInputs, kind: "Detection" | "Remediation" | "Rollback"): string {
  const conditionLines = inputs.conditions
    .map((c, i) => {
      switch (c.kind) {
        case "registry":
          return `  Check ${i + 1} (Registry, action=${c.action}): ${c.registryPath} \\ ${c.registryValueName} ${c.detectionOperator} '${c.expectedValue}' (${c.valueType})`;
        case "service":
          return `  Check ${i + 1} (Service): '${c.serviceName}' expect ${c.expectedStatus}`;
        case "file":
          return `  Check ${i + 1} (File/Folder): '${c.filePath}' expect ${c.expected}`;
        case "scheduledTask":
          return `  Check ${i + 1} (Scheduled Task): '${c.taskName}' expect ${c.expected}`;
      }
    })
    .join("\n");

  const combinator = inputs.conditions.length > 1
    ? `Combinator: ${inputs.combinator} across all ${inputs.conditions.length} checks.\n`
    : "";

  const inverse = inputs.inverseMode
    ? `\nINVERSE / UNINSTALL MODE IS ENABLED:\n  The conditions describe an UNWANTED state. Detection marks the device\n  non-compliant when the unwanted state is present. ${kind === "Remediation"
      ? "Remediation removes\n  or reverses the unwanted state."
      : kind === "Rollback"
        ? "Rollback re-applies the\n  original (pre-uninstall) state."
        : ""}\n`
    : "";

  return `Conditions:\n${conditionLines}\n${combinator}${inverse}`;
}

function buildVariablesHeader(inputs: ScriptInputs): string {
  if (!inputs.variables.length) return "";
  const lines = inputs.variables
    .filter((v) => v.name)
    .map((v) => `  ${v.name} = ${v.value}`)
    .join("\n");
  return `\nVariables (resolved at generation time):\n${lines}\n`;
}

// Build the logging preamble that actually changes runtime behavior of the
// generated script based on the user's selected loggingLevel.
//   Basic      - default PowerShell verbosity (no preamble emitted)
//   Detailed   - $VerbosePreference = 'Continue' so any Write-Verbose call
//                surfaces in the Intune output column
//   Transcript - additionally Start-Transcript to a per-script log file under
//                the admin-configured log directory (defaults to
//                $env:ProgramData\IntuneScripts) so admins can retrieve full
//                output post-run
function buildLoggingPreamble(inputs: ScriptInputs, kind: "Detection" | "Remediation" | "Rollback"): string {
  const level = inputs.loggingLevel;
  if (level === "Detailed") {
    return `# Logging level: Detailed (Verbose stream surfaced)\n$VerbosePreference = 'Continue'\n\n`;
  }
  if (level === "Transcript") {
    const safeName = (inputs.scriptName || "IntuneScript").replace(/[^a-zA-Z0-9_-]+/g, "_");
    // Embed the user-supplied path inside a double-quoted PowerShell string so
    // expressions like `$env:ProgramData\IntuneScripts` are expanded at run
    // time. Backticks/quotes are escaped; `$` is preserved on purpose.
    const dirLiteral = `"${escapePsExpandableString(inputs.logPath)}"`;
    return `# Logging level: Transcript (full output captured to disk)
$VerbosePreference = 'Continue'
$LogDir = ${dirLiteral}
if (-not (Test-Path $LogDir)) { New-Item -Path $LogDir -ItemType Directory -Force | Out-Null }
$LogPath = Join-Path $LogDir ('${safeName}-${kind}-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
try { Start-Transcript -Path $LogPath -Append -ErrorAction SilentlyContinue | Out-Null } catch {}

`;
  }
  // Basic: no runtime change.
  return "";
}

// When transcript logging is enabled, emit a postamble that stops the
// transcript and surfaces the trailing N lines of the log file via
// Write-Output so the most recent log content appears in the Intune portal's
// script output column. No-op for Basic / Detailed levels.
function buildLoggingPostamble(inputs: ScriptInputs): string {
  if (inputs.loggingLevel !== "Transcript") return "";
  return `
# Stop transcript and surface the last ${LOG_TAIL_LINES} log lines via Write-Output so
# they appear in the Intune script output column for quick triage.
try { Stop-Transcript -ErrorAction SilentlyContinue | Out-Null } catch {}
if ($LogPath -and (Test-Path -LiteralPath $LogPath)) {
    Write-Output ""
    Write-Output "--- Last log entries ($LogPath) ---"
    try {
        Get-Content -LiteralPath $LogPath -Tail ${LOG_TAIL_LINES} -ErrorAction Stop |
            ForEach-Object { Write-Output $_ }
    }
    catch {
        Write-Output "(Could not read tail of log file: $($_.Exception.Message))"
    }
}
`;
}

function buildUnresolvedWarning(finalText: string): string {
  const refs = findUnresolvedRefs(finalText, []);
  if (!refs.length) return "";
  return `\nWARNING: Unresolved variable references in this script:\n${refs.map((r) => `  {{${r}}}`).join("\n")}\nDefine these in the Variables panel before deploying.\n`;
}

// Per-condition detection: assigns $condN (true if its desired state is observed).
// Always evaluates "did the desired state hold". The aggregate handles inverse.
function buildConditionCheckBlock(c: Condition, idx: number): string {
  const label = `[Check ${idx + 1}]`;
  const v = `cond${idx + 1}`;

  switch (c.kind) {
    case "registry": {
      const path = psQuote(c.registryPath);
      const name = psQuote(c.registryValueName);
      const exp = psQuote(c.expectedValue);
      const op = c.detectionOperator;
      if (c.action === "Remove") {
        // Compliant if value/path is absent
        return `# ${label} Registry value should be absent
try {
    $RegPath${idx} = ${path}
    $ValName${idx} = ${name}
    if (-not (Test-Path $RegPath${idx})) {
        Write-Output "${label} Compliant: registry path absent ($RegPath${idx})"
        $${v} = $true
    }
    else {
        $present = $null -ne (Get-ItemProperty -Path $RegPath${idx} -Name $ValName${idx} -ErrorAction SilentlyContinue)
        if ($present) {
            Write-Output "${label} Non-compliant: $ValName${idx} still present in $RegPath${idx}"
            $${v} = $false
        }
        else {
            Write-Output "${label} Compliant: $ValName${idx} not present in $RegPath${idx}"
            $${v} = $true
        }
    }
}
catch {
    Write-Output "${label} Error: $($_.Exception.Message)"
    $${v} = $false
}`;
      }
      // action = Set: compliant if current value matches expected
      return `# ${label} Registry value should match expected
try {
    $RegPath${idx}  = ${path}
    $ValName${idx}  = ${name}
    $Expected${idx} = ${exp}
    if (-not (Test-Path $RegPath${idx})) {
        Write-Output "${label} Non-compliant: registry path missing ($RegPath${idx})"
        $${v} = $false
    }
    else {
        $current${idx} = Get-ItemPropertyValue -Path $RegPath${idx} -Name $ValName${idx} -ErrorAction Stop
        if ($current${idx} ${op} $Expected${idx}) {
            Write-Output "${label} Compliant: $ValName${idx} = '$current${idx}' (matches '$Expected${idx}')"
            $${v} = $true
        }
        else {
            Write-Output "${label} Non-compliant: $ValName${idx} = '$current${idx}', expected '$Expected${idx}'"
            $${v} = $false
        }
    }
}
catch {
    Write-Output "${label} Error: $($_.Exception.Message)"
    $${v} = $false
}`;
    }

    case "service": {
      // Assign user-derived text to a PS variable so it never appears
      // unquoted inside Write-Output. This prevents a service name that
      // contains `"` / `$` / backticks from breaking the surrounding string.
      return `# ${label} Service should be ${c.expectedStatus}
try {
    $SvcName${idx} = ${psQuote(c.serviceName)}
    $svc${idx} = Get-Service -Name $SvcName${idx} -ErrorAction Stop
    if ($svc${idx}.Status -eq '${c.expectedStatus}') {
        Write-Output "${label} Compliant: service '$SvcName${idx}' is ${c.expectedStatus}"
        $${v} = $true
    }
    else {
        Write-Output "${label} Non-compliant: service '$SvcName${idx}' is $($svc${idx}.Status), expected ${c.expectedStatus}"
        $${v} = $false
    }
}
catch {
    Write-Output "${label} Error: $($_.Exception.Message)"
    $${v} = $false
}`;
    }

    case "file": {
      const wantExists = c.expected === "Exists";
      return `# ${label} Path should ${wantExists ? "exist" : "be absent"}
try {
    $Path${idx} = ${psQuote(c.filePath)}
    $found${idx} = Test-Path -Path $Path${idx}
    if (${wantExists ? "$found" + idx : "-not $found" + idx}) {
        Write-Output "${label} Compliant: path ${wantExists ? "exists" : "is absent"} ($Path${idx})"
        $${v} = $true
    }
    else {
        Write-Output "${label} Non-compliant: path ${wantExists ? "missing" : "still exists"} ($Path${idx})"
        $${v} = $false
    }
}
catch {
    Write-Output "${label} Error: $($_.Exception.Message)"
    $${v} = $false
}`;
    }

    case "scheduledTask": {
      const wantEnabled = c.expected === "Enabled";
      return `# ${label} Scheduled task should be ${c.expected}
try {
    $TaskName${idx} = ${psQuote(c.taskName)}
    $task${idx} = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -eq $TaskName${idx} } | Select-Object -First 1
    if ($null -eq $task${idx}) {
        Write-Output "${label} Non-compliant: scheduled task '$TaskName${idx}' not found"
        $${v} = $false
    }
    else {
        $isEnabled${idx} = ($task${idx}.State -ne 'Disabled')
        if (${wantEnabled ? "$isEnabled" + idx : "-not $isEnabled" + idx}) {
            Write-Output "${label} Compliant: scheduled task '$TaskName${idx}' state=$($task${idx}.State)"
            $${v} = $true
        }
        else {
            Write-Output "${label} Non-compliant: scheduled task '$TaskName${idx}' state=$($task${idx}.State)"
            $${v} = $false
        }
    }
}
catch {
    Write-Output "${label} Error: $($_.Exception.Message)"
    $${v} = $false
}`;
    }
  }
}

// Per-condition remediation. If `flip` is true, performs the OPPOSITE action
// (used by inverse mode, and by rollback in normal mode).
function buildConditionRemediationBlock(
  c: Condition,
  idx: number,
  flip: boolean,
  dryRun: boolean
): string {
  const label = `[Fix ${idx + 1}]`;

  const dry = (cmd: string) =>
    dryRun ? `Write-Output "[DRY RUN] ${cmd.replace(/"/g, '`"')}"` : cmd;

  switch (c.kind) {
    case "registry": {
      const path = psQuote(c.registryPath);
      const name = psQuote(c.registryValueName);
      const exp = psQuote(c.expectedValue);
      const action = flip ? (c.action === "Set" ? "Remove" : "Set") : c.action;
      if (action === "Set") {
        return `# ${label} Set registry value
try {
    $RegPath${idx}  = ${path}
    $ValName${idx}  = ${name}
    $Expected${idx} = ${exp}
    if (-not (Test-Path $RegPath${idx})) {
        ${dry(`New-Item -Path $RegPath${idx} -Force | Out-Null`)}
        Write-Output "${label} Created registry path $RegPath${idx}"
    }
    ${dry(`Set-ItemProperty -Path $RegPath${idx} -Name $ValName${idx} -Value $Expected${idx} -Type ${c.valueType} -Force -ErrorAction Stop`)}
    Write-Output "${label} Set $ValName${idx} = '$Expected${idx}' (${c.valueType})"
}
catch {
    Write-Output "${label} Error: $($_.Exception.Message)"
    throw
}`;
      }
      // Remove
      return `# ${label} Remove registry value
try {
    $RegPath${idx} = ${path}
    $ValName${idx} = ${name}
    if (-not (Test-Path $RegPath${idx})) {
        Write-Output "${label} Path absent, nothing to remove ($RegPath${idx})"
    }
    elseif ($null -eq (Get-ItemProperty -Path $RegPath${idx} -Name $ValName${idx} -ErrorAction SilentlyContinue)) {
        Write-Output "${label} Value already absent ($ValName${idx})"
    }
    else {
        ${dry(`Remove-ItemProperty -Path $RegPath${idx} -Name $ValName${idx} -Force -ErrorAction Stop`)}
        Write-Output "${label} Removed $ValName${idx} from $RegPath${idx}"
    }
}
catch {
    Write-Output "${label} Error: $($_.Exception.Message)"
    throw
}`;
    }

    case "service": {
      const want = flip
        ? c.expectedStatus === "Running"
          ? "Stopped"
          : "Running"
        : c.expectedStatus;
      const cmd =
        want === "Running"
          ? `Start-Service -Name $SvcName${idx} -ErrorAction Stop`
          : `Stop-Service -Name $SvcName${idx} -Force -ErrorAction Stop`;
      return `# ${label} Ensure service is ${want}
try {
    $SvcName${idx} = ${psQuote(c.serviceName)}
    ${dry(cmd)}
    Write-Output "${label} Service '$SvcName${idx}' is now ${want}"
}
catch {
    Write-Output "${label} Error: $($_.Exception.Message)"
    throw
}`;
    }

    case "file": {
      const want = flip
        ? c.expected === "Exists"
          ? "NotExists"
          : "Exists"
        : c.expected;
      if (want === "Exists") {
        // EnsureExists: create empty file/folder. Heuristic: trailing slash or no extension => folder.
        return `# ${label} Ensure path exists ('${c.filePath}')
try {
    $Path${idx} = ${psQuote(c.filePath)}
    if (Test-Path -Path $Path${idx}) {
        Write-Output "${label} Path already exists ($Path${idx})"
    }
    else {
        $isFolder${idx} = ($Path${idx} -match '[\\\\\\/]$') -or ([System.IO.Path]::GetExtension($Path${idx}) -eq '')
        $type${idx} = if ($isFolder${idx}) { 'Directory' } else { 'File' }
        ${dry(`New-Item -Path $Path${idx} -ItemType $type${idx} -Force -ErrorAction Stop | Out-Null`)}
        Write-Output "${label} Created $type${idx} at $Path${idx}"
    }
}
catch {
    Write-Output "${label} Error: $($_.Exception.Message)"
    throw
}`;
      }
      // EnsureRemoved
      return `# ${label} Ensure path is removed ('${c.filePath}')
try {
    $Path${idx} = ${psQuote(c.filePath)}
    if (-not (Test-Path -Path $Path${idx})) {
        Write-Output "${label} Path already absent ($Path${idx})"
    }
    else {
        ${dry(`Remove-Item -Path $Path${idx} -Recurse -Force -ErrorAction Stop`)}
        Write-Output "${label} Removed $Path${idx}"
    }
}
catch {
    Write-Output "${label} Error: $($_.Exception.Message)"
    throw
}`;
    }

    case "scheduledTask": {
      const want = flip
        ? c.expected === "Enabled"
          ? "Disabled"
          : "Enabled"
        : c.expected;
      const cmd =
        want === "Enabled"
          ? `Enable-ScheduledTask -TaskName $TaskName${idx} -ErrorAction Stop | Out-Null`
          : `Disable-ScheduledTask -TaskName $TaskName${idx} -ErrorAction Stop | Out-Null`;
      return `# ${label} Ensure scheduled task is ${want}
try {
    $TaskName${idx} = ${psQuote(c.taskName)}
    ${dry(cmd)}
    Write-Output "${label} Scheduled task '$TaskName${idx}' is now ${want}"
}
catch {
    Write-Output "${label} Error: $($_.Exception.Message)"
    throw
}`;
    }
  }
}

// Build a true short-circuit aggregator block. AND stops at the first failed
// check; OR stops at the first satisfied check. We use a `do { ... } while
// ($false)` wrapper so we can `break` out, which is the cleanest way to
// express short-circuit control flow in Windows PowerShell 5.x (no ternary,
// no `&&`/`||` until PS7+).
function buildShortCircuitDetection(
  conditions: Condition[],
  combinator: "AND" | "OR"
): string {
  const isAnd = combinator === "AND";
  const total = conditions.length;
  const lines: string[] = [];
  lines.push(`# Short-circuit aggregation (combinator: ${combinator}, ${total} check${total > 1 ? "s" : ""})`);
  if (total > 1) {
    lines.push(
      isAnd
        ? `# AND: stop on the first FAILED check (skip the rest).`
        : `# OR : stop on the first SATISFIED check (skip the rest).`
    );
  }
  lines.push(`$desiredObserved = $false`);
  lines.push(`do {`);

  conditions.forEach((c, i) => {
    const block = buildConditionCheckBlock(c, i);
    const indented = block
      .split("\n")
      .map((l) => (l.length ? "    " + l : l))
      .join("\n");
    lines.push(indented);

    if (total > 1) {
      const cv = `$cond${i + 1}`;
      if (isAnd) {
        lines.push(
          `    if (-not ${cv}) { Write-Output "[Aggregate] Short-circuit: AND failed at Check ${i + 1}; skipping remaining $(${total} - ${i + 1}) check(s)"; break }`
        );
      } else {
        lines.push(
          `    if (${cv}) { $desiredObserved = $true; Write-Output "[Aggregate] Short-circuit: OR satisfied at Check ${i + 1}; skipping remaining $(${total} - ${i + 1}) check(s)"; break }`
        );
      }
    }

    if (i < conditions.length - 1) lines.push("");
  });

  lines.push("");
  if (total === 1) {
    lines.push(`    $desiredObserved = $cond1`);
  } else if (isAnd) {
    lines.push(`    # All ${total} checks passed`);
    lines.push(`    $desiredObserved = $true`);
  } else {
    lines.push(`    # None of the ${total} checks satisfied (OR exhausted)`);
  }
  lines.push(`} while ($false)`);

  return lines.join("\n");
}

function finalize(text: string, inputs: ScriptInputs): string {
  // Substitute variables, then prepend warning for any unresolved refs.
  const substituted = substituteVariables(text, inputs.variables);
  const warning = buildUnresolvedWarning(substituted);
  if (!warning) return substituted;
  // Inject warning into the synopsis block (or at top if not present).
  return substituted.replace(/(<#[\s\S]*?#>)/, (m) => m.replace("#>", `${warning}#>`));
}

export function generateDetection(inputs: ScriptInputs): string {
  if (inputs.conditions.length === 0) {
    return emptyConditionsScript(inputs.scriptName || "Untitled", "Detection");
  }
  const subbed = withSubstitutedConditions(inputs);
  const detectionBlock = buildShortCircuitDetection(subbed.conditions, subbed.combinator);
  const inverse = subbed.inverseMode;

  // In inverse mode: compliant means desired state NOT observed.
  // In normal mode: compliant means desired state observed.
  const compliantExpr = inverse ? `-not $desiredObserved` : `$desiredObserved`;

  const summary = buildHeaderSummary(subbed, "Detection");
  const variablesHeader = buildVariablesHeader(subbed);
  const detailsHeader = buildDetailsHeader(subbed);
  const detailsBlock = detailsHeader ? `${detailsHeader}\n` : "";

  // Aggregate-level messaging is sensitive to combinator AND/OR semantics:
  //   AND -> "all required conditions are satisfied"  /  "one or more failed"
  //   OR  -> "at least one required condition is satisfied" / "no condition satisfied"
  const isAnd = subbed.combinator === "AND";
  const overallMessage = inverse
    ? "Compliant: unwanted state is NOT present on this device"
    : isAnd
      ? "Compliant: all required conditions are satisfied"
      : "Compliant: at least one required condition is satisfied";
  const overallNonCompliant = inverse
    ? "Non-compliant: unwanted state is present on this device"
    : isAnd
      ? "Non-compliant: one or more required conditions failed"
      : "Non-compliant: none of the required conditions were satisfied";

  const text = `<#
.SYNOPSIS
${inputs.scriptName} - Detection Script
.DESCRIPTION
${detailsBlock}Designed for Microsoft Intune Proactive Remediations.

EXIT CODES (REQUIRED for Intune to interpret status):
  exit 0 = compliant     -> No remediation will run
  exit 1 = non-compliant -> Remediation script will run on the device

LOGGING REMINDER:
  Use Write-Output (NOT Write-Host) for any message you want to surface
  in the Intune portal. Each per-check Write-Output line below appears
  in the "Pre-remediation detection output" column.

${summary}${variablesHeader}
.NOTES
Run as: ${inputs.runContext}
Architecture: ${inputs.architecture}
Logging level: ${inputs.loggingLevel}
Test in a pilot ring before production deployment.
#>

${buildLoggingPreamble(inputs, "Detection")}${detectionBlock}

# Aggregate result across all checks (combinator: ${inputs.combinator}${inverse ? ", inverse mode" : ""})
$compliant = ${compliantExpr}

if ($compliant) {
    Write-Output "${overallMessage}"
    $exitCode = 0
}
else {
    Write-Output "${overallNonCompliant}"
    $exitCode = 1
}
${buildLoggingPostamble(inputs)}
exit $exitCode
`;
  return finalize(text, inputs);
}

export function generateRemediation(inputs: ScriptInputs): string {
  if (inputs.conditions.length === 0) {
    return emptyConditionsScript(inputs.scriptName || "Untitled", "Remediation");
  }
  const subbed = withSubstitutedConditions(inputs);
  // Inverse mode flips per-condition action (e.g., Set -> Remove).
  const blocks = subbed.conditions
    .map((c, i) => buildConditionRemediationBlock(c, i, subbed.inverseMode, subbed.dryRunMode))
    .join("\n\n");

  const summary = buildHeaderSummary(subbed, "Remediation");
  const variablesHeader = buildVariablesHeader(subbed);
  const detailsHeader = buildDetailsHeader(subbed);
  const detailsBlock = detailsHeader ? `${detailsHeader}\n\n` : "";

  const text = `<#
.SYNOPSIS
${inputs.scriptName} - Remediation Script
.DESCRIPTION
${detailsBlock}EXIT CODES (REQUIRED for Intune to mark the device correctly):
  exit 0 = remediation successful -> Intune marks the device "Recovered"
  exit 1 = remediation failed     -> Intune marks the device "Failed"

LOGGING REMINDER:
  Use Write-Output (NOT Write-Host) for any message you want to surface
  in the Intune portal. Each per-fix Write-Output line below appears in
  the "Post-remediation detection output" column.

${summary}${variablesHeader}
.NOTES
Run as: ${inputs.runContext}
Architecture: ${inputs.architecture}
Logging level: ${inputs.loggingLevel}
${inputs.dryRunMode ? "DRY RUN MODE ENABLED - no changes will actually be made.\n" : ""}#>

${buildLoggingPreamble(inputs, "Remediation")}$exitCode = 1
try {
${blocks
  .split("\n")
  .map((l) => (l.length ? "    " + l : l))
  .join("\n")}

    Write-Output "Remediation completed for all ${inputs.conditions.length} condition(s)"
    $exitCode = 0
}
catch {
    Write-Output "Remediation failed: $($_.Exception.Message)"
    $exitCode = 1
}
${buildLoggingPostamble(inputs)}
exit $exitCode
`;
  return finalize(text, inputs);
}

export function generateRollback(inputs: ScriptInputs): string {
  if (!inputs.rollback) {
    return "# Rollback is disabled for this script.\n# Enable the 'Include Rollback' switch in the builder to generate one.";
  }
  if (inputs.conditions.length === 0) {
    return emptyConditionsScript(inputs.scriptName || "Untitled", "Rollback");
  }

  const subbed = withSubstitutedConditions(inputs);

  // Rollback = the OPPOSITE of remediation.
  // Normal: remediation flip=false  -> rollback flip=true
  // Inverse: remediation flip=true  -> rollback flip=false
  const rollbackFlip = !subbed.inverseMode;

  const blocks = subbed.conditions
    .map((c, i) => buildConditionRemediationBlock(c, i, rollbackFlip, subbed.dryRunMode))
    .join("\n\n");

  const summary = buildHeaderSummary(subbed, "Rollback");
  const variablesHeader = buildVariablesHeader(subbed);
  const detailsHeader = buildDetailsHeader(subbed);
  const detailsBlock = detailsHeader ? `${detailsHeader}\n\n` : "";

  const text = `<#
.SYNOPSIS
${inputs.scriptName} - Rollback Script
.DESCRIPTION
${detailsBlock}Reverts changes made by the remediation script. Each per-condition fix
is undone with its inverse action (Set <-> Remove, Start <-> Stop,
Enable <-> Disable, Create <-> Remove). Deploy as a separate Intune
Proactive Remediation if you need to undo a previous rollout.

  IMPORTANT: For registry "Set" rollbacks, this restores by REMOVING
  the value (best-guess inverse). If your environment had a specific
  prior value, capture it before the original deployment and edit
  this script accordingly.

EXIT CODES:
  exit 0 = rollback successful
  exit 1 = rollback failed

${summary}${variablesHeader}
.NOTES
Run as: ${inputs.runContext}
Architecture: ${inputs.architecture}
Logging level: ${inputs.loggingLevel}
${inputs.dryRunMode ? "DRY RUN MODE ENABLED - no changes will actually be made.\n" : ""}#>

${buildLoggingPreamble(inputs, "Rollback")}$exitCode = 1
try {
${blocks
  .split("\n")
  .map((l) => (l.length ? "    " + l : l))
  .join("\n")}

    Write-Output "Rollback completed for all ${inputs.conditions.length} condition(s)"
    $exitCode = 0
}
catch {
    Write-Output "Rollback failed: $($_.Exception.Message)"
    $exitCode = 1
}
${buildLoggingPostamble(inputs)}
exit $exitCode
`;
  return finalize(text, inputs);
}

export function generateIntuneNotes(inputs: ScriptInputs): string {
  const subbed = withSubstitutedConditions(inputs);
  const condLines = subbed.conditions
    .map((c, i) => {
      switch (c.kind) {
        case "registry":
          return `  ${i + 1}. Registry (${c.action}): ${c.registryPath} \\ ${c.registryValueName} ${c.detectionOperator} ${c.expectedValue} (${c.valueType})`;
        case "service":
          return `  ${i + 1}. Service: ${c.serviceName} expect ${c.expectedStatus}`;
        case "file":
          return `  ${i + 1}. File/Folder: ${c.filePath} expect ${c.expected}`;
        case "scheduledTask":
          return `  ${i + 1}. Scheduled Task: ${c.taskName} expect ${c.expected}`;
      }
    })
    .join("\n");

  const text = `Script Name: ${inputs.scriptName}
Description: ${inputs.description}

Recommended Intune Assignment: Proactive Remediation
Run Context: ${inputs.runContext}
Architecture: ${inputs.architecture}
Detection Interval: Daily
Inverse / Uninstall mode: ${inputs.inverseMode ? "ENABLED" : "disabled"}

Conditions (combinator: ${inputs.combinator}):
${condLines}

${inputs.pilotGroup ? "Pilot Group Recommendation: Deploy to a pilot group of 5-10 devices first." : ""}

Assign via: Devices > Scripts and remediations > Create > Proactive remediation`;
  return substituteVariables(text, inputs.variables);
}

export function generateTestingCommands(inputs: ScriptInputs): string {
  const text = `# Test detection script manually
Set-ExecutionPolicy Bypass -Scope Process -Force
& "C:\\Temp\\${inputs.scriptName}-Detection.ps1"
echo "Detection exit code: $LASTEXITCODE"

# Test remediation script manually
& "C:\\Temp\\${inputs.scriptName}-Remediation.ps1"
echo "Remediation exit code: $LASTEXITCODE"

# Re-run detection to verify the fix held
& "C:\\Temp\\${inputs.scriptName}-Detection.ps1"
echo "Post-remediation detection exit code: $LASTEXITCODE"

# Check Intune remediation status in Windows event log
Get-WinEvent -LogName "Microsoft-Windows-DeviceManagement-Enterprise-Diagnostics-Provider/Admin" -MaxEvents 50`;
  return substituteVariables(text, inputs.variables);
}
