// In-browser PowerShell linter targeted at Intune Proactive Remediation
// scripts. Emits findings with line, severity, message, and fix.

import { tokenize, extractInvocations, getNamedArg, type Token } from "./tokenizer";
import { isDangerousCmdlet, lookupCmdlet } from "./cmdlet-reference";

export type Severity = "info" | "warn" | "error";

export interface LintFinding {
  rule: string;
  severity: Severity;
  line: number;
  message: string;
  fix: string;
}

export interface LintResult {
  findings: LintFinding[];
  status: "clean" | "info" | "warn" | "error";
  counts: { info: number; warn: number; error: number };
}

// Cmdlets that need -WhatIf or -Confirm:$false guarding.
const NEEDS_WHATIF = new Set([
  "remove-item",
  "remove-itemproperty",
  "stop-service",
  "stop-process",
  "unregister-scheduledtask",
  "set-executionpolicy",
]);

const NEEDS_ERROR_ACTION = new Set([
  "get-itempropertyvalue",
  "get-itemproperty",
  "set-itemproperty",
  "new-itemproperty",
  "remove-itemproperty",
  "remove-item",
  "new-item",
  "get-service",
  "start-service",
  "stop-service",
  "set-service",
  "get-scheduledtask",
  "enable-scheduledtask",
  "disable-scheduledtask",
]);

function rangeContainsLine(start: number, end: number, line: number): boolean {
  return line >= start && line <= end;
}

// [startLine, endLine] of every try/catch/finally block.
function findTryBlocks(tokens: Token[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type !== "cmdlet" || t.value.toLowerCase() !== "try") continue;
    let j = i + 1;
    while (j < tokens.length && !(tokens[j].type === "operator" && tokens[j].value === "{")) j += 1;
    if (j === tokens.length) continue;
    let depth = 1;
    let k = j + 1;
    let endLine = tokens[j].line;
    while (k < tokens.length && depth > 0) {
      if (tokens[k].type === "operator" && tokens[k].value === "{") depth += 1;
      else if (tokens[k].type === "operator" && tokens[k].value === "}") {
        depth -= 1;
        endLine = tokens[k].line;
      }
      k += 1;
    }
    let m = k;
    while (m < tokens.length) {
      const nxt = tokens[m];
      if (nxt.type === "text" && nxt.value.trim() === "") { m += 1; continue; }
      if (nxt.type === "newline") { m += 1; continue; }
      if (nxt.type === "cmdlet" && (nxt.value.toLowerCase() === "catch" || nxt.value.toLowerCase() === "finally")) {
        while (m < tokens.length && !(tokens[m].type === "operator" && tokens[m].value === "{")) m += 1;
        if (m === tokens.length) break;
        let d2 = 1;
        m += 1;
        while (m < tokens.length && d2 > 0) {
          if (tokens[m].type === "operator" && tokens[m].value === "{") d2 += 1;
          else if (tokens[m].type === "operator" && tokens[m].value === "}") {
            d2 -= 1;
            endLine = tokens[m].line;
          }
          m += 1;
        }
        continue;
      }
      break;
    }
    ranges.push([t.line, endLine]);
    i = k - 1;
  }
  return ranges;
}

function rollUp(findings: LintFinding[]): LintResult {
  const counts = { info: 0, warn: 0, error: 0 };
  for (const f of findings) counts[f.severity] += 1;
  let status: LintResult["status"] = "clean";
  if (counts.error > 0) status = "error";
  else if (counts.warn > 0) status = "warn";
  else if (counts.info > 0) status = "info";
  return { findings, status, counts };
}

export function lintScript(source: string): LintResult {
  const findings: LintFinding[] = [];
  const tokens = tokenize(source);
  const invs = extractInvocations(tokens);
  const tryRanges = findTryBlocks(tokens);

  const cmdletTokens = tokens.filter((t) => t.type === "cmdlet");
  const lcCmdletNames = new Set(cmdletTokens.map((t) => t.value.toLowerCase()));

  // Rule 1: Write-Host (Intune cannot read it)
  for (const t of cmdletTokens) {
    if (t.value.toLowerCase() === "write-host") {
      findings.push({
        rule: "no-write-host",
        severity: "warn",
        line: t.line,
        message: "Write-Host output is not captured by Intune Proactive Remediations.",
        fix: "Replace with Write-Output so the line shows up in the Intune detection/remediation output column.",
      });
    }
  }

  // Rule 2: Mixed Write-Host and Write-Output
  if (lcCmdletNames.has("write-host") && lcCmdletNames.has("write-output")) {
    const firstHost = cmdletTokens.find((t) => t.value.toLowerCase() === "write-host");
    if (firstHost) {
      findings.push({
        rule: "mixed-host-output",
        severity: "info",
        line: firstHost.line,
        message: "Mixing Write-Host and Write-Output makes diagnostic output inconsistent.",
        fix: "Pick one (Write-Output for Intune-visible messages, Write-Verbose for debug-only).",
      });
    }
  }

  // Rule 3: Hardcoded user paths
  {
    const re = /(C:\\Users\\[^\\\s"'`]+|%USERPROFILE%)/gi;
    const lines = source.split("\n");
    lines.forEach((ln, idx) => {
      const m = ln.match(re);
      if (!m) return;
      // Suppress matches inside comments to avoid self-referential hits.
      const trimmed = ln.trim();
      if (trimmed.startsWith("#") && trimmed.toLowerCase().includes("hardcoded")) return;
      findings.push({
        rule: "hardcoded-user-path",
        severity: "warn",
        line: idx + 1,
        message: `Hardcoded user-specific path: ${m[0]}`,
        fix: "Use $env:USERPROFILE, $env:APPDATA, or $env:ProgramData so the script works for any user.",
      });
    });
  }

  // Rules 4 and 5: exit codes, missing exit
  {
    let sawExit = false;
    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i];
      if (t.type === "cmdlet" && t.value.toLowerCase() === "exit") {
        sawExit = true;
        let j = i + 1;
        while (j < tokens.length && tokens[j].type === "text" && tokens[j].value.trim() === "") j += 1;
        const code = tokens[j];
        if (code && code.type === "number") {
          const n = parseInt(code.value, 10);
          if (n !== 0 && n !== 1) {
            findings.push({
              rule: "non-binary-exit-code",
              severity: "error",
              line: t.line,
              message: `exit ${n} is not a valid Intune compliance code.`,
              fix: "Intune Proactive Remediation only interprets exit 0 (compliant) and exit 1 (non-compliant). Map other states accordingly.",
            });
          }
        }
      }
    }
    if (!sawExit) {
      findings.push({
        rule: "missing-exit",
        severity: "error",
        line: 1,
        message: "Script never calls `exit`.",
        fix: "Detection scripts MUST end with `exit 0` (compliant) or `exit 1` (non-compliant). Without it, Intune cannot interpret the result.",
      });
    }
  }

  // Rule 6: Missing -ErrorAction Stop
  for (const inv of invs) {
    const lc = inv.cmdlet.value.toLowerCase();
    if (!NEEDS_ERROR_ACTION.has(lc)) continue;
    const ea = getNamedArg(inv.args, "-ErrorAction");
    if (!ea) {
      findings.push({
        rule: "missing-error-action",
        severity: "warn",
        line: inv.line,
        message: `${inv.cmdlet.value} call has no -ErrorAction.`,
        fix: "Add -ErrorAction Stop so the surrounding try/catch can handle failures, or -ErrorAction SilentlyContinue if you intentionally tolerate them.",
      });
    }
  }

  // Rule 7: Dangerous cmdlets outside try/catch
  for (const inv of invs) {
    if (!isDangerousCmdlet(inv.cmdlet.value)) continue;
    const inTry = tryRanges.some(([s, e]) => rangeContainsLine(s, e, inv.line));
    if (!inTry) {
      findings.push({
        rule: "dangerous-without-try",
        severity: "warn",
        line: inv.line,
        message: `${inv.cmdlet.value} mutates system state but is not inside a try/catch.`,
        fix: "Wrap the call in try { ... } catch { Write-Output \"Error: $($_.Exception.Message)\"; exit 1 } so failures surface cleanly.",
      });
    }
  }

  // Rule 8: Destructive cmdlets without -WhatIf or -Confirm:$false
  for (const inv of invs) {
    const lc = inv.cmdlet.value.toLowerCase();
    if (!NEEDS_WHATIF.has(lc)) continue;
    const hasGuard = inv.args.some(
      (a) =>
        a.type === "parameter" &&
        (a.value.toLowerCase() === "-whatif" || a.value.toLowerCase() === "-confirm" || a.value.toLowerCase() === "-force")
    );
    if (!hasGuard) {
      findings.push({
        rule: "destructive-without-guard",
        severity: "info",
        line: inv.line,
        message: `${inv.cmdlet.value} is destructive but has no -WhatIf, -Confirm, or -Force flag.`,
        fix: "During testing, append -WhatIf to preview the change. In production, set -Confirm:$false explicitly.",
      });
    }
  }

  // Rule 9: Get-ItemProperty without a nearby Test-Path
  {
    const gips = invs.filter((i) => {
      const lc = i.cmdlet.value.toLowerCase();
      return lc === "get-itemproperty" || lc === "get-itempropertyvalue";
    });
    for (const g of gips) {
      const before = invs.filter((i) => i.line < g.line && g.line - i.line <= 10);
      const hasTestPath = before.some((i) => i.cmdlet.value.toLowerCase() === "test-path");
      if (!hasTestPath) {
        findings.push({
          rule: "missing-test-path",
          severity: "info",
          line: g.line,
          message: "Get-ItemProperty without a preceding Test-Path on the same path will throw if the key is missing.",
          fix: "Guard with `if (-not (Test-Path $RegPath)) { ... }` or pair with `-ErrorAction SilentlyContinue`.",
        });
      }
    }
  }

  // Rule 10: Invoke-Expression (code-injection vector)
  for (const t of cmdletTokens) {
    if (t.value.toLowerCase() === "invoke-expression" || t.value.toLowerCase() === "iex") {
      findings.push({
        rule: "no-invoke-expression",
        severity: "error",
        line: t.line,
        message: "Invoke-Expression executes arbitrary strings as code - a major injection risk.",
        fix: "Call the cmdlet directly. If you really need dynamic dispatch, use & $cmd $args with a vetted cmdlet name.",
      });
    }
  }

  // Rule 11: Set-ExecutionPolicy in a deployed script
  for (const t of cmdletTokens) {
    if (t.value.toLowerCase() === "set-executionpolicy") {
      findings.push({
        rule: "no-set-execution-policy",
        severity: "warn",
        line: t.line,
        message: "Set-ExecutionPolicy inside a deployed script is brittle and may be blocked by policy.",
        fix: "Intune already runs Proactive Remediations with Bypass. Drop this call; reserve it for manual test commands.",
      });
    }
  }

  // Rule 12: Aliases instead of full cmdlet names
  {
    const aliases: Record<string, string> = {
      "%": "ForEach-Object",
      "?": "Where-Object",
      ls: "Get-ChildItem",
      gci: "Get-ChildItem",
      cat: "Get-Content",
      gc: "Get-Content",
      curl: "Invoke-WebRequest",
      wget: "Invoke-WebRequest",
      iex: "Invoke-Expression",
      diff: "Compare-Object",
      sleep: "Start-Sleep",
      ps: "Get-Process",
      kill: "Stop-Process",
    };
    for (const t of tokens) {
      if (t.type !== "cmdlet" && t.type !== "text") continue;
      const lc = t.value.toLowerCase();
      const expand = aliases[lc];
      if (!expand) continue;
      findings.push({
        rule: "no-aliases",
        severity: "info",
        line: t.line,
        message: `\`${t.value}\` is a PowerShell alias.`,
        fix: `Use the full cmdlet name (${expand}) so the script reads clearly and works in restricted hosts.`,
      });
    }
  }

  // Rule 13: Hardcoded credentials / passwords
  {
    const re = /(password|pwd|passwd|secret|api[_-]?key|token)\s*=\s*['"][^'"]+['"]/i;
    const lines = source.split("\n");
    lines.forEach((ln, idx) => {
      if (re.test(ln) && !ln.trimStart().startsWith("#")) {
        findings.push({
          rule: "no-hardcoded-secrets",
          severity: "error",
          line: idx + 1,
          message: "Hardcoded credential or secret detected.",
          fix: "Read secrets from the Windows Credential Manager, environment variable, or an Intune-delivered config file - never inline them.",
        });
      }
    });
  }

  // Rule 14: TODO / FIXME left in shipped script
  {
    const lines = source.split("\n");
    lines.forEach((ln, idx) => {
      if (/\b(TODO|FIXME|XXX|HACK)\b/.test(ln)) {
        findings.push({
          rule: "no-todo",
          severity: "info",
          line: idx + 1,
          message: "TODO / FIXME marker present.",
          fix: "Resolve the open item or remove the marker before deploying.",
        });
      }
    });
  }

  // Rule 15: Unknown verb-noun cmdlet (info-level; catches typos)
  {
    const seen = new Set<string>();
    for (const t of cmdletTokens) {
      if (!/^[A-Z][a-zA-Z]+-[A-Z][a-zA-Z]+$/.test(t.value)) continue;
      if (lookupCmdlet(t.value)) continue;
      const key = t.value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        rule: "unknown-cmdlet",
        severity: "info",
        line: t.line,
        message: `${t.value} is not in the built-in cmdlet reference - typo or third-party module?`,
        fix: "Double-check the spelling, or import the module that provides this cmdlet at the top of the script.",
      });
    }
  }

  findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return rollUp(findings);
}
