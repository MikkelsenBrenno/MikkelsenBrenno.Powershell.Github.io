import { motion } from "framer-motion";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Shield, ShieldAlert, ShieldCheck, FolderTree, GitBranch } from "lucide-react";
import { scenarios, type RiskLevel } from "@/data/scenarios";
import { previewCondition } from "@/lib/conditions";

const RiskBadge = ({ level }: { level: RiskLevel }) => {
  switch (level) {
    case "Low":
      return (
        <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10" data-testid={`badge-risk-low`}>
          <ShieldCheck className="w-3 h-3 mr-1" /> Low Risk
        </Badge>
      );
    case "Medium":
      return (
        <Badge variant="outline" className="border-yellow-500/30 text-yellow-400 bg-yellow-500/10" data-testid={`badge-risk-medium`}>
          <Shield className="w-3 h-3 mr-1" /> Medium Risk
        </Badge>
      );
    case "High":
      return (
        <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10" data-testid={`badge-risk-high`}>
          <ShieldAlert className="w-3 h-3 mr-1" /> High Risk
        </Badge>
      );
  }
};

function shortenPath(path: string): string {
  if (!path) return "";
  if (path.length <= 48) return path;
  return path.slice(0, 22) + "..." + path.slice(-23);
}

export default function Dashboard() {
  return (
    <div className="container max-w-screen-2xl py-8 flex-1">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">Scenario Dashboard</h1>
        <p className="text-muted-foreground text-lg max-w-3xl">
          Select a template to generate a standardized, production-ready Intune Proactive Remediation package.
          Each card pre-fills the builder with realistic settings you can refine.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {scenarios.map((scenario, index) => {
          const first = scenario.defaults.conditions[0];
          const preview = first ? previewCondition(first) : null;
          const extraCount = Math.max(0, scenario.defaults.conditions.length - 1);
          return (
            <motion.div
              key={scenario.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <Link href={`/builder?scenario=${scenario.id}`}>
                <Card
                  className="h-full flex flex-col hover:border-primary/50 hover:bg-card/80 transition-all cursor-pointer group hover-elevate"
                  data-testid={`card-scenario-${scenario.id}`}
                >
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <RiskBadge level={scenario.riskLevel} />
                      <Badge variant="secondary" className="bg-secondary/50">
                        {scenario.scriptType}
                      </Badge>
                    </div>
                    <CardTitle className="group-hover:text-primary transition-colors text-lg leading-tight">
                      {scenario.name}
                    </CardTitle>
                    <CardDescription className="text-foreground/70 font-medium">
                      {scenario.useCase}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3">
                    <p className="text-sm text-muted-foreground">{scenario.description}</p>
                    {preview && (
                      <div className="rounded border border-border/60 bg-background/40 p-2 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                          <span className="flex items-center gap-1.5">
                            <FolderTree className="w-3 h-3" />
                            Pre-fills
                          </span>
                          <span className="text-muted-foreground/80 normal-case">
                            {preview.kindLabel}
                          </span>
                        </div>
                        <div
                          className="font-mono text-[11px] text-foreground/80 break-all leading-snug"
                          data-testid={`text-prefill-path-${scenario.id}`}
                          title={preview.primaryPath}
                        >
                          {shortenPath(preview.primaryPath)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          <span className="text-foreground/60">{preview.valueLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
                          <span className="uppercase tracking-wider text-muted-foreground/60">Action:</span>
                          <span className="text-foreground/70" data-testid={`text-prefill-action-${scenario.id}`}>
                            {preview.actionLabel}
                          </span>
                        </div>
                        {(extraCount > 0 || scenario.defaults.inverseMode) && (
                          <div className="flex flex-wrap items-center gap-1 pt-1">
                            {extraCount > 0 && (
                              <Badge
                                variant="outline"
                                className="text-[9px] uppercase tracking-wider border-primary/30 text-primary/90 bg-primary/5"
                                data-testid={`badge-extra-conditions-${scenario.id}`}
                              >
                                <GitBranch className="w-2.5 h-2.5 mr-1" />+{extraCount} more · {scenario.defaults.combinator}
                              </Badge>
                            )}
                            {scenario.defaults.inverseMode && (
                              <Badge
                                variant="outline"
                                className="text-[9px] uppercase tracking-wider border-amber-500/40 text-amber-300 bg-amber-500/10"
                                data-testid={`badge-inverse-${scenario.id}`}
                              >
                                Inverse
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="pt-4 flex justify-between items-center border-t border-border/50">
                    <div className="text-xs text-muted-foreground">
                      {scenario.rollbackRecommended ? "Rollback script included" : "No rollback needed"}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors group-hover:translate-x-1" />
                  </CardFooter>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
