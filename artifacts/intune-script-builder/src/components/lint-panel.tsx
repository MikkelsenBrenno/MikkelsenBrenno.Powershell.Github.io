import { useState } from "react";
import { ChevronDown, AlertCircle, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { LintResult, Severity } from "@/lib/powershell/linter";

interface LintPanelProps {
  result: LintResult;
  onJumpToLine?: (line: number) => void;
}

export function qualityBadge(result: LintResult): { label: string; cls: string } {
  switch (result.status) {
    case "clean":
      return { label: "Clean", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" };
    case "info":
      return { label: `${result.counts.info} info`, cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" };
    case "warn":
      return {
        label: `${result.counts.warn} warning${result.counts.warn === 1 ? "" : "s"}`,
        cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",
      };
    case "error":
      return {
        label: `${result.counts.error} error${result.counts.error === 1 ? "" : "s"}`,
        cls: "border-red-500/40 bg-red-500/10 text-red-300",
      };
  }
}

function severityIcon(s: Severity) {
  if (s === "error") return <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  if (s === "warn") return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  return <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
}

function severityChip(s: Severity) {
  const cls =
    s === "error"
      ? "border-red-500/40 text-red-300 bg-red-500/10"
      : s === "warn"
        ? "border-amber-500/40 text-amber-300 bg-amber-500/10"
        : "border-sky-500/40 text-sky-300 bg-sky-500/10";
  return (
    <span
      className={`uppercase tracking-wider text-[9px] font-semibold rounded px-1.5 py-0.5 border ${cls}`}
    >
      {s}
    </span>
  );
}

export function LintPanel({ result, onJumpToLine }: LintPanelProps) {
  const [open, setOpen] = useState(result.status === "error" || result.status === "warn");
  const badge = qualityBadge(result);

  if (result.findings.length === 0) {
    return (
      <div
        className="mt-2 flex items-center gap-2 text-xs px-3 py-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
        data-testid="lint-summary-clean"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span className="font-medium">Quality: Clean</span>
        <span className="text-emerald-300/70">All 15 lint rules pass.</span>
      </div>
    );
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mt-2 rounded-md border border-border bg-secondary/20"
      data-testid="lint-panel"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between p-2.5 text-left hover-elevate"
          data-testid="button-toggle-lint"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">Quality</span>
            <span
              className={`uppercase tracking-wider text-[10px] font-bold rounded px-2 py-0.5 border ${badge.cls}`}
              data-testid="lint-quality-badge"
            >
              {badge.label}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {result.counts.error} err · {result.counts.warn} warn · {result.counts.info} info
            </span>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 pb-2 space-y-1.5">
        {result.findings.map((f, i) => (
          <div
            key={`${f.rule}-${f.line}-${i}`}
            className="rounded border border-border/60 bg-background/40 p-2 text-xs"
            data-testid={`lint-finding-${f.rule}`}
          >
            <div className="flex items-center gap-2 mb-1">
              {severityIcon(f.severity)}
              {severityChip(f.severity)}
              <Badge
                variant="outline"
                className="text-[9px] uppercase tracking-wider border-border/60 text-muted-foreground"
              >
                {f.rule}
              </Badge>
              {onJumpToLine ? (
                <button
                  type="button"
                  onClick={() => onJumpToLine(f.line)}
                  className="text-[10px] text-muted-foreground hover:text-primary hover:underline font-mono cursor-pointer"
                  title="Jump to this line in the script"
                  data-testid={`button-lint-jump-${f.rule}-${f.line}`}
                >
                  line {f.line}
                </button>
              ) : (
                <span className="text-[10px] text-muted-foreground font-mono">line {f.line}</span>
              )}
            </div>
            <div className="text-foreground/90">{f.message}</div>
            <div className="text-muted-foreground mt-1 italic">Fix: {f.fix}</div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
