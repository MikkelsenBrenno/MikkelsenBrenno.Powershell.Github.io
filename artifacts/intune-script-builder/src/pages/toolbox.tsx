import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Search,
  Wrench,
  Bug,
  Plug,
  Filter,
  ChevronRight,
  Link as LinkIcon,
  ExternalLink,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/code-block";
import {
  toolboxRecipes,
  TOOLBOX_CATEGORIES,
  type ToolboxRecipe,
  type ToolboxCategory,
  type ToolboxTheme,
  type ToolboxSeeAlso,
} from "@/data/toolbox";

function themeBadge(t: ToolboxTheme) {
  if (t === "Troubleshooting") {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/30 text-amber-300 bg-amber-500/10"
        data-testid="badge-tb-theme-troubleshooting"
      >
        <Bug className="w-3 h-3 mr-1" /> Troubleshooting
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-sky-500/30 text-sky-300 bg-sky-500/10"
      data-testid="badge-tb-theme-integration"
    >
      <Plug className="w-3 h-3 mr-1" /> Integration
    </Badge>
  );
}

function seeAlsoHref(link: ToolboxSeeAlso): string {
  switch (link.kind) {
    case "reference":
      return `/reference?ids=${encodeURIComponent(link.id)}`;
    case "best-practice":
      return `/best-practices?ids=${encodeURIComponent(link.id)}`;
    case "pitfall":
      return `/pitfalls?ids=${encodeURIComponent(link.id)}`;
  }
}

function seeAlsoLabel(link: ToolboxSeeAlso): string {
  if (link.label) return link.label;
  switch (link.kind) {
    case "reference":
      return `Reference: ${link.id}`;
    case "best-practice":
      return `Best practice: ${link.id}`;
    case "pitfall":
      return `Pitfall: ${link.id}`;
  }
}

interface ToolboxCardProps {
  recipe: ToolboxRecipe;
  highlight: boolean;
}

const ToolboxCard = ({ recipe, highlight }: ToolboxCardProps) => {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [highlight]);

  const copyDeepLink = async () => {
    const url = `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}/?ids=${recipe.id}`.replace(
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
      id={`toolbox-${recipe.id}`}
      className={`rounded-lg border bg-card p-5 space-y-4 transition-colors ${
        highlight
          ? "border-primary/60 shadow-[0_0_0_1px_var(--primary)]/30"
          : "border-border"
      }`}
      data-testid={`card-tb-${recipe.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {themeBadge(recipe.theme)}
            <Badge variant="secondary" className="bg-secondary/60 text-xs">
              {recipe.category}
            </Badge>
          </div>
          <h3 className="text-lg font-semibold leading-tight">{recipe.title}</h3>
        </div>
        <button
          type="button"
          onClick={copyDeepLink}
          className="shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          title="Copy a deep-link to this recipe"
          data-testid={`button-tb-link-${recipe.id}`}
        >
          <LinkIcon className="w-3 h-3" />
          Link
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-amber-300/80">
            When to reach for it
          </div>
          <p className="text-foreground/85 leading-relaxed">{recipe.whenToUse}</p>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300/80">
            How it works
          </div>
          <p className="text-foreground/85 leading-relaxed">{recipe.how}</p>
        </div>
      </div>

      <div className="space-y-1.5 pt-2 border-t border-border/60 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-emerald-300/80">
          Example
        </div>
        <div
          className="rounded-md border border-emerald-500/20 overflow-hidden"
          data-testid={`code-tb-${recipe.id}`}
        >
          <CodeBlock
            code={recipe.example.code}
            language={recipe.example.language ?? "powershell"}
          />
        </div>
      </div>

      {(recipe.seeAlso?.length || recipe.docsUrl) && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60 text-xs">
          {recipe.seeAlso?.map((link) => (
            <Link
              key={`${link.kind}-${link.id}`}
              href={seeAlsoHref(link)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background/40 text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`link-tb-${recipe.id}-${link.kind}-${link.id}`}
            >
              <ChevronRight className="w-3 h-3" />
              {seeAlsoLabel(link)}
            </Link>
          ))}
          {recipe.docsUrl && (
            <a
              href={recipe.docsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background/40 text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`link-tb-${recipe.id}-docs`}
            >
              <ExternalLink className="w-3 h-3" />
              Docs
            </a>
          )}
        </div>
      )}
    </div>
  );
};

const THEME_ORDER: Record<ToolboxTheme, number> = {
  Troubleshooting: 0,
  Integration: 1,
};

type ThemeFilter = "All" | ToolboxTheme;

export default function ToolboxPage() {
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
  const [categoryFilter, setCategoryFilter] = useState<"All" | ToolboxCategory>("All");
  const [themeFilter, setThemeFilter] = useState<ThemeFilter>("All");
  const [onlyFocused, setOnlyFocused] = useState<boolean>(focusedIds.length > 0);

  useEffect(() => {
    setOnlyFocused(focusedIds.length > 0);
  }, [focusedIds.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return toolboxRecipes
      .filter((r) => {
        if (categoryFilter !== "All" && r.category !== categoryFilter) return false;
        if (themeFilter !== "All" && r.theme !== themeFilter) return false;
        if (onlyFocused && focusedIds.length > 0 && !focusedIds.includes(r.id)) return false;
        if (!q) return true;
        return (
          r.title.toLowerCase().includes(q) ||
          r.whenToUse.toLowerCase().includes(q) ||
          r.how.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.example.code.toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => {
        const aFocus = focusedIds.includes(a.id) ? 0 : 1;
        const bFocus = focusedIds.includes(b.id) ? 0 : 1;
        if (aFocus !== bFocus) return aFocus - bFocus;
        const t = THEME_ORDER[a.theme] - THEME_ORDER[b.theme];
        if (t !== 0) return t;
        const c = a.category.localeCompare(b.category);
        if (c !== 0) return c;
        return a.title.localeCompare(b.title);
      });
  }, [query, categoryFilter, themeFilter, onlyFocused, focusedIds]);

  const counts = useMemo(() => {
    const byCategory: Record<string, number> = {};
    toolboxRecipes.forEach((r) => {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    });
    return byCategory;
  }, []);

  return (
    <div className="container max-w-screen-2xl py-8 flex-1">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Wrench className="w-7 h-7 text-sky-400" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Toolbox
          </h1>
        </div>
        <p className="text-muted-foreground text-lg max-w-3xl">
          Practical PowerShell recipes for the two things admins actually do
          with their scripts: <span className="text-amber-300">troubleshoot
          installed apps</span> on a Windows endpoint, and{" "}
          <span className="text-sky-300">connect their fleet to the rest of
          the environment</span> — Microsoft Graph, Key Vault, Teams webhooks,
          file shares, scheduled tasks. Copy a snippet, swap the names that
          matter, ship it.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, scenario, or cmdlet..."
            className="pl-9"
            data-testid="input-tb-search"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
            <Filter className="w-3 h-3" /> Theme
          </span>
          {(["All", "Troubleshooting", "Integration"] as const).map((t) => {
            const active = themeFilter === t;
            const count =
              t === "All"
                ? toolboxRecipes.length
                : toolboxRecipes.filter((r) => r.theme === t).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setThemeFilter(t)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${
                  active
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "bg-background/40 text-muted-foreground border-border hover:text-foreground"
                }`}
                data-testid={`button-tb-theme-${t.toLowerCase()}`}
              >
                {t}
                <span className="text-[10px] text-muted-foreground/70">({count})</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
            <Filter className="w-3 h-3" /> Category
          </span>
          {(["All", ...TOOLBOX_CATEGORIES] as const).map((cat) => {
            const active = categoryFilter === cat;
            const count = cat === "All" ? toolboxRecipes.length : counts[cat] ?? 0;
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
                data-testid={`button-tb-category-${cat
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
              Linked · {focusedIds.length} recipe
              {focusedIds.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setOnlyFocused((v) => !v)}
              className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border transition-colors ${
                onlyFocused
                  ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                  : "bg-background/40 text-muted-foreground border-border hover:text-foreground"
              }`}
              data-testid="button-tb-toggle-focused"
            >
              {onlyFocused ? "Showing only linked" : "Show all"}
            </button>
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground mb-3" data-testid="text-tb-count">
        Showing {filtered.length} of {toolboxRecipes.length} recipes
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 border border-dashed border-border rounded-lg">
            No recipes match your filters.
          </div>
        ) : (
          filtered.map((r, idx) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
            >
              <ToolboxCard recipe={r} highlight={focusedIds.includes(r.id)} />
            </motion.div>
          ))
        )}
      </div>

      <div className="mt-8 text-center text-xs text-muted-foreground/70 italic flex items-center justify-center gap-1">
        Have a recipe that's saved you a 2am support call? Add it to
        <code className="text-foreground/70">src/data/toolbox.ts</code>
        <ChevronRight className="w-3 h-3" />
      </div>
    </div>
  );
}
