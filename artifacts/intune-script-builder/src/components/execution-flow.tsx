import { Server, Monitor, FileCode, CheckCircle, XCircle, GitBranch } from "lucide-react";

interface ExecutionFlowProps {
  conditionCount?: number;
  combinator?: "AND" | "OR";
  inverseMode?: boolean;
}

export function ExecutionFlow({
  conditionCount = 1,
  combinator = "AND",
  inverseMode = false,
}: ExecutionFlowProps) {
  const checks = Math.max(1, Math.min(conditionCount, 4)); // visualize up to 4
  const truncated = conditionCount > 4;

  return (
    <div className="bg-card border border-border rounded-lg p-6 mt-8 overflow-x-auto">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Intune Execution Flow</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="text-flow-mode">
          {conditionCount > 1 && (
            <span className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5">
              <GitBranch className="w-3 h-3" />
              {conditionCount} checks · {combinator}
            </span>
          )}
          {inverseMode && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 px-2 py-0.5">
              Inverse / Uninstall mode
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center min-w-max pb-4">
        <FlowBox
          icon={Server}
          color="text-blue-400"
          bg="bg-blue-500/10"
          border="border-blue-500/30"
          title="Intune Policy"
          subtitle="Assignment deployed"
        />
        <Connector />
        <FlowBox
          icon={Monitor}
          color="text-cyan-400"
          bg="bg-cyan-500/10"
          border="border-cyan-500/30"
          title="Device Check-in"
          subtitle="Syncs policy"
        />
        <Connector />

        {/* Per-condition checks */}
        {Array.from({ length: checks }).map((_, idx) => (
          <div key={idx} className="flex items-center" data-testid={`flow-check-${idx + 1}`}>
            <FlowBox
              icon={FileCode}
              color="text-indigo-400"
              bg="bg-indigo-500/10"
              border="border-indigo-500/30"
              title={`Check ${idx + 1}`}
              subtitle={idx === 0 ? "Detection" : `Combine ${combinator}`}
            />
            <Connector dashed={idx === checks - 1 && checks > 1} />
          </div>
        ))}

        {truncated && (
          <div className="flex items-center text-xs text-muted-foreground mr-2">
            +{conditionCount - 4} more
          </div>
        )}

        {/* Aggregate decision */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center">
            <div className="w-8 h-px border-t border-dashed border-border mr-2 relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2 h-2 border-t border-r border-border rotate-45" />
            </div>
            <div className="flex flex-col items-center justify-center w-44 h-24 rounded-xl border border-green-500/30 bg-green-500/10">
              <CheckCircle className="w-6 h-6 text-green-400 mb-2" />
              <span className="text-sm font-semibold text-green-400">Exit 0</span>
              <span className="text-xs text-muted-foreground mt-1 text-center px-2">
                {inverseMode
                  ? "Unwanted state absent"
                  : combinator === "OR"
                    ? "Any condition satisfied"
                    : "All conditions satisfied"}
              </span>
            </div>
          </div>

          <div className="flex items-center">
            <div className="w-8 h-px border-t border-dashed border-border mr-2 relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2 h-2 border-t border-r border-border rotate-45" />
            </div>
            <div className="flex flex-col items-center justify-center w-44 h-24 rounded-xl border border-red-500/30 bg-red-500/10">
              <XCircle className="w-6 h-6 text-red-400 mb-2" />
              <span className="text-sm font-semibold text-red-400">Exit 1</span>
              <span className="text-xs text-muted-foreground mt-1 text-center px-2">
                {inverseMode
                  ? "Unwanted state present"
                  : combinator === "OR"
                    ? "None satisfied"
                    : "One or more failed"}
              </span>
            </div>

            <div className="w-8 h-px bg-border mx-2 relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2 h-2 border-t border-r border-border rotate-45" />
            </div>

            <div className="flex flex-col items-center justify-center w-48 h-32 rounded-xl border border-primary/30 bg-primary/10">
              <FileCode className="w-8 h-8 text-primary mb-3" />
              <span className="text-sm font-semibold">Remediation Script</span>
              <div className="flex text-xs text-muted-foreground mt-2 gap-2">
                <span className="flex items-center">
                  <CheckCircle className="w-3 h-3 text-green-400 mr-1" /> Exit 0
                </span>
                <span className="flex items-center">
                  <XCircle className="w-3 h-3 text-red-400 mr-1" /> Exit 1
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FlowBoxProps {
  icon: typeof Server;
  color: string;
  bg: string;
  border: string;
  title: string;
  subtitle: string;
}
function FlowBox({ icon: Icon, color, bg, border, title, subtitle }: FlowBoxProps) {
  return (
    <div className={`flex flex-col items-center justify-center w-36 h-32 rounded-xl border ${border} ${bg}`}>
      <Icon className={`w-8 h-8 ${color} mb-3`} />
      <span className="text-sm font-semibold text-center leading-tight">{title}</span>
      <span className="text-xs text-muted-foreground mt-1 text-center">{subtitle}</span>
    </div>
  );
}

function Connector({ dashed = false }: { dashed?: boolean }) {
  return (
    <div
      className={`w-8 h-px ${dashed ? "border-t border-dashed border-border" : "bg-border"} mx-2 relative`}
    >
      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2 h-2 border-t border-r border-border rotate-45" />
    </div>
  );
}
