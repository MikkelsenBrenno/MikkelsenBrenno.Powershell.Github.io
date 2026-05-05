import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { BookOpen, Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { tokenize, type Token } from "@/lib/powershell/tokenizer";
import { lookupCmdlet } from "@/lib/powershell/cmdlet-reference";
import { lookupReferenceEntryByCmdlet } from "@/data/modules-reference-map";

interface CodeBlockProps {
  code: string;
  language?: string;
  disabled?: boolean;
  disabledReason?: string;
  blockId?: string;
}

function tokenClass(t: Token["type"]): string {
  switch (t) {
    case "comment":
      return "text-emerald-400/80 italic";
    case "string":
      return "text-amber-200";
    case "variable":
      return "text-cyan-300";
    case "parameter":
      return "text-fuchsia-300";
    case "cmdlet":
      return "text-blue-300 font-semibold";
    case "number":
      return "text-orange-200";
    case "operator":
      return "text-blue-200/70";
    case "newline":
      return "";
    case "text":
    default:
      return "text-blue-200";
  }
}

// Cmdlet token with tooltip + Microsoft Learn link + (optional) deep-link
// into the in-app Modules & APIs catalog. The catalog link is only rendered
// when `lookupReferenceEntryByCmdlet` finds a matching curated entry.
function CmdletToken({ token }: { token: Token }) {
  const info = lookupCmdlet(token.value);
  const refEntry = lookupReferenceEntryByCmdlet(token.value);
  if (!info && !refEntry) {
    return <span className={tokenClass("cmdlet")}>{token.value}</span>;
  }
  // Pretty title falls back to the actual cmdlet spelling when we don't
  // have a CmdletInfo blurb (rare — usually one or the other exists).
  const title = info?.name ?? token.value;
  const description = info?.description;
  const learnUrl = info?.learnUrl;

  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <span
          className={`${tokenClass("cmdlet")} underline decoration-dotted decoration-blue-300/50 underline-offset-4 cursor-help`}
          data-testid={`cmdlet-token-${title}`}
        >
          {token.value}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-sm space-y-1.5 bg-popover text-popover-foreground border border-border p-3"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-semibold text-blue-300">{title}</span>
          {info?.dangerous && (
            <span className="text-[9px] uppercase tracking-wider rounded px-1.5 py-0.5 border border-amber-500/40 bg-amber-500/10 text-amber-300">
              mutates state
            </span>
          )}
          {refEntry && (
            <span className="text-[9px] uppercase tracking-wider rounded px-1.5 py-0.5 border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300">
              in catalog
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-foreground/90 leading-snug">{description}</p>
        )}
        <div className="flex flex-col gap-1 pt-0.5">
          {refEntry && (
            <Link
              href={`/reference?ids=${refEntry.id}`}
              className="inline-flex items-center gap-1 text-[11px] text-fuchsia-300 hover:underline"
              data-testid={`cmdlet-catalog-link-${title}`}
            >
              <BookOpen className="w-3 h-3" />
              Open <span className="font-mono">{refEntry.name}</span> in Modules & APIs
            </Link>
          )}
          {learnUrl && (
            <a
              href={learnUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              data-testid={`cmdlet-learn-link-${title}`}
            >
              Learn more on Microsoft Learn
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// Render one `<span data-line={n}>` per source line, grouped by the
// tokenizer's `t.line` so renderer and linter agree on line numbers.
function renderTokens(code: string): ReactNode[] {
  const tokens = tokenize(code);
  let maxLine = 1;
  const byLine = new Map<number, Token[]>();
  for (const t of tokens) {
    if (t.line > maxLine) maxLine = t.line;
    if (t.type === "newline") continue;
    const arr = byLine.get(t.line) ?? [];
    arr.push(t);
    byLine.set(t.line, arr);
  }

  const out: ReactNode[] = [];
  let nodeKey = 0;
  for (let ln = 1; ln <= maxLine; ln += 1) {
    const lineToks = byLine.get(ln) ?? [];
    const children: ReactNode[] = [];
    for (const t of lineToks) {
      if (
        t.type === "cmdlet" &&
        (lookupCmdlet(t.value) || lookupReferenceEntryByCmdlet(t.value))
      ) {
        children.push(<CmdletToken key={nodeKey++} token={t} />);
        continue;
      }
      children.push(
        <span key={nodeKey++} className={tokenClass(t.type)}>
          {t.value}
        </span>
      );
    }
    out.push(
      <span key={`line-${ln}`} data-line={ln} className="block">
        {children.length ? children : "\u200b"}
      </span>
    );
    if (ln < maxLine) out.push("\n");
  }
  return out;
}

// Scroll the named code block to a source line and briefly flash it.
export function scrollToCodeLine(blockId: string, line: number): void {
  if (typeof document === "undefined") return;
  const root = document.querySelector(`[data-codeblock-id="${blockId}"]`);
  if (!root) return;
  const el = root.querySelector(`[data-line="${line}"]`) as HTMLElement | null;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("code-line-flash");
  window.setTimeout(() => {
    el.classList.remove("code-line-flash");
  }, 1500);
}

export function CodeBlock({
  code,
  language = "powershell",
  disabled = false,
  disabledReason,
  blockId,
}: CodeBlockProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Skip tokenization for non-PowerShell content (notes, test commands).
  const rendered = useMemo<ReactNode>(() => {
    if (language !== "powershell") return code;
    return renderTokens(code);
  }, [code, language]);

  const copyToClipboard = () => {
    if (disabled) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Code copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="relative group rounded-md bg-[#0d1117] border border-border overflow-hidden"
      data-codeblock-id={blockId}
    >
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <Button
          variant="secondary"
          size="sm"
          className="h-8 bg-secondary/80 hover:bg-secondary text-secondary-foreground font-mono text-xs"
          onClick={copyToClipboard}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          data-testid="button-copy-code"
        >
          {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="overflow-x-auto p-4 pt-10 font-mono text-sm leading-relaxed text-blue-200">
        <pre>
          <code>{rendered}</code>
        </pre>
      </div>
    </div>
  );
}
