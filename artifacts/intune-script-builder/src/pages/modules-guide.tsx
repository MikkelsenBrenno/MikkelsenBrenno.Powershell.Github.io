import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Search,
  Package,
  Filter,
  ChevronRight,
  AlertTriangle,
  Link as LinkIcon,
  ExternalLink,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/code-block";
import {
  modulesGuide,
  MODULES_GUIDE_CATEGORIES,
  type ModulesGuideSection,
  type ModulesGuideCategory,
} from "@/data/modules-guide";

interface ModulesGuideCardProps {
  section: ModulesGuideSection;
  highlight: boolean;
}

const ModulesGuideCard = ({ section, highlight }: ModulesGuideCardProps) => {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [highlight]);

  const copyDeepLink = async () => {
    const url = `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}/?ids=${section.id}`.replace(
      /\/\?/,
      "?"
    );
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Best-effort; clipboard may be unavailable in insecure contexts.
    }
  };

  return (
    <div
      ref={cardRef}
      id={`modules-guide-${section.id}`}
      className={`rounded-lg border bg-card p-5 space-y-4 transition-colors ${
        highlight
          ? "border-primary/60 shadow-[0_0_0_1px_var(--primary)]/30"
          : "border-border"
      }`}
      data-testid={`card-mg-${section.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <Badge variant="secondary" className="bg-secondary/60 text-xs">
            {section.category}
          </Badge>
          <h3 className="text-lg font-semibold leading-tight">{section.title}</h3>
          <p className="text-sm text-foreground/80 leading-relaxed">
            {section.summary}
          </p>
        </div>
        <button
          type="button"
          onClick={copyDeepLink}
          className="shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          title="Copy a deep-link to this section"
          data-testid={`button-mg-link-${section.id}`}
        >
          <LinkIcon className="w-3 h-3" />
          Link
        </button>
      </div>

      <div className="space-y-1 text-sm">
        <div className="text-[10px] uppercase tracking-wider text-emerald-300/80">
          How it works
        </div>
        <p className="text-foreground/85 leading-relaxed">{section.details}</p>
      </div>

      {section.bullets && section.bullets.length > 0 && (
        <ul className="space-y-1.5 text-sm text-foreground/85 list-disc pl-5">
          {section.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}

      {section.example && (
        <div className="space-y-1.5 pt-2 border-t border-border/60 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300/80">
            Example
          </div>
          <div
            className="rounded-md border border-emerald-500/20 overflow-hidden"
            data-testid={`code-mg-${section.id}`}
          >
            <CodeBlock
              code={section.example.code}
              language={section.example.language ?? "powershell"}
            />
          </div>
        </div>
      )}

      {section.gotchas && section.gotchas.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <div className="text-[10px] uppercase tracking-wider text-amber-300/80 inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Gotchas
          </div>
          <ul className="space-y-1 text-sm text-amber-100/80 list-disc pl-5">
            {section.gotchas.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {section.docsUrl && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60 text-xs">
          <a
            href={section.docsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background/40 text-muted-foreground hover:text-foreground transition-colors"
            data-testid={`link-mg-${section.id}-docs`}
          >
            <ExternalLink className="w-3 h-3" />
            Docs
          </a>
        </div>
      )}
    </div>
  );
};

const CATEGORY_ORDER: Record<ModulesGuideCategory, number> = {
  "Gallery & Repositories": 0,
  Installing: 1,
  Versioning: 2,
  "Side-by-Side": 3,
  "Pinning in Scripts": 4,
  "Offline / Air-Gapped": 5,
  "Updating & Removing": 6,
  Publishing: 7,
};

export default function ModulesGuidePage() {
  const [location] = useLocation();

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
  const [categoryFilter, setCategoryFilter] = useState<"All" | ModulesGuideCategory>("All");
  const focusedKey = focusedIds.join(",");
  const [onlyFocused, setOnlyFocused] = useState<boolean>(focusedIds.length > 0);

  useEffect(() => {
    setOnlyFocused(focusedIds.length > 0);
  }, [focusedKey, focusedIds.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return modulesGuide
      .filter((s) => {
        if (categoryFilter !== "All" && s.category !== categoryFilter) return false;
        if (onlyFocused && focusedIds.length > 0 && !focusedIds.includes(s.id)) return false;
        if (!q) return true;
        return (
          s.title.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.details.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          (s.example?.code.toLowerCase().includes(q) ?? false) ||
          (s.bullets?.some((b) => b.toLowerCase().includes(q)) ?? false) ||
          (s.gotchas?.some((g) => g.toLowerCase().includes(q)) ?? false)
        );
      })
      .slice()
      .sort((a, b) => {
        const aFocus = focusedIds.includes(a.id) ? 0 : 1;
        const bFocus = focusedIds.includes(b.id) ? 0 : 1;
        if (aFocus !== bFocus) return aFocus - bFocus;
        const c = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
        if (c !== 0) return c;
        return a.title.localeCompare(b.title);
      });
  }, [query, categoryFilter, onlyFocused, focusedIds]);

  const counts = useMemo(() => {
    const byCategory: Record<string, number> = {};
    modulesGuide.forEach((s) => {
      byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
    });
    return byCategory;
  }, []);

  return (
    <div className="container max-w-screen-2xl py-8 flex-1">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Package className="w-7 h-7 text-violet-400" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Modules &amp; Versioning
          </h1>
        </div>
        <p className="text-muted-foreground text-lg max-w-3xl">
          The Reference page tells you <em>which</em> modules exist. This page
          explains how PowerShell modules actually work end-to-end: where the
          PowerShell Gallery sits, how install scopes change what an Intune
          script can see, how to pin to a specific version (and keep it
          pinned), how multiple versions live together, and how to ship
          modules to fleets that can't reach the public gallery.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by topic, cmdlet, or symptom..."
            className="pl-9"
            data-testid="input-mg-search"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
            <Filter className="w-3 h-3" /> Category
          </span>
          {(["All", ...MODULES_GUIDE_CATEGORIES] as const).map((cat) => {
            const active = categoryFilter === cat;
            const count = cat === "All" ? modulesGuide.length : counts[cat] ?? 0;
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
                data-testid={`button-mg-category-${cat
                  .toLowerCase()
                  .replace(/\s+/g, "-")
                  .replace(/&/g, "and")
                  .replace(/[()/]/g, "")}`}
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
              Linked · {focusedIds.length} section
              {focusedIds.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setOnlyFocused((v) => !v)}
              className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border transition-colors ${
                onlyFocused
                  ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                  : "bg-background/40 text-muted-foreground border-border hover:text-foreground"
              }`}
              data-testid="button-mg-toggle-focused"
            >
              {onlyFocused ? "Showing only linked" : "Show all"}
            </button>
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground mb-3" data-testid="text-mg-count">
        Showing {filtered.length} of {modulesGuide.length} sections
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 border border-dashed border-border rounded-lg">
            No sections match your filters.
          </div>
        ) : (
          filtered.map((s, idx) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
            >
              <ModulesGuideCard section={s} highlight={focusedIds.includes(s.id)} />
            </motion.div>
          ))
        )}
      </div>

      <div className="mt-8 text-center text-xs text-muted-foreground/70 italic flex items-center justify-center gap-1">
        Have a module-management trick worth sharing? Add it to
        <code className="text-foreground/70">src/data/modules-guide.ts</code>
        <ChevronRight className="w-3 h-3" />
      </div>
    </div>
  );
}
