import { useMemo } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Eye,
  Play,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  GitBranch,
  Trash2,
  Terminal,
} from "lucide-react";
import { simulateScript, type SimStep, type StepKind } from "@/lib/powershell/simulator";

interface SimulatePanelProps {
  source: string;
}

function stepIcon(k: StepKind) {
  const cls = "w-3.5 h-3.5";
  switch (k) {
    case "read":
      return <Eye className={`${cls} text-sky-400`} />;
    case "write":
      return <ArrowDownToLine className={`${cls} text-amber-400`} />;
    case "delete":
      return <Trash2 className={`${cls} text-red-400`} />;
    case "exec":
      return <Play className={`${cls} text-violet-400`} />;
    case "log":
      return <Terminal className={`${cls} text-emerald-400`} />;
    case "branch":
      return <GitBranch className={`${cls} text-sky-300`} />;
    case "exit":
      return <ArrowUpFromLine className={`${cls} text-emerald-400`} />;
    case "skip":
      return <CircleHelp className={`${cls} text-muted-foreground`} />;
    case "note":
      return <CircleHelp className={`${cls} text-muted-foreground`} />;
  }
}

function stepRingClass(k: StepKind): string {
  switch (k) {
    case "write":
      return "ring-amber-500/30 bg-amber-500/5";
    case "delete":
      return "ring-red-500/30 bg-red-500/5";
    case "read":
      return "ring-sky-500/30 bg-sky-500/5";
    case "exec":
      return "ring-violet-500/30 bg-violet-500/5";
    case "log":
      return "ring-emerald-500/30 bg-emerald-500/5";
    case "branch":
      return "ring-sky-500/30 bg-sky-500/5";
    case "exit":
      return "ring-emerald-500/40 bg-emerald-500/10";
    case "skip":
    case "note":
      return "ring-border bg-secondary/20";
  }
}

function exitBadge(code: number | null): { label: string; cls: string; icon: React.ReactNode } {
  if (code === null) {
    return {
      label: "No exit reached",
      cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",
      icon: <CircleAlert className="w-4 h-4" />,
    };
  }
  if (code === 0) {
    return {
      label: "Exit 0 · Compliant",
      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
      icon: <CircleCheck className="w-4 h-4" />,
    };
  }
  if (code === 1) {
    return {
      label: "Exit 1 · Non-compliant",
      cls: "border-red-500/40 bg-red-500/10 text-red-300",
      icon: <CircleAlert className="w-4 h-4" />,
    };
  }
  return {
    label: `Exit ${code} · Unknown`,
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    icon: <CircleAlert className="w-4 h-4" />,
  };
}

export function SimulatePanel({ source }: SimulatePanelProps) {
  const result = useMemo(() => simulateScript(source), [source]);
  const badge = exitBadge(result.exitCode);

  const writeCount = result.steps.filter((s: SimStep) => s.kind === "write" || s.kind === "delete").length;
  const readCount = result.steps.filter((s: SimStep) => s.kind === "read").length;
  const execCount = result.steps.filter((s: SimStep) => s.kind === "exec").length;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#0d1117] border border-border rounded-md">
      <div className="sticky top-0 z-10 bg-[#0d1117] border-b border-border p-3 flex flex-wrap items-center gap-3">
        <div
          className={`inline-flex items-center gap-2 px-3 py-1 rounded border text-xs font-bold ${badge.cls}`}
          data-testid="sim-exit-badge"
        >
          {badge.icon}
          {badge.label}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-3">
          <span>{result.steps.length} steps</span>
          <span>·</span>
          <span>{readCount} reads</span>
          <span>{writeCount} writes</span>
          <span>{execCount} execs</span>
        </div>
        <div className="ml-auto text-[10px] text-muted-foreground/80 italic max-w-md text-right">
          Simulated against a mocked Windows environment. No real registry, services, or files are touched.
        </div>
      </div>

      {result.steps.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground text-center">
          No simulatable statements detected. The simulator covers Test-Path,
          Get-/Set-/Remove-ItemProperty, Get-/Start-/Stop-Service,
          Enable-/Disable-ScheduledTask, New-/Remove-Item, Write-Output, and exit.
        </div>
      ) : (
        <ol className="p-4 space-y-2" data-testid="sim-steps">
          {result.steps.map((s, i) => (
            <li
              key={i}
              className={`relative pl-8 pr-3 py-2 rounded ring-1 text-xs ${stepRingClass(s.kind)}`}
              data-testid={`sim-step-${i}`}
            >
              <span className="absolute left-2 top-2.5">{stepIcon(s.kind)}</span>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">L{s.line}</span>
                {s.cmdlet && (
                  <span className="font-mono text-[10px] text-blue-300 shrink-0">{s.cmdlet}</span>
                )}
                <span className="text-foreground/95 break-words">{s.summary}</span>
              </div>
              {(s.before !== undefined || s.after !== undefined) && (
                <div className="mt-1 text-[10px] text-muted-foreground font-mono">
                  {s.before !== undefined && <span>before: {s.before || "(unset)"}</span>}
                  {s.before !== undefined && s.after !== undefined && <span> → </span>}
                  {s.after !== undefined && <span>after: {s.after}</span>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="border-t border-border p-3 text-[10px] text-muted-foreground space-y-1">
        <div className="font-semibold uppercase tracking-wider text-foreground/80">Final mock state</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
          <div>
            <div className="text-foreground/70 font-medium">Registry ({Object.keys(result.finalEnv.registry).length})</div>
            <ul className="font-mono space-y-0.5 mt-1">
              {Object.entries(result.finalEnv.registry).slice(0, 6).map(([k, v]) => (
                <li key={k} className="break-all">{k} = {v}</li>
              ))}
              {Object.keys(result.finalEnv.registry).length > 6 && (
                <li className="italic text-muted-foreground/70">...and {Object.keys(result.finalEnv.registry).length - 6} more</li>
              )}
            </ul>
          </div>
          <div>
            <div className="text-foreground/70 font-medium">Services</div>
            <ul className="font-mono space-y-0.5 mt-1">
              {Object.entries(result.finalEnv.services).map(([k, v]) => (
                <li key={k}>{k}: {v}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
