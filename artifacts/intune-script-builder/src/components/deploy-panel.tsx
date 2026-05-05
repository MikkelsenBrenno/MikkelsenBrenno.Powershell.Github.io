import { useState, type ComponentType, type ReactNode } from "react";
import {
  Download,
  FileArchive,
  FileCode,
  FileJson,
  FileText,
  Info,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/code-block";
import {
  buildGraphCurlSnippet,
  buildGraphPowerShellSnippet,
  buildGraphRequestJson,
  deploymentZipFilename,
  downloadDeploymentZip,
  type DeploymentPayload,
} from "@/lib/deployment";
import { useToast } from "@/hooks/use-toast";

interface DeployPanelProps {
  payload: DeploymentPayload | null;
  disabled: boolean;
  disabledReason?: string;
}

// Sub-section navigation. We use a local segmented control rather than nested
// shadcn Tabs so the parent Builder Tabs control still owns the URL/keyboard
// behavior.
type Section = "graph" | "package" | "signing";

const SECTIONS: Array<{
  value: Section;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { value: "graph", label: "Graph API", icon: FileJson },
  { value: "package", label: "Package", icon: FileArchive },
  { value: "signing", label: "Signing", icon: ShieldCheck },
];

export function DeployPanel({ payload, disabled, disabledReason }: DeployPanelProps) {
  const [section, setSection] = useState<Section>("graph");

  if (disabled || !payload) {
    return (
      <div className="p-6">
        <Alert variant="warning" className="border-amber-500/30 bg-amber-500/10 text-amber-200">
          <Info className="h-4 w-4 text-amber-400" />
          <AlertTitle className="text-amber-400">Deployment is disabled</AlertTitle>
          <AlertDescription>
            {disabledReason ??
              "Fix the validation errors in the form (script name, publisher, conditions, or {{variable}} references) before deploying."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-3 p-1">
      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
          Section:
        </span>
        {SECTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = section === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSection(opt.value)}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${
                active
                  ? "bg-primary/20 text-primary border-primary/40"
                  : "bg-background/40 text-muted-foreground border-border hover:text-foreground"
              }`}
              data-testid={`button-deploy-section-${opt.value}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
        {section === "graph" && <GraphSection payload={payload} />}
        {section === "package" && <PackageSection payload={payload} />}
        {section === "signing" && <SigningSection scriptName={payload.displayName} />}
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  blurb,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  blurb: string;
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3 mb-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{blurb}</p>
    </div>
  );
}

function SubBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function GraphSection({ payload }: { payload: DeploymentPayload }) {
  const json = buildGraphRequestJson(payload);
  const ps = buildGraphPowerShellSnippet(payload);
  const curl = buildGraphCurlSnippet(payload);

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={FileJson}
        title="What is this for?"
        blurb="Skip the Intune portal. Submit this payload directly to Microsoft Graph (or wrap it in your CI pipeline) to create the deviceHealthScript. Detection and remediation script bodies are base64-encoded inline. The PowerShell snippet uses the official Microsoft.Graph SDK; the curl example uses an OAuth bearer token."
      />

      <SubBlock
        title="POST /deviceManagement/deviceHealthScripts"
        subtitle="Pretty-printed Graph payload"
      >
        <CodeBlock code={json} language="json" blockId="graph-json" />
      </SubBlock>

      <SubBlock
        title="Invoke-MgGraphRequest snippet"
        subtitle="Self-contained PowerShell using the Microsoft.Graph SDK"
      >
        <CodeBlock code={ps} language="powershell" blockId="graph-ps" />
      </SubBlock>

      <SubBlock title="curl equivalent" subtitle="Replace <ACCESS_TOKEN> with a Graph token">
        <CodeBlock code={curl} language="bash" blockId="graph-curl" />
      </SubBlock>
    </div>
  );
}

function PackageSection({ payload }: { payload: DeploymentPayload }) {
  const { toast } = useToast();
  const filename = deploymentZipFilename(payload);

  const handleDownload = () => {
    try {
      downloadDeploymentZip(payload);
      toast({
        title: "Package downloaded",
        description: `${filename} is in your downloads folder.`,
      });
    } catch (err) {
      toast({
        title: "Could not build the .zip",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={FileArchive}
        title="What is this for?"
        blurb="Bundle every artifact this builder produces into a single .zip — Detection, Remediation, optional Rollback, an intune-metadata.json that captures the deployment configuration, and a README that summarizes the package. Suitable for source-control commits or hand-off to another admin."
      />

      <div className="rounded-md border border-border bg-secondary/20 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold">{filename}</div>
            <div className="text-xs text-muted-foreground">
              Generated client-side. No server upload, nothing leaves your browser.
            </div>
          </div>
          <Button onClick={handleDownload} className="gap-2" data-testid="button-download-zip">
            <Download className="w-4 h-4" />
            Download .zip
          </Button>
        </div>

        <div className="border-t border-border/50 pt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Contents
          </div>
          <ul className="text-xs space-y-1.5 font-mono">
            <PackageFile
              icon={FileCode}
              name="Detection.ps1"
              desc="Runs first. Exit 0 = compliant, 1 = non-compliant."
            />
            <PackageFile
              icon={FileCode}
              name="Remediation.ps1"
              desc="Runs only when Detection exits 1."
            />
            {payload.rollbackScript ? (
              <PackageFile
                icon={FileCode}
                name="Rollback.ps1"
                desc="Reverses the remediation. Deploy separately when needed."
              />
            ) : (
              <li className="text-muted-foreground/70 italic flex items-start gap-2">
                <FileCode className="w-3.5 h-3.5 mt-0.5 opacity-50" />
                <span>
                  Rollback.ps1 — <span className="not-italic">not included.</span> Enable
                  &ldquo;Include Rollback&rdquo; in the form to add it.
                </span>
              </li>
            )}
            <PackageFile
              icon={FileJson}
              name="intune-metadata.json"
              desc="Display name, run context, architecture, role scope tags."
            />
            <PackageFile
              icon={FileText}
              name="README.md"
              desc="Summary, deployment configuration table, portal + Graph instructions."
            />
          </ul>
        </div>
      </div>
    </div>
  );
}

function PackageFile({
  icon: Icon,
  name,
  desc,
}: {
  icon: ComponentType<{ className?: string }>;
  name: string;
  desc: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 mt-0.5 text-primary/80" />
      <div>
        <span className="text-foreground">{name}</span>
        <span className="text-muted-foreground font-sans"> — {desc}</span>
      </div>
    </li>
  );
}

function SigningSection({ scriptName }: { scriptName: string }) {
  const safeName = (scriptName || "Detection").replace(/[^a-zA-Z0-9_-]+/g, "_");

  const pickCertCmd = `# Find your code-signing cert in the current user store
$cert = Get-ChildItem Cert:\\CurrentUser\\My -CodeSigningCert | Select-Object -First 1
if (-not $cert) { throw "No code-signing certificate found in Cert:\\CurrentUser\\My" }
$cert | Format-List Subject, Thumbprint, NotAfter`;

  const signCmd = `# Sign the script in-place using the cert above
Set-AuthenticodeSignature \`
    -FilePath ".\\${safeName}.ps1" \`
    -Certificate $cert \`
    -TimestampServer "http://timestamp.digicert.com" \`
    -HashAlgorithm SHA256`;

  const verifyCmd = `# Verify the signature is valid (and trusted on this machine)
Get-AuthenticodeSignature ".\\${safeName}.ps1" |
    Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate`;

  const exportPfxCmd = `# Export your cert from the user store to a PFX (for sharing with build agents)
$pwd = ConvertTo-SecureString -String "<strong-password>" -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath ".\\codesigning.pfx" -Password $pwd`;

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={ShieldCheck}
        title="What is this for?"
        blurb="Some Intune tenants enforce signed PowerShell — Constrained Language Mode, AppLocker publisher rules, or custom WDAC policies will refuse unsigned scripts. This section walks you through obtaining a code-signing cert, applying Authenticode signatures, and verifying the result."
      />

      <Alert className="border-blue-500/30 bg-blue-500/10 text-blue-100">
        <Info className="h-4 w-4 text-blue-300" />
        <AlertTitle className="text-blue-200">When do you need to sign?</AlertTitle>
        <AlertDescription className="text-xs text-blue-100/90">
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>
              <strong>PowerShell execution policy</strong> set to{" "}
              <code className="font-mono">AllSigned</code> or{" "}
              <code className="font-mono">RemoteSigned</code> on the target devices.
            </li>
            <li>
              <strong>Constrained Language Mode</strong> is enforced (often via WDAC). Unsigned
              scripts run in ConstrainedLanguage and most cmdlets fail.
            </li>
            <li>
              <strong>AppLocker publisher rules</strong> for{" "}
              <code className="font-mono">*.ps1</code> exist in the tenant baseline.
            </li>
            <li>Internal compliance / change-management policy requires authorship attestation.</li>
          </ul>
        </AlertDescription>
      </Alert>

      <div className="rounded-md border border-border bg-secondary/20 p-4 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-sm">Where do code-signing certs come from?</h4>
        </div>
        <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
          <li>
            <strong className="text-foreground">Enterprise CA (most common):</strong> issue a cert
            from the &ldquo;Code Signing&rdquo; template via your internal AD CS, or have a PKI
            admin generate one. Trusted on every domain-joined endpoint automatically.
          </li>
          <li>
            <strong className="text-foreground">Public CA:</strong> DigiCert, Sectigo, GlobalSign,
            etc. Required if you ship scripts to non-domain devices. Standard certs cost a few
            hundred USD/year; EV certs require HSM/token storage.
          </li>
          <li>
            <strong className="text-foreground">Self-signed (lab only):</strong> use{" "}
            <code className="font-mono">New-SelfSignedCertificate -Type CodeSigningCert</code>.
            Will not be trusted on other machines unless you also import it into{" "}
            <code className="font-mono">Trusted Publishers</code>.
          </li>
        </ul>
      </div>

      <SubBlock
        title="1. Pick a code-signing certificate"
        subtitle="Locate the cert and confirm it is valid"
      >
        <CodeBlock code={pickCertCmd} blockId="signing-pick-cert" />
      </SubBlock>

      <SubBlock title="2. Sign the script" subtitle="Set-AuthenticodeSignature with timestamping">
        <CodeBlock code={signCmd} blockId="signing-sign" />
      </SubBlock>

      <SubBlock title="3. Verify the signature" subtitle="Status should be 'Valid'">
        <CodeBlock code={verifyCmd} blockId="signing-verify" />
      </SubBlock>

      <SubBlock
        title="Optional: export PFX for build agents"
        subtitle="Move the cert + private key to CI"
      >
        <CodeBlock code={exportPfxCmd} blockId="signing-export-pfx" />
      </SubBlock>

      <Alert variant="warning" className="border-amber-500/30 bg-amber-500/10 text-amber-200">
        <ShieldCheck className="h-4 w-4 text-amber-400" />
        <AlertTitle className="text-amber-400">Signing checklist</AlertTitle>
        <AlertDescription>
          <ul className="list-disc list-inside text-xs space-y-1 mt-1">
            <li>Use a timestamp server so the signature stays valid after the cert expires.</li>
            <li>Sign Detection.ps1, Remediation.ps1, AND Rollback.ps1 — all three need to load.</li>
            <li>Keep the private key off shared filesystems. Use an HSM or token for production.</li>
            <li>
              If <code className="font-mono">Status</code> returns{" "}
              <code className="font-mono">UnknownError</code> on an endpoint, the signing cert is
              not in <code className="font-mono">Trusted Publishers</code> on that device.
            </li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}
