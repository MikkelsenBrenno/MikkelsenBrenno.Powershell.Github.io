// Line-level LCS diff for the side-by-side Diff view, plus helpers for
// grouping rows into hunks (with context), character-level intra-line
// diffing, and serializing to a unified-diff text blob for copy/share.

export type DiffOp = "equal" | "add" | "remove";

export interface DiffRow {
  left: number | null;
  right: number | null;
  leftText: string | null;
  rightText: string | null;
  op: DiffOp;
}

function lcs(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) t[i][j] = t[i + 1][j + 1] + 1;
      else t[i][j] = Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  return t;
}

export function diffLines(left: string, right: string): DiffRow[] {
  const a = left.split("\n");
  const b = right.split("\n");
  const t = lcs(a, b);
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ left: i + 1, right: j + 1, leftText: a[i], rightText: b[j], op: "equal" });
      i += 1;
      j += 1;
    } else if (t[i + 1][j] >= t[i][j + 1]) {
      rows.push({ left: i + 1, right: null, leftText: a[i], rightText: null, op: "remove" });
      i += 1;
    } else {
      rows.push({ left: null, right: j + 1, leftText: null, rightText: b[j], op: "add" });
      j += 1;
    }
  }
  while (i < a.length) {
    rows.push({ left: i + 1, right: null, leftText: a[i], rightText: null, op: "remove" });
    i += 1;
  }
  while (j < b.length) {
    rows.push({ left: null, right: j + 1, leftText: null, rightText: b[j], op: "add" });
    j += 1;
  }
  return rows;
}

export interface DiffSummary {
  added: number;
  removed: number;
  unchanged: number;
}

export function summarizeDiff(rows: DiffRow[]): DiffSummary {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const r of rows) {
    if (r.op === "add") added += 1;
    else if (r.op === "remove") removed += 1;
    else unchanged += 1;
  }
  return { added, removed, unchanged };
}

// ---------------------------------------------------------------------------
// Hunk grouping — collapse long equal runs into "… N unchanged lines …"
// sections so the user sees changes in context, not buried in a wall of
// untouched script.
// ---------------------------------------------------------------------------

export interface DiffHunkSection {
  kind: "hunk";
  rows: DiffRow[];
  // Index of the first row in the original `rows` array (handy for refs).
  startIndex: number;
}

export interface DiffSkipSection {
  kind: "skip";
  hiddenRows: DiffRow[];
  startIndex: number;
}

export type DiffSection = DiffHunkSection | DiffSkipSection;

/**
 * Group a flat row list into alternating "hunk" (with context) and "skip"
 * (collapsed equal runs) sections.
 *
 * `context` is the number of equal lines kept on each side of a change.
 * Equal runs of length `<= 2 * context` are kept whole and merged into
 * the surrounding hunk; longer runs are split into trailing-context +
 * skip + leading-context.
 */
export function groupHunks(rows: DiffRow[], context = 3): DiffSection[] {
  const sections: DiffSection[] = [];
  if (rows.length === 0) return sections;

  // Find indexes of all changed rows.
  const changeIdx: number[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].op !== "equal") changeIdx.push(i);
  }
  if (changeIdx.length === 0) {
    sections.push({ kind: "skip", hiddenRows: rows.slice(), startIndex: 0 });
    return sections;
  }

  // Walk the row list, pulling a window around each change and stitching
  // adjacent windows together when their context overlaps.
  let cursor = 0;
  let hunkStart = -1;
  let hunkEnd = -1;

  const flushHunk = () => {
    if (hunkStart === -1) return;
    // Emit any skip section between cursor and hunkStart.
    if (hunkStart > cursor) {
      sections.push({
        kind: "skip",
        hiddenRows: rows.slice(cursor, hunkStart),
        startIndex: cursor,
      });
    }
    sections.push({
      kind: "hunk",
      rows: rows.slice(hunkStart, hunkEnd + 1),
      startIndex: hunkStart,
    });
    cursor = hunkEnd + 1;
    hunkStart = -1;
    hunkEnd = -1;
  };

  for (const idx of changeIdx) {
    const winStart = Math.max(cursor, idx - context);
    const winEnd = Math.min(rows.length - 1, idx + context);
    if (hunkStart === -1) {
      hunkStart = winStart;
      hunkEnd = winEnd;
    } else if (winStart <= hunkEnd + 1) {
      // Overlapping or touching — extend the current hunk.
      hunkEnd = Math.max(hunkEnd, winEnd);
    } else {
      flushHunk();
      hunkStart = winStart;
      hunkEnd = winEnd;
    }
  }
  flushHunk();

  // Trailing equal tail.
  if (cursor < rows.length) {
    sections.push({
      kind: "skip",
      hiddenRows: rows.slice(cursor),
      startIndex: cursor,
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Character-level diff for paired add/remove lines, used to highlight the
// specific chars that changed inside a row (e.g. `-eq '1'` -> `-eq '0'`).
// ---------------------------------------------------------------------------

export interface CharDiffResult {
  leftChanged: boolean[]; // length = left.length
  rightChanged: boolean[]; // length = right.length
}

function lcsChars(a: string, b: string): number[][] {
  const n = a.length;
  const m = b.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) t[i][j] = t[i + 1][j + 1] + 1;
      else t[i][j] = Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  return t;
}

export function diffChars(left: string, right: string): CharDiffResult {
  const leftChanged = new Array(left.length).fill(false);
  const rightChanged = new Array(right.length).fill(false);
  // Skip the heavy O(n*m) work when one side is empty.
  if (!left.length || !right.length) {
    return {
      leftChanged: leftChanged.map(() => true),
      rightChanged: rightChanged.map(() => true),
    };
  }
  // Cap the work for pathologically long lines — over the cap we just say
  // the entire line changed, which is no worse than today's behavior.
  if (left.length * right.length > 250_000) {
    return {
      leftChanged: leftChanged.map(() => true),
      rightChanged: rightChanged.map(() => true),
    };
  }
  const t = lcsChars(left, right);
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
    } else if (t[i + 1][j] >= t[i][j + 1]) {
      leftChanged[i] = true;
      i += 1;
    } else {
      rightChanged[j] = true;
      j += 1;
    }
  }
  while (i < left.length) {
    leftChanged[i] = true;
    i += 1;
  }
  while (j < right.length) {
    rightChanged[j] = true;
    j += 1;
  }
  return { leftChanged, rightChanged };
}

/**
 * Within a single hunk, pair consecutive remove rows with consecutive add
 * rows so we can compute intra-line char highlights for them.
 *
 * Returns a Map keyed by the row's index in the hunk.
 */
export function pairChangesForHunk(
  hunkRows: DiffRow[]
): Map<number, CharDiffResult> {
  const result = new Map<number, CharDiffResult>();
  let i = 0;
  while (i < hunkRows.length) {
    if (hunkRows[i].op !== "remove") {
      i += 1;
      continue;
    }
    const removes: number[] = [];
    const adds: number[] = [];
    let j = i;
    while (j < hunkRows.length && hunkRows[j].op === "remove") {
      removes.push(j);
      j += 1;
    }
    while (j < hunkRows.length && hunkRows[j].op === "add") {
      adds.push(j);
      j += 1;
    }
    const pairs = Math.min(removes.length, adds.length);
    for (let k = 0; k < pairs; k += 1) {
      const rem = hunkRows[removes[k]];
      const add = hunkRows[adds[k]];
      const cd = diffChars(rem.leftText ?? "", add.rightText ?? "");
      result.set(removes[k], cd);
      result.set(adds[k], cd);
    }
    i = j;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Unified text format for copy/share.
// ---------------------------------------------------------------------------

export function toUnifiedText(
  rows: DiffRow[],
  leftLabel = "left",
  rightLabel = "right"
): string {
  const out: string[] = [`--- ${leftLabel}`, `+++ ${rightLabel}`];
  for (const r of rows) {
    if (r.op === "equal") out.push(` ${r.leftText ?? ""}`);
    else if (r.op === "add") out.push(`+${r.rightText ?? ""}`);
    else out.push(`-${r.leftText ?? ""}`);
  }
  return out.join("\n");
}
