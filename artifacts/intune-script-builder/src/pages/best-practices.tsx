import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Search,
  Sparkles,
  ShieldCheck,
  Shield,
  ShieldAlert,
  Filter,
  ChevronRight,
  Link as LinkIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/code-block";
import {
  bestPractices,
  BEST_PRACTICE_CATEGORIES,
  type BestPractice,
  type BestPracticeCategory,
  type BestPracticeImpact,
} from "@/data/best-practices";

function impactBadge(i: BestPracticeImpact) {
  switch (i) {
    case "Low":
      return (
        <Badge
          variant="outline"
          className="border-green-500/30 text-green-400 bg-green-500/10"
          data-testid="badge-bp-impact-low"
        >
          <ShieldCheck className="w-3 h-3 mr-1" /> Low impact
        </Badge>
      );
    case "Medium":
      return (
        <Badge
          variant="outline"
          className="border-yellow-500/30 text-yellow-400 bg-yellow-500/10"
          data-testid="badge-bp-impact-medium"
        >
          <Shield className="w-3 h-3 mr-1" /> Medium impact
        </Badge>
      );
    case "High":
      return (
        <Badge
          variant="outline"
          className="border-red-500/30 text-red-400 bg-red-500/10"
          data-testid="badge-bp-impact-high"
        >
          <ShieldAlert className="w-3 h-3 mr-1" /> High impact
        </Badge>
      );
  }
}

interface BestPracticeCardProps {
  practice: BestPractice;
  highlight: boolean;
}

const BestPracticeCard = ({ practice, highlight }: BestPracticeCardProps) => {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [highlight]);

  const copyDeepLink = async () => {
    const url = `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}/?ids=${practice.id}`.replace(
      /\/\?/,
      "?"
    );
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Best-effort; ignore clipboard failures (insecure context, denied perms).
    }
  };

  return (
    <div
      ref={cardRef}
      id={`best-practice-${practice.id}`}
      className={`rounded-lg border bg-card p-5 space-y-4 transition-colors ${
        highlight
          ? "border-primary/60 shadow-[0_0_0_1px_var(--primary)]/30"
          : "border-border"
      }`}
      data-testid={`card-bp-${practice.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {impactBadge(practice.impact)}
            <Badge variant="secondary" className="bg-secondary/60 text-xs">
              {practice.category}
            </Badge>
          </div>
          <h3 className="text-lg font-semibold leading-tight">{practice.title}</h3>
        </div>
        <button
          type="button"
          onClick={copyDeepLink}
          className="shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          title="Copy a deep-link to this practice"
          data-testid={`button-bp-link-${practice.id}`}
        >
          <LinkIcon className="w-3 h-3" />
          Link
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-amber-300/80">
            Why it matters
          </div>
          <p className="text-foreground/85 leading-relaxed">{practice.why}</p>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300/80">
            How to do it
          </div>
          <p className="text-foreground/85 leading-relaxed">{practice.how}</p>
        </div>
      </div>

      {practice.example && (
        <div className="space-y-1.5 pt-2 border-t border-border/60 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300/80">
            Example
          </div>
          <div
            className="rounded-md border border-emerald-500/20 overflow-hidden"
            data-testid={`code-bp-${practice.id}`}
          >
            <CodeBlock
              code={practice.example.code}
              language={practice.example.language ?? "powershell"}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const IMPACT_ORDER: Record<BestPracticeImpact, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

export default function BestPracticesPage() {
  const [location] = useLocation();

  // Parse the query string from window.location (wouter's base() strips it
  // from `location`). ?ids=a,b filters and highlights specific practices.
  const searchParams = useMemo(
    () => new URLSearchParams(window.location.search),
    [location]
  );
  const focusedIds = useMemo(() => {
    const raw = searchParams.get("ids");
    if (!raw) return [] as string[];
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }, [searchParams]);

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "All" | BestPracticeCategory
  >("All");
  const [onlyFocused, setOnlyFocused] = useState<boolean>(focusedIds.length > 0);

  useEffect(() => {
    setOnlyFocused(focusedIds.length > 0);
  }, [focusedIds.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bestPractices
      .filter((p) => {
        if (categoryFilter !== "All" && p.category !== categoryFilter) return false;
        if (onlyFocused && focusedIds.length > 0 && !focusedIds.includes(p.id)) return false;
        if (!q) return true;
        return (
          p.title.toLowerCase().includes(q) ||
          p.why.toLowerCase().includes(q) ||
          p.how.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.example?.code.toLowerCase().includes(q) ?? false)
        );
      })
      .slice()
      .sort((a, b) => {
        const aFocus = focusedIds.includes(a.id) ? 0 : 1;
        const bFocus = focusedIds.includes(b.id) ? 0 : 1;
        if (aFocus !== bFocus) return aFocus - bFocus;
        const imp = IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact];
        if (imp !== 0) return imp;
        return a.title.localeCompare(b.title);
      });
  }, [query, categoryFilter, onlyFocused, focusedIds]);

  const counts = useMemo(() => {
    const byCategory: Record<string, number> = {};
    bestPractices.forEach((p) => {
      byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
    });
    return byCategory;
  }, []);

  return (
    <div className="container max-w-screen-2xl py-8 flex-1">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-7 h-7 text-emerald-400" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Best Practices
          </h1>
        </div>
        <p className="text-muted-foreground text-lg max-w-3xl">
          Patterns that make Intune PowerShell scripts portable across devices,
          safe to re-run, and possible to debug after the fact. Where the
          Pitfalls page lists what to avoid, this is the positive playbook —
          execution context, environment variables, exit codes, transcripts,
          and the diagnostic habits that hold up at fleet scale.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, rationale, or technique..."
            className="pl-9"
            data-testid="input-bp-search"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
            <Filter className="w-3 h-3" /> Category
          </span>
          {(["All", ...BEST_PRACTICE_CATEGORIES] as const).map((cat) => {
            const active = categoryFilter === cat;
            const count = cat === "All" ? bestPractices.length : counts[cat] ?? 0;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${
                  active
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "bg-background/40 text-muted-foreground border-border hover:text-foreground"
                }`}
                data-testid={`button-bp-category-${cat
                  .toLowerCase()
                  .replace(/\s+/g, "-")
                  .replace(/&/g, "and")}`}
              >
                {cat}
                <span className="text-[10px] text-muted-foreground/70">({count})</span>
              </button>
            );
          })}
        </div>
        {focusedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs pt-1 border-t border-border/60">
            <span className="text-muted-foreground">
              Linked · {focusedIds.length} practice
              {focusedIds.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setOnlyFocused((v) => !v)}
              className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border transition-colors ${
                onlyFocused
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-background/40 text-muted-foreground border-border hover:text-foreground"
              }`}
              data-testid="button-bp-toggle-focused"
            >
              {onlyFocused ? "Showing only linked" : "Show all"}
            </button>
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground mb-3" data-testid="text-bp-count">
        Showing {filtered.length} of {bestPractices.length} practices
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 border border-dashed border-border rounded-lg">
            No practices match your filters.
          </div>
        ) : (
          filtered.map((p, idx) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
            >
              <BestPracticeCard practice={p} highlight={focusedIds.includes(p.id)} />
            </motion.div>
          ))
        )}
      </div>

      <div className="mt-8 text-center text-xs text-muted-foreground/70 italic flex items-center justify-center gap-1">
        Have a hard-won pattern not listed? Add it to
        <code className="text-foreground/70">src/data/best-practices.ts</code>
        <ChevronRight className="w-3 h-3" />
      </div>
    </div>
  );
}
