import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Search,
  PackageSearch,
  Filter,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Boxes,
  Terminal as TerminalIcon,
  Cpu,
  Package,
  Link as LinkIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/code-block";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  referenceEntries,
  REFERENCE_CATEGORIES,
  type ReferenceCategory,
  type ReferenceEntry,
  type ReferenceKind,
} from "@/data/modules-reference";

function kindBadge(k: ReferenceKind) {
  const id = k.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  switch (k) {
    case "Built-in cmdlet":
      return (
        <Badge
          variant="outline"
          className="border-blue-500/30 text-blue-300 bg-blue-500/10"
          data-testid={`badge-ref-kind-${id}`}
        >
          <TerminalIcon className="w-3 h-3 mr-1" /> Built-in cmdlet
        </Badge>
      );
    case "Built-in module":
      return (
        <Badge
          variant="outline"
          className="border-cyan-500/30 text-cyan-300 bg-cyan-500/10"
          data-testid={`badge-ref-kind-${id}`}
        >
          <Boxes className="w-3 h-3 mr-1" /> Built-in module
        </Badge>
      );
    case "Gallery module":
      return (
        <Badge
          variant="outline"
          className="border-fuchsia-500/30 text-fuchsia-300 bg-fuchsia-500/10"
          data-testid={`badge-ref-kind-${id}`}
        >
          <Package className="w-3 h-3 mr-1" /> Gallery module
        </Badge>
      );
    case ".NET API":
      return (
        <Badge
          variant="outline"
          className="border-amber-500/30 text-amber-300 bg-amber-500/10"
          data-testid={`badge-ref-kind-${id}`}
        >
          <Cpu className="w-3 h-3 mr-1" /> .NET API
        </Badge>
      );
  }
}

interface ReferenceCardProps {
  entry: ReferenceEntry;
  highlight: boolean;
}

const ReferenceCard = ({ entry, highlight }: ReferenceCardProps) => {
  // Auto-expand the details when this card is being focused via a deep
  // link. The user can still collapse it manually afterwards.
  const [open, setOpen] = useState(highlight);

  useEffect(() => {
    if (!highlight) return;
    setOpen(true);
    // Defer the scroll one frame so the Collapsible has expanded and the
    // card has its final layout height — otherwise we sometimes scroll
    // to a point that's no longer the card's position.
    const id = window.requestAnimationFrame(() => {
      const el = document.getElementById(`reference-entry-${entry.id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [highlight, entry.id]);

  const copyDeepLink = async () => {
    const url = `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}/?ids=${entry.id}`.replace(
      /\/\?/,
      "?",
    );
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Best-effort; ignore clipboard failures.
    }
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      id={`reference-entry-${entry.id}`}
      className={`rounded-lg border bg-card p-5 space-y-3 transition-colors ${
        highlight
          ? "border-primary/60 shadow-[0_0_0_1px_var(--primary)]/30"
          : "border-border"
      }`}
      data-testid={`reference-entry-${entry.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {kindBadge(entry.kind)}
            <Badge variant="secondary" className="bg-secondary/60 text-xs">
              {entry.category}
            </Badge>
          </div>
          <h3 className="text-lg font-semibold leading-tight font-mono break-all">
            {entry.name}
          </h3>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={copyDeepLink}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            title="Copy a deep-link to this entry"
            data-testid={`button-ref-link-${entry.id}`}
          >
            <LinkIcon className="w-3 h-3" />
            Link
          </button>
          <a
            href={entry.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            title="Open the canonical Microsoft Learn / PowerShell Gallery page"
            data-testid={`link-ref-external-${entry.id}`}
          >
            <ExternalLink className="w-3 h-3" />
            Docs
          </a>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-blue-300/80">
          What it is
        </div>
        <p className="text-sm text-foreground/85 leading-relaxed">
          {entry.summary}
        </p>
      </div>

      <CollapsibleTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`reference-entry-${entry.id}-details`}
          className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors py-1.5 rounded border border-dashed border-border/60 hover:border-border"
          data-testid={`button-ref-toggle-${entry.id}`}
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
          {open ? "Hide details" : "Show Intune notes, gotchas & example"}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent
        id={`reference-entry-${entry.id}-details`}
        className="space-y-4 pt-2"
        data-testid={`details-ref-${entry.id}`}
      >
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300/80">
            When to use it for Intune
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed">
            {entry.intuneNotes}
          </p>
        </div>

        {entry.gotchas.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-amber-300/80">
              Gotchas
            </div>
            <ul className="text-sm text-foreground/85 leading-relaxed list-disc pl-5 space-y-1">
              {entry.gotchas.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}

        {entry.example && (
          <div className="space-y-1.5 pt-2 border-t border-border/60 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-emerald-300/80">
              Example
            </div>
            <div
              className="rounded-md border border-emerald-500/20 overflow-hidden"
              data-testid={`code-ref-${entry.id}`}
            >
              <CodeBlock
                code={entry.example.code}
                language={entry.example.language ?? "powershell"}
              />
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

const KIND_ORDER: Record<ReferenceKind, number> = {
  "Built-in cmdlet": 0,
  "Built-in module": 1,
  "Gallery module": 2,
  ".NET API": 3,
};

export default function ReferencePage() {
  const [location] = useLocation();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "All" | ReferenceCategory
  >("All");

  // Parse the query string from window.location (wouter's base() strips it
  // from `location`). ?ids=a,b filters and highlights specific entries —
  // mirrors the Best Practices page so deep-links from the Builder behave
  // the same way users have already learned.
  const searchParams = useMemo(
    () => new URLSearchParams(window.location.search),
    // `location` triggers a re-parse when wouter updates the route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [location],
  );
  const focusedIds = useMemo(() => {
    const raw = searchParams.get("ids");
    if (!raw) return [] as string[];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [searchParams]);

  const [onlyFocused, setOnlyFocused] = useState<boolean>(focusedIds.length > 0);

  // If the URL changes to add/remove ?ids=, switch back to the focused
  // view by default — but leave the toggle alone if the user has already
  // expanded back to "Show all" within the same session.
  const prevFocusedKey = useRef<string>(focusedIds.join(","));
  useEffect(() => {
    const key = focusedIds.join(",");
    if (key !== prevFocusedKey.current) {
      prevFocusedKey.current = key;
      setOnlyFocused(focusedIds.length > 0);
    }
  }, [focusedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return referenceEntries
      .filter((e) => {
        if (categoryFilter !== "All" && e.category !== categoryFilter)
          return false;
        if (onlyFocused && focusedIds.length > 0 && !focusedIds.includes(e.id))
          return false;
        if (!q) return true;
        return (
          e.name.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.intuneNotes.toLowerCase().includes(q) ||
          e.kind.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.gotchas.some((g) => g.toLowerCase().includes(q)) ||
          (e.example?.code.toLowerCase().includes(q) ?? false)
        );
      })
      .slice()
      .sort((a, b) => {
        // Pin focused entries to the top so the user lands on them even
        // when the catalog scroll position was somewhere else.
        const aFocus = focusedIds.includes(a.id) ? 0 : 1;
        const bFocus = focusedIds.includes(b.id) ? 0 : 1;
        if (aFocus !== bFocus) return aFocus - bFocus;
        const cat = a.category.localeCompare(b.category);
        if (cat !== 0) return cat;
        const kind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
        if (kind !== 0) return kind;
        return a.name.localeCompare(b.name);
      });
  }, [query, categoryFilter, focusedIds, onlyFocused]);

  const counts = useMemo(() => {
    const byCategory: Record<string, number> = {};
    referenceEntries.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
    });
    return byCategory;
  }, []);

  // While `?ids=` is active and "Show all" is on, we still want to render
  // the catalog by category. When focused-only is on, render a flat list
  // pinned by id so the user can scan the linked entries top-to-bottom.
  const renderByCategory = categoryFilter === "All" && !onlyFocused;

  return (
    <div className="container max-w-screen-2xl py-8 flex-1">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <PackageSearch className="w-7 h-7 text-fuchsia-400" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Modules & APIs
          </h1>
        </div>
        <p className="text-muted-foreground text-lg max-w-3xl">
          A curated, opinionated tour of the PowerShell modules, built-in
          cmdlets, and .NET surfaces that come up over and over in Intune
          detection and remediation scripts. Each entry covers what it is,
          when to reach for it, the Intune-specific gotchas, and a short
          example you can copy.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, kind, gotcha, or example..."
            className="pl-9"
            aria-label="Search modules and APIs"
            data-testid="input-ref-search"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
            <Filter className="w-3 h-3" /> Category
          </span>
          {(["All", ...REFERENCE_CATEGORIES] as const).map((cat) => {
            const active = categoryFilter === cat;
            const count =
              cat === "All" ? referenceEntries.length : counts[cat] ?? 0;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                aria-pressed={active}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${
                  active
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "bg-background/40 text-muted-foreground border-border hover:text-foreground"
                }`}
                data-testid={`button-ref-category-${cat
                  .toLowerCase()
                  .replace(/\s+/g, "-")
                  .replace(/&/g, "and")}`}
              >
                {cat}
                <span className="text-[10px] text-muted-foreground/70">
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
        {focusedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs pt-1 border-t border-border/60">
            <span className="text-muted-foreground">
              Linked · {focusedIds.length}{" "}
              {focusedIds.length === 1 ? "entry" : "entries"}
            </span>
            <button
              type="button"
              onClick={() => setOnlyFocused((v) => !v)}
              className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border transition-colors ${
                onlyFocused
                  ? "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40"
                  : "bg-background/40 text-muted-foreground border-border hover:text-foreground"
              }`}
              data-testid="button-ref-toggle-focused"
            >
              {onlyFocused ? "Showing only linked" : "Show all"}
            </button>
          </div>
        )}
      </div>

      <div
        className="text-xs text-muted-foreground mb-3"
        data-testid="text-ref-count"
      >
        Showing {filtered.length} of {referenceEntries.length} entries
      </div>

      <div className="space-y-6">
        {filtered.length === 0 ? (
          <div
            className="text-center text-muted-foreground py-12 border border-dashed border-border rounded-lg"
            data-testid="empty-ref-results"
          >
            No entries match your filters.
          </div>
        ) : renderByCategory ? (
          // Group entries by category with section headers so the
          // catalog reads top-to-bottom as a structured reference,
          // not a flat list.
          REFERENCE_CATEGORIES.filter((cat) =>
            filtered.some((e) => e.category === cat),
          ).map((cat) => {
            const inCat = filtered.filter((e) => e.category === cat);
            return (
              <section
                key={cat}
                className="space-y-3"
                data-testid={`section-ref-${cat
                  .toLowerCase()
                  .replace(/\s+/g, "-")
                  .replace(/&/g, "and")}`}
              >
                <div className="flex items-center gap-2 pt-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {cat}
                  </h2>
                  <span className="text-[10px] text-muted-foreground/70">
                    ({inCat.length})
                  </span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
                <div className="space-y-4">
                  {inCat.map((e, idx) => (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.2,
                        delay: Math.min(idx * 0.03, 0.3),
                      }}
                    >
                      <ReferenceCard
                        entry={e}
                        highlight={focusedIds.includes(e.id)}
                      />
                    </motion.div>
                  ))}
                </div>
              </section>
            );
          })
        ) : (
          <div className="space-y-4">
            {filtered.map((e, idx) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
              >
                <ReferenceCard
                  entry={e}
                  highlight={focusedIds.includes(e.id)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 text-center text-xs text-muted-foreground/70 italic flex items-center justify-center gap-1">
        Have a module or cmdlet not listed? Add it to
        <code className="text-foreground/70">src/data/modules-reference.ts</code>
        <ChevronRight className="w-3 h-3" />
      </div>
    </div>
  );
}
