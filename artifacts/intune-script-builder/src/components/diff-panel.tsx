import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Maximize2,
  Minimize2,
  Plus,
  Minus,
  Rows,
  Columns,
  WrapText,
  AlignJustify,
} from "lucide-react";

import {
  diffLines,
  groupHunks,
  pairChangesForHunk,
  summarizeDiff,
  toUnifiedText,
  type CharDiffResult,
  type DiffRow,
  type DiffSection,
} from "@/lib/powershell/diff";
import { tokenize, type Token } from "@/lib/powershell/tokenizer";

interface DiffPanelProps {
  leftLabel: string;
  rightLabel: string;
  left: string;
  right: string;
}

type ViewMode = "split" | "unified";

const STORAGE_KEY_VIEW = "intune-builder.diff.view";
const STORAGE_KEY_WRAP = "intune-builder.diff.wrap";
const STORAGE_KEY_SHOWALL = "intune-builder.diff.showAll";
const CONTEXT_LINES = 3;

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

function readSession<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeSession<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / disabled storage
  }
}

// Index tokens by source line (1-based) for fast per-row rendering.
function tokensByLine(source: string): Map<number, Token[]> {
  const tokens = tokenize(source);
  const byLine = new Map<number, Token[]>();
  for (const t of tokens) {
    if (t.type === "newline") continue;
    const arr = byLine.get(t.line) ?? [];
    arr.push(t);
    byLine.set(t.line, arr);
  }
  return byLine;
}

interface RenderedLineProps {
  text: string;
  tokens: Token[] | undefined;
  changedMask?: boolean[];
  changedHighlightClass: string;
  wrap: boolean;
}

/**
 * Render a single source line with PowerShell syntax highlighting and an
 * optional intra-line "changed character" highlight overlay.
 *
 * Splits each token at column boundaries where the changed-mask flips so
 * that the inner highlight respects token coloring.
 */
function RenderedLine({
  text,
  tokens,
  changedMask,
  changedHighlightClass,
  wrap,
}: RenderedLineProps) {
  // `whitespace-pre-wrap` already wraps at whitespace and preserves
  // indentation. Intentionally no `break-words` / `break-all` so PowerShell
  // tokens (cmdlet names, paths, registry keys) stay on one piece.
  const wrapClass = wrap ? "whitespace-pre-wrap break-normal" : "whitespace-pre";

  // Empty line — render a zero-width space so the row keeps height.
  if (text.length === 0) {
    return <span className={wrapClass}>{"\u200b"}</span>;
  }

  // Reconstruct a column-indexed slice using token boundaries when we
  // have them; otherwise fall back to a single uncolored span.
  type Segment = { text: string; cls: string; col: number };
  const segments: Segment[] = [];
  if (tokens && tokens.length > 0) {
    // Tokens are in source-position order. Their `start` is the absolute
    // source offset; convert to the column inside this line using the
    // first token's start as the line origin.
    const lineOrigin = tokens[0].start - columnOf(tokens[0], text);
    for (const t of tokens) {
      const col = t.start - lineOrigin;
      segments.push({ text: t.value, cls: tokenClass(t.type), col });
    }
    // Fill any gaps between tokens (whitespace, etc.) with raw text so
    // the rendered line equals `text` exactly.
    const filled: Segment[] = [];
    let cursor = 0;
    for (const seg of segments) {
      if (seg.col > cursor) {
        filled.push({
          text: text.slice(cursor, seg.col),
          cls: tokenClass("text"),
          col: cursor,
        });
      }
      filled.push(seg);
      cursor = seg.col + seg.text.length;
    }
    if (cursor < text.length) {
      filled.push({
        text: text.slice(cursor),
        cls: tokenClass("text"),
        col: cursor,
      });
    }
    segments.splice(0, segments.length, ...filled);
  } else {
    segments.push({ text, cls: tokenClass("text"), col: 0 });
  }

  // Now split each segment at every position where `changedMask` flips.
  const out: React.ReactNode[] = [];
  let key = 0;
  for (const seg of segments) {
    if (!changedMask) {
      out.push(
        <span key={key++} className={seg.cls}>
          {seg.text}
        </span>
      );
      continue;
    }
    let start = 0;
    let curChanged = !!changedMask[seg.col];
    for (let i = 1; i <= seg.text.length; i += 1) {
      const col = seg.col + i;
      const next = i < seg.text.length ? !!changedMask[col] : !curChanged;
      if (next !== curChanged || i === seg.text.length) {
        const piece = seg.text.slice(start, i);
        const cls = curChanged
          ? `${seg.cls} ${changedHighlightClass}`
          : seg.cls;
        out.push(
          <span key={key++} className={cls}>
            {piece}
          </span>
        );
        start = i;
        curChanged = next;
      }
    }
  }
  return <span className={wrapClass}>{out}</span>;
}

// Helper: with the given line text and the first token of the line, work out
// what column that token sits at. Tokens carry absolute source offsets, but
// we want a per-line column. We do this by noting the leading whitespace
// length up to the first token's value within `text`.
function columnOf(firstToken: Token, lineText: string): number {
  // Find where `firstToken.value` first appears in lineText. For most lines
  // this is at column 0 (first token starts the line) or at the indent
  // amount. This is robust to both leading whitespace tokens and not.
  if (firstToken.type === "text") return 0; // leading whitespace already at col 0
  const idx = lineText.indexOf(firstToken.value);
  return idx >= 0 ? idx : 0;
}

interface SplitRowProps {
  row: DiffRow;
  leftTokens: Map<number, Token[]>;
  rightTokens: Map<number, Token[]>;
  charDiff: CharDiffResult | undefined;
  wrap: boolean;
  rowIndex: number;
  isJumpTarget: boolean;
  registerChangeRef: (rowIndex: number, el: HTMLTableRowElement | null) => void;
}

function SplitRow({
  row,
  leftTokens,
  rightTokens,
  charDiff,
  wrap,
  rowIndex,
  isJumpTarget,
  registerChangeRef,
}: SplitRowProps) {
  const isChange = row.op !== "equal";
  const leftBg =
    row.op === "remove"
      ? "bg-red-500/10 border-l-2 border-red-400/60"
      : row.op === "add"
        ? "bg-secondary/20"
        : "";
  const rightBg =
    row.op === "add"
      ? "bg-emerald-500/10 border-l-2 border-emerald-400/60"
      : row.op === "remove"
        ? "bg-secondary/20"
        : "";

  const ringCls = isJumpTarget ? "outline outline-1 outline-primary/60" : "";
  return (
    <tr
      ref={(el) => {
        if (isChange) registerChangeRef(rowIndex, el);
      }}
      data-testid={`diff-row-${rowIndex}`}
      data-change={isChange ? "true" : undefined}
      data-jump-target={isJumpTarget ? "true" : undefined}
      className={ringCls}
    >
      <td className="text-right pr-2 text-muted-foreground/50 align-top select-none sticky left-0 bg-[#0d1117] z-[1]">
        {row.left ?? ""}
      </td>
      <td className={`align-top ${leftBg} pl-1`}>
        <span className="inline-flex items-center justify-center w-3 text-red-400">
          {row.op === "remove" ? <Minus className="w-3 h-3" /> : null}
        </span>
      </td>
      <td className={`align-top px-2 ${leftBg}`}>
        {row.leftText != null ? (
          <RenderedLine
            text={row.leftText}
            tokens={row.left ? leftTokens.get(row.left) : undefined}
            changedMask={row.op === "remove" ? charDiff?.leftChanged : undefined}
            changedHighlightClass="bg-red-500/30 rounded-sm"
            wrap={wrap}
          />
        ) : null}
      </td>
      <td className="text-right pr-2 text-muted-foreground/50 align-top select-none border-l border-border/60">
        {row.right ?? ""}
      </td>
      <td className={`align-top ${rightBg} pl-1`}>
        <span className="inline-flex items-center justify-center w-3 text-emerald-400">
          {row.op === "add" ? <Plus className="w-3 h-3" /> : null}
        </span>
      </td>
      <td className={`align-top px-2 ${rightBg}`}>
        {row.rightText != null ? (
          <RenderedLine
            text={row.rightText}
            tokens={row.right ? rightTokens.get(row.right) : undefined}
            changedMask={row.op === "add" ? charDiff?.rightChanged : undefined}
            changedHighlightClass="bg-emerald-500/30 rounded-sm"
            wrap={wrap}
          />
        ) : null}
      </td>
    </tr>
  );
}

interface UnifiedRowProps {
  row: DiffRow;
  leftTokens: Map<number, Token[]>;
  rightTokens: Map<number, Token[]>;
  charDiff: CharDiffResult | undefined;
  wrap: boolean;
  rowIndex: number;
  isJumpTarget: boolean;
  registerChangeRef: (rowIndex: number, el: HTMLTableRowElement | null) => void;
}

function UnifiedRow({
  row,
  leftTokens,
  rightTokens,
  charDiff,
  wrap,
  rowIndex,
  isJumpTarget,
  registerChangeRef,
}: UnifiedRowProps) {
  const isChange = row.op !== "equal";
  const bg =
    row.op === "add"
      ? "bg-emerald-500/10 border-l-2 border-emerald-400/60"
      : row.op === "remove"
        ? "bg-red-500/10 border-l-2 border-red-400/60"
        : "";
  const sign =
    row.op === "add" ? (
      <Plus className="w-3 h-3 text-emerald-400" />
    ) : row.op === "remove" ? (
      <Minus className="w-3 h-3 text-red-400" />
    ) : null;
  const text = row.op === "add" ? row.rightText ?? "" : row.leftText ?? "";
  const tokens =
    row.op === "add"
      ? row.right
        ? rightTokens.get(row.right)
        : undefined
      : row.left
        ? leftTokens.get(row.left)
        : undefined;
  const changedMask =
    row.op === "add"
      ? charDiff?.rightChanged
      : row.op === "remove"
        ? charDiff?.leftChanged
        : undefined;
  const highlightCls =
    row.op === "add" ? "bg-emerald-500/30 rounded-sm" : "bg-red-500/30 rounded-sm";

  const ringCls = isJumpTarget ? "outline outline-1 outline-primary/60" : "";
  return (
    <tr
      ref={(el) => {
        if (isChange) registerChangeRef(rowIndex, el);
      }}
      data-testid={`diff-row-${rowIndex}`}
      data-change={isChange ? "true" : undefined}
      data-jump-target={isJumpTarget ? "true" : undefined}
      className={ringCls}
    >
      <td className="text-right pr-2 text-muted-foreground/50 align-top select-none sticky left-0 bg-[#0d1117] z-[1]">
        {row.left ?? ""}
      </td>
      <td className="text-right pr-2 text-muted-foreground/50 align-top select-none">
        {row.right ?? ""}
      </td>
      <td className={`align-top ${bg} pl-1`}>
        <span className="inline-flex items-center justify-center w-3">{sign}</span>
      </td>
      <td className={`align-top px-2 ${bg}`}>
        <RenderedLine
          text={text}
          tokens={tokens}
          changedMask={changedMask}
          changedHighlightClass={highlightCls}
          wrap={wrap}
        />
      </td>
    </tr>
  );
}

export function DiffPanel({ leftLabel, rightLabel, left, right }: DiffPanelProps) {
  const rows = useMemo(() => diffLines(left, right), [left, right]);
  const summary = useMemo(() => summarizeDiff(rows), [rows]);

  const [view, setView] = useState<ViewMode>(() =>
    readSession<ViewMode>(STORAGE_KEY_VIEW, "split")
  );
  const [wrap, setWrap] = useState<boolean>(() =>
    readSession<boolean>(STORAGE_KEY_WRAP, true)
  );
  const [showAll, setShowAll] = useState<boolean>(() =>
    readSession<boolean>(STORAGE_KEY_SHOWALL, false)
  );
  const [expandedSkips, setExpandedSkips] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => writeSession(STORAGE_KEY_VIEW, view), [view]);
  useEffect(() => writeSession(STORAGE_KEY_WRAP, wrap), [wrap]);
  useEffect(() => writeSession(STORAGE_KEY_SHOWALL, showAll), [showAll]);

  // Reset per-section expand state when the underlying scripts change.
  useEffect(() => {
    setExpandedSkips(new Set());
  }, [left, right]);

  const sections: DiffSection[] = useMemo(() => {
    if (showAll) {
      return [{ kind: "hunk", rows, startIndex: 0 } satisfies DiffSection];
    }
    return groupHunks(rows, CONTEXT_LINES);
  }, [rows, showAll]);

  const leftTokens = useMemo(() => tokensByLine(left), [left]);
  const rightTokens = useMemo(() => tokensByLine(right), [right]);

  // Pre-compute char-diff per hunk so paired add/remove rows can highlight
  // the specific characters that differ.
  const charDiffByRowIndex = useMemo(() => {
    const map = new Map<number, CharDiffResult>();
    for (const sec of sections) {
      if (sec.kind !== "hunk") continue;
      const local = pairChangesForHunk(sec.rows);
      local.forEach((cd, localIdx) => {
        map.set(sec.startIndex + localIdx, cd);
      });
    }
    return map;
  }, [sections]);

  // Refs to every visible "change" row so we can prev/next-jump through them.
  const changeRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [activeChange, setActiveChange] = useState(0);
  const visibleChangeRows = useMemo(() => {
    const out: number[] = [];
    sections.forEach((sec) => {
      if (sec.kind !== "hunk") return;
      sec.rows.forEach((r, i) => {
        if (r.op !== "equal") out.push(sec.startIndex + i);
      });
    });
    return out;
  }, [sections]);

  useEffect(() => {
    setActiveChange(0);
  }, [visibleChangeRows.length]);

  const registerChangeRef = useCallback(
    (rowIndex: number, el: HTMLTableRowElement | null) => {
      if (el) changeRefs.current.set(rowIndex, el);
      else changeRefs.current.delete(rowIndex);
    },
    []
  );

  const jump = useCallback(
    (delta: number) => {
      if (visibleChangeRows.length === 0) return;
      const next =
        (activeChange + delta + visibleChangeRows.length) %
        visibleChangeRows.length;
      setActiveChange(next);
      const rowIdx = visibleChangeRows[next];
      const el = changeRefs.current.get(rowIdx);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [activeChange, visibleChangeRows]
  );

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(toUnifiedText(rows, leftLabel, rightLabel));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // best-effort
    }
  }, [rows, leftLabel, rightLabel]);

  const expandSkip = useCallback((startIndex: number) => {
    setExpandedSkips((prev) => {
      const next = new Set(prev);
      next.add(startIndex);
      return next;
    });
  }, []);

  const collapseAllSkips = useCallback(() => setExpandedSkips(new Set()), []);

  const allEqual = summary.added === 0 && summary.removed === 0;

  // ----- toolbar buttons (shared) -----
  const toolbarBtn =
    "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60";
  const toolbarBtnActive =
    "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-primary/50 bg-primary/15 text-primary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60";

  return (
    <div className="h-full flex flex-col bg-[#0d1117] border border-border rounded-md overflow-hidden">
      {/* Toolbar */}
      <div className="border-b border-border p-2 flex flex-wrap items-center gap-2">
        <div className="text-xs font-semibold mr-1">
          {leftLabel} <span className="text-muted-foreground">vs</span> {rightLabel}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
          <span
            className="px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            data-testid="diff-summary-added"
          >
            +{summary.added}
          </span>
          <span
            className="px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-300"
            data-testid="diff-summary-removed"
          >
            -{summary.removed}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-border text-muted-foreground">
            ={summary.unchanged}
          </span>
        </div>

        {/* View toggle */}
        <div className="ml-2 inline-flex rounded border border-border/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setView("split")}
            className={`px-2 py-1 text-[11px] inline-flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 ${
              view === "split"
                ? "bg-primary/15 text-primary"
                : "bg-background/40 text-muted-foreground hover:text-foreground"
            }`}
            data-testid="button-diff-view-split"
            title="Side-by-side view"
          >
            <Columns className="w-3 h-3" /> Split
          </button>
          <button
            type="button"
            onClick={() => setView("unified")}
            className={`px-2 py-1 text-[11px] inline-flex items-center gap-1 border-l border-border/60 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 ${
              view === "unified"
                ? "bg-primary/15 text-primary"
                : "bg-background/40 text-muted-foreground hover:text-foreground"
            }`}
            data-testid="button-diff-view-unified"
            title="Unified view"
          >
            <Rows className="w-3 h-3" /> Unified
          </button>
        </div>

        {/* Prev/Next change */}
        <div className="inline-flex items-center gap-1 ml-1">
          <button
            type="button"
            onClick={() => jump(-1)}
            disabled={visibleChangeRows.length === 0}
            className={toolbarBtn}
            title="Previous change"
            data-testid="button-diff-prev-change"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => jump(1)}
            disabled={visibleChangeRows.length === 0}
            className={toolbarBtn}
            title="Next change"
            data-testid="button-diff-next-change"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          <span className="text-[10px] text-muted-foreground/70 tabular-nums">
            {visibleChangeRows.length === 0
              ? "0 / 0"
              : `${activeChange + 1} / ${visibleChangeRows.length}`}
          </span>
        </div>

        {/* Wrap toggle */}
        <button
          type="button"
          onClick={() => setWrap((v) => !v)}
          className={wrap ? toolbarBtnActive : toolbarBtn}
          title={wrap ? "Wrap is on (click to scroll instead)" : "Wrap is off (click to wrap long lines)"}
          data-testid="button-diff-wrap"
        >
          {wrap ? <WrapText className="w-3 h-3" /> : <AlignJustify className="w-3 h-3" />}
          Wrap
        </button>

        {/* Show all / show changes */}
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className={showAll ? toolbarBtnActive : toolbarBtn}
          title={showAll ? "Showing every line" : "Showing changes + context only"}
          data-testid="button-diff-show-all"
        >
          {showAll ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          {showAll ? "Show changes" : "Show all lines"}
        </button>

        {!showAll && expandedSkips.size > 0 && (
          <button
            type="button"
            onClick={collapseAllSkips}
            className={toolbarBtn}
            title="Recollapse expanded sections"
            data-testid="button-diff-recollapse"
          >
            Collapse expanded
          </button>
        )}

        {/* Copy diff */}
        <button
          type="button"
          onClick={onCopy}
          className={toolbarBtn + " ml-auto"}
          title="Copy unified diff to clipboard"
          data-testid="button-diff-copy"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy diff"}
        </button>
      </div>

      {/* Sticky pane headers (hidden in unified mode) */}
      {view === "split" ? (
        <div className="grid grid-cols-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-border bg-secondary/20 sticky top-0 z-[2]">
          <div className="px-3 py-1.5 border-r border-border" data-testid="diff-header-left">
            {leftLabel}
          </div>
          <div className="px-3 py-1.5" data-testid="diff-header-right">
            {rightLabel}
          </div>
        </div>
      ) : (
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-border bg-secondary/20 px-3 py-1.5 sticky top-0 z-[2]">
          Unified — {leftLabel} → {rightLabel}
        </div>
      )}

      <div className="flex-1 overflow-auto custom-scrollbar font-mono text-xs leading-relaxed">
        {allEqual ? (
          <div className="h-full flex items-center justify-center text-center text-muted-foreground p-8">
            <div>
              <div className="text-sm font-semibold text-foreground/80 mb-1">
                No differences
              </div>
              <div className="text-xs">
                {leftLabel} and {rightLabel} are identical.
              </div>
            </div>
          </div>
        ) : view === "split" ? (
          <table
            className="w-full border-collapse"
            style={{ tableLayout: wrap ? "fixed" : "auto" }}
            data-testid="diff-table-split"
          >
            <colgroup>
              <col style={{ width: "3rem" }} />
              <col style={{ width: "1.25rem" }} />
              <col style={wrap ? { width: "calc(50% - 2.125rem)" } : undefined} />
              <col style={{ width: "3rem" }} />
              <col style={{ width: "1.25rem" }} />
              <col style={wrap ? { width: "calc(50% - 2.125rem)" } : undefined} />
            </colgroup>
            <tbody>
              {sections.map((sec, sIdx) =>
                sec.kind === "hunk" ? (
                  <Fragment key={`h-${sIdx}-${sec.startIndex}`}>
                    {sec.rows.map((row, i) => {
                      const rowIdx = sec.startIndex + i;
                      const isJumpTarget =
                        row.op !== "equal" &&
                        visibleChangeRows[activeChange] === rowIdx;
                      return (
                        <SplitRow
                          key={rowIdx}
                          row={row}
                          leftTokens={leftTokens}
                          rightTokens={rightTokens}
                          charDiff={charDiffByRowIndex.get(rowIdx)}
                          wrap={wrap}
                          rowIndex={rowIdx}
                          isJumpTarget={isJumpTarget}
                          registerChangeRef={registerChangeRef}
                        />
                      );
                    })}
                  </Fragment>
                ) : expandedSkips.has(sec.startIndex) ? (
                  <Fragment key={`s-${sIdx}-${sec.startIndex}`}>
                    {sec.hiddenRows.map((row, i) => {
                      const rowIdx = sec.startIndex + i;
                      return (
                        <SplitRow
                          key={rowIdx}
                          row={row}
                          leftTokens={leftTokens}
                          rightTokens={rightTokens}
                          charDiff={undefined}
                          wrap={wrap}
                          rowIndex={rowIdx}
                          isJumpTarget={false}
                          registerChangeRef={registerChangeRef}
                        />
                      );
                    })}
                  </Fragment>
                ) : (
                  <tr key={`s-${sIdx}-${sec.startIndex}`}>
                    <td colSpan={6} className="p-0">
                      <SkipBar
                        count={sec.hiddenRows.length}
                        onExpand={() => expandSkip(sec.startIndex)}
                      />
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        ) : (
          <table
            className="w-full border-collapse"
            style={{ tableLayout: wrap ? "fixed" : "auto" }}
            data-testid="diff-table-unified"
          >
            <colgroup>
              <col style={{ width: "3rem" }} />
              <col style={{ width: "3rem" }} />
              <col style={{ width: "1.25rem" }} />
              <col />
            </colgroup>
            <tbody>
              {sections.map((sec, sIdx) =>
                sec.kind === "hunk" ? (
                  <Fragment key={`uh-${sIdx}-${sec.startIndex}`}>
                    {sec.rows.map((row, i) => {
                      const rowIdx = sec.startIndex + i;
                      const isJumpTarget =
                        row.op !== "equal" &&
                        visibleChangeRows[activeChange] === rowIdx;
                      return (
                        <UnifiedRow
                          key={rowIdx}
                          row={row}
                          leftTokens={leftTokens}
                          rightTokens={rightTokens}
                          charDiff={charDiffByRowIndex.get(rowIdx)}
                          wrap={wrap}
                          rowIndex={rowIdx}
                          isJumpTarget={isJumpTarget}
                          registerChangeRef={registerChangeRef}
                        />
                      );
                    })}
                  </Fragment>
                ) : expandedSkips.has(sec.startIndex) ? (
                  <Fragment key={`us-${sIdx}-${sec.startIndex}`}>
                    {sec.hiddenRows.map((row, i) => {
                      const rowIdx = sec.startIndex + i;
                      return (
                        <UnifiedRow
                          key={rowIdx}
                          row={row}
                          leftTokens={leftTokens}
                          rightTokens={rightTokens}
                          charDiff={undefined}
                          wrap={wrap}
                          rowIndex={rowIdx}
                          isJumpTarget={false}
                          registerChangeRef={registerChangeRef}
                        />
                      );
                    })}
                  </Fragment>
                ) : (
                  <tr key={`us-${sIdx}-${sec.startIndex}`}>
                    <td colSpan={4} className="p-0">
                      <SkipBar
                        count={sec.hiddenRows.length}
                        onExpand={() => expandSkip(sec.startIndex)}
                      />
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SkipBar({ count, onExpand }: { count: number; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="w-full flex items-center justify-center gap-2 py-1.5 text-[11px] text-muted-foreground/80 hover:text-foreground bg-secondary/15 hover:bg-secondary/30 border-y border-border/40 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60"
      data-testid="button-diff-expand-skip"
    >
      <span className="h-px flex-1 bg-border/60" />
      <span>… {count} unchanged line{count === 1 ? "" : "s"} · click to expand</span>
      <span className="h-px flex-1 bg-border/60" />
    </button>
  );
}
