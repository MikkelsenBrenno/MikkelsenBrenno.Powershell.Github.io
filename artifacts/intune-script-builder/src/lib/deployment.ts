import { strToU8, zipSync, type Zippable } from "fflate";

import type { BuilderFormValues } from "./builder-schema";
import {
  generateDetection,
  generateRemediation,
  generateRollback,
  type ScriptInputs,
} from "./script-generation";

// The shape sent to Microsoft Graph
// POST https://graph.microsoft.com/beta/deviceManagement/deviceHealthScripts
// See: https://learn.microsoft.com/graph/api/intune-devices-devicehealthscript-create
export interface GraphDeviceHealthScriptPayload {
  "@odata.type": "#microsoft.graph.deviceHealthScript";
  displayName: string;
  description: string;
  publisher: string;
  runAsAccount: "system" | "user";
  enforceSignatureCheck: boolean;
  runAs32Bit: boolean;
  detectionScriptContent: string;
  remediationScriptContent: string;
  roleScopeTagIds: string[];
}

// Top-level deployment payload computed from form values. Holds raw scripts +
// the Graph payload (with base64-encoded scripts) so every consumer (Graph
// view, ZIP export, README) can read from a single source of truth.
export interface DeploymentPayload {
  displayName: string;
  description: string;
  publisher: string;
  runAs: "System" | "User";
  runAs32Bit: boolean;
  detectionScript: string;
  remediationScript: string;
  rollbackScript: string | null;
  graph: GraphDeviceHealthScriptPayload;
}

// Browser-safe base64 encoder for script bodies. PowerShell scripts are
// usually ASCII but may contain non-ASCII chars (e.g. smart quotes in a
// description), so we go through TextEncoder to UTF-8 first.
function base64EncodeUtf8(text: string): string {
  if (typeof TextEncoder === "undefined" || typeof btoa === "undefined") {
    // Node fallback for tests / SSR.
    return Buffer.from(text, "utf-8").toString("base64");
  }
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function toScriptInputs(values: BuilderFormValues): ScriptInputs {
  return {
    scriptName: values.scriptName,
    description: values.description,
    purpose: values.purpose,
    publisher: values.publisher,
    conditions: values.conditions,
    combinator: values.combinator,
    rollback: values.rollback,
    inverseMode: values.inverseMode,
    variables: values.variables,
    loggingLevel: values.loggingLevel,
    logPath: values.logPath,
    runContext: values.runContext,
    architecture: values.architecture,
    dryRunMode: values.dryRunMode,
    pilotGroup: values.pilotGroup,
  };
}

export function buildDeploymentPayload(values: BuilderFormValues): DeploymentPayload {
  const inputs = toScriptInputs(values);
  const detectionScript = generateDetection(inputs);
  const remediationScript = generateRemediation(inputs);
  const rollbackScript = values.rollback ? generateRollback(inputs) : null;

  const graph: GraphDeviceHealthScriptPayload = {
    "@odata.type": "#microsoft.graph.deviceHealthScript",
    displayName: values.scriptName,
    description: values.description,
    publisher: values.publisher,
    runAsAccount: values.runContext === "User" ? "user" : "system",
    enforceSignatureCheck: false,
    runAs32Bit: values.architecture === "32-bit",
    detectionScriptContent: base64EncodeUtf8(detectionScript),
    remediationScriptContent: base64EncodeUtf8(remediationScript),
    roleScopeTagIds: ["0"],
  };

  return {
    displayName: values.scriptName,
    description: values.description,
    publisher: values.publisher,
    runAs: values.runContext,
    runAs32Bit: values.architecture === "32-bit",
    detectionScript,
    remediationScript,
    rollbackScript,
    graph,
  };
}

// Pretty-printed JSON the admin can paste into Graph Explorer or use with
// Invoke-MgGraphRequest -Body (Get-Content payload.json -Raw).
export function buildGraphRequestJson(payload: DeploymentPayload): string {
  return JSON.stringify(payload.graph, null, 2);
}

// PowerShell snippet using the Microsoft.Graph module. We embed the JSON
// inline as a here-string so the snippet is self-contained.
export function buildGraphPowerShellSnippet(payload: DeploymentPayload): string {
  const json = buildGraphRequestJson(payload);
  return `# Deploy '${payload.displayName}' to Intune via Microsoft Graph.
# Requires the Microsoft.Graph PowerShell SDK:
#   Install-Module Microsoft.Graph -Scope CurrentUser

Connect-MgGraph -Scopes "DeviceManagementConfiguration.ReadWrite.All"

$body = @'
${json}
'@

Invoke-MgGraphRequest \`
    -Method POST \`
    -Uri "https://graph.microsoft.com/beta/deviceManagement/deviceHealthScripts" \`
    -Body $body \`
    -ContentType "application/json"
`;
}

// Curl example. We escape single quotes in the JSON the same way bash needs:
// close the literal, insert an escaped quote, reopen the literal.
export function buildGraphCurlSnippet(payload: DeploymentPayload): string {
  const json = buildGraphRequestJson(payload);
  const bashEscaped = json.replace(/'/g, `'\\''`);
  return `# Replace <ACCESS_TOKEN> with a token that has
# DeviceManagementConfiguration.ReadWrite.All. Easiest way to get one is via
# the Microsoft Graph Explorer, az account get-access-token, or your IdP.

curl -X POST \\
  "https://graph.microsoft.com/beta/deviceManagement/deviceHealthScripts" \\
  -H "Authorization: Bearer <ACCESS_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '${bashEscaped}'
`;
}

export interface DeploymentMetadata {
  displayName: string;
  description: string;
  publisher: string;
  runAsAccount: "system" | "user";
  runAs32Bit: boolean;
  enforceSignatureCheck: boolean;
  roleScopeTagIds: string[];
  generatedAt: string;
  generatedBy: "Intune PowerShell Script Builder";
  files: {
    detection: string;
    remediation: string;
    rollback: string | null;
  };
}

function buildMetadata(payload: DeploymentPayload): DeploymentMetadata {
  return {
    displayName: payload.displayName,
    description: payload.description,
    publisher: payload.publisher,
    runAsAccount: payload.graph.runAsAccount,
    runAs32Bit: payload.graph.runAs32Bit,
    enforceSignatureCheck: payload.graph.enforceSignatureCheck,
    roleScopeTagIds: payload.graph.roleScopeTagIds,
    generatedAt: new Date().toISOString(),
    generatedBy: "Intune PowerShell Script Builder",
    files: {
      detection: "Detection.ps1",
      remediation: "Remediation.ps1",
      rollback: payload.rollbackScript ? "Rollback.ps1" : null,
    },
  };
}

function buildReadme(payload: DeploymentPayload): string {
  const archLabel = payload.runAs32Bit ? "32-bit" : "64-bit";
  const rollbackLine = payload.rollbackScript
    ? "- `Rollback.ps1` — reverses the remediation. Deploy as a separate Proactive Remediation only when you need to undo the rollout."
    : "- _Rollback script not included._ Enable the **Include Rollback** switch in the builder to add one.";

  return `# ${payload.displayName}

${payload.description || "_No description provided._"}

Generated by the Intune PowerShell Script Builder on ${new Date().toISOString()}.

## Files in this package

- \`Detection.ps1\` — runs first. Exits **0 = compliant**, **1 = non-compliant**.
- \`Remediation.ps1\` — runs only when detection exits 1. Exits **0 = recovered**, **1 = failed**.
${rollbackLine}
- \`intune-metadata.json\` — deployment configuration (display name, run context, architecture, role scope tags) so the package round-trips through source control.

## Deployment configuration

| Setting | Value |
| --- | --- |
| Display name | ${payload.displayName} |
| Publisher | ${payload.publisher} |
| Run context | ${payload.runAs} |
| Architecture | ${archLabel} |
| Enforce signature check | ${payload.graph.enforceSignatureCheck ? "Yes" : "No"} |
| Role scope tag IDs | ${payload.graph.roleScopeTagIds.join(", ") || "(none)"} |

## Deploy via the Intune portal

1. Go to **Microsoft Intune admin center > Devices > Scripts and remediations > Platform scripts** (or **Remediations** for proactive remediations).
2. Click **Create**, set the **Name** to \`${payload.displayName}\` and **Publisher** to \`${payload.publisher}\`.
3. Upload \`Detection.ps1\` as the detection script and \`Remediation.ps1\` as the remediation script.
4. Set **Run this script using the logged-on credentials** to **${payload.runAs === "User" ? "Yes" : "No"}**.
5. Set **Run script in 64 bit PowerShell host** to **${payload.runAs32Bit ? "No" : "Yes"}**.
6. Assign to a pilot group of 5–10 devices first. Promote to broader rings after one full detection cycle.

## Deploy via Microsoft Graph

See the **Deploy > Graph API** tab in the builder for the full
\`POST /deviceManagement/deviceHealthScripts\` payload, an \`Invoke-MgGraphRequest\`
PowerShell snippet, and a curl example.

## Source control

This package is self-contained. Commit the whole folder to your IaC repo so
detection / remediation diffs are reviewable, and so the deployment metadata
travels alongside the scripts.
`;
}

// Build a Uint8Array zip with all four script files + metadata + README.
// Uses fflate (synchronous in-memory zip) so the entire export stays
// client-side with no server hop.
export function buildDeploymentZip(payload: DeploymentPayload): Uint8Array {
  const metadata = buildMetadata(payload);
  const readme = buildReadme(payload);

  const files: Zippable = {
    "Detection.ps1": strToU8(payload.detectionScript),
    "Remediation.ps1": strToU8(payload.remediationScript),
    "intune-metadata.json": strToU8(JSON.stringify(metadata, null, 2)),
    "README.md": strToU8(readme),
  };
  if (payload.rollbackScript) {
    files["Rollback.ps1"] = strToU8(payload.rollbackScript);
  }

  return zipSync(files, { level: 6 });
}

// Slugify a display name into a safe zip filename component.
export function deploymentZipFilename(payload: DeploymentPayload): string {
  const safe = (payload.displayName || "intune-script")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "intune-script";
  const stamp = new Date().toISOString().slice(0, 10);
  return `${safe}-${stamp}.zip`;
}

export function downloadDeploymentZip(payload: DeploymentPayload): void {
  const bytes = buildDeploymentZip(payload);
  // Copy to a fresh ArrayBuffer to satisfy the BlobPart type and to detach
  // from any underlying allocator quirks.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = deploymentZipFilename(payload);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Exposed for unit tests.
export const __test__ = {
  base64EncodeUtf8,
  buildMetadata,
  buildReadme,
};
