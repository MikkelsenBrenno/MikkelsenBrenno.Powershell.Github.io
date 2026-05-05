// Lightweight PowerShell tokenizer used by the linter, simulator, and
// inline cmdlet tooltips. Not a full parser.

export type TokenType =
  | "comment"
  | "string"
  | "variable"
  | "parameter"
  | "cmdlet"
  | "number"
  | "operator"
  | "newline"
  | "text";

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  line: number;
}

const VERB_NOUN_RE = /^[A-Z][a-zA-Z]+-[A-Z][a-zA-Z0-9]+$/;

// Flow keywords classified as cmdlet tokens so the linter can detect them.
const BARE_COMMAND_KEYWORDS = new Set([
  "exit",
  "throw",
  "return",
  "break",
  "continue",
  "if",
  "else",
  "elseif",
  "switch",
  "for",
  "foreach",
  "while",
  "do",
  "try",
  "catch",
  "finally",
  "function",
  "param",
  "begin",
  "process",
  "end",
]);

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentCont(ch: string): boolean {
  return /[A-Za-z0-9_-]/.test(ch);
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const n = source.length;
  let i = 0;
  let line = 1;

  // Bare identifiers only become cmdlets when at command position.
  let atCommandPos = true;

  const push = (type: TokenType, value: string, start: number, end: number, startLine: number) => {
    tokens.push({ type, value, start, end, line: startLine });
  };

  // Push a token whose value may span several source lines. Splits on
  // embedded `\n` so each segment lands on its own line, with synthetic
  // `newline` tokens between segments. This keeps the renderer's
  // line-by-line accounting (one `data-line` span per source line)
  // honest for block comments and multi-line strings; otherwise the
  // multi-line value is parked on the start line and every subsequent
  // line shows up as a phantom blank span in the rendered code.
  const pushMultilineToken = (
    type: TokenType,
    value: string,
    start: number,
    startLine: number
  ) => {
    if (!value.includes("\n")) {
      push(type, value, start, start + value.length, startLine);
      return;
    }
    const segments = value.split("\n");
    let offset = start;
    for (let s = 0; s < segments.length; s += 1) {
      const seg = segments[s];
      const segEnd = offset + seg.length;
      push(type, seg, offset, segEnd, startLine + s);
      if (s < segments.length - 1) {
        push("newline", "\n", segEnd, segEnd + 1, startLine + s);
        offset = segEnd + 1;
      }
    }
  };

  while (i < n) {
    const ch = source[i];
    const startLine = line;
    const start = i;

    if (ch === "\n") {
      push("newline", "\n", i, i + 1, startLine);
      i += 1;
      line += 1;
      atCommandPos = true;
      continue;
    }

    if (ch === "\r") {
      i += 1;
      continue;
    }

    // Block comment <# ... #>
    if (ch === "<" && source[i + 1] === "#") {
      let j = i + 2;
      while (j < n && !(source[j] === "#" && source[j + 1] === ">")) {
        if (source[j] === "\n") line += 1;
        j += 1;
      }
      j = Math.min(j + 2, n);
      pushMultilineToken("comment", source.slice(i, j), i, startLine);
      i = j;
      continue;
    }

    // Line comment #...
    if (ch === "#") {
      let j = i + 1;
      while (j < n && source[j] !== "\n") j += 1;
      push("comment", source.slice(i, j), i, j, startLine);
      i = j;
      continue;
    }

    // Strings: backtick escapes inside "...", '' escapes inside '...'.
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        const c = source[j];
        if (c === "\n") line += 1;
        if (quote === '"' && c === "`" && j + 1 < n) {
          j += 2;
          continue;
        }
        if (quote === "'" && c === "'" && source[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (c === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      pushMultilineToken("string", source.slice(i, j), i, startLine);
      i = j;
      atCommandPos = false;
      continue;
    }

    // Variables: $name, $script:name, ${name with spaces}
    if (ch === "$") {
      let j = i + 1;
      if (source[j] === "{") {
        j += 1;
        while (j < n && source[j] !== "}") j += 1;
        j = Math.min(j + 1, n);
      } else {
        while (j < n && /[A-Za-z0-9_:]/.test(source[j])) j += 1;
      }
      push("variable", source.slice(i, j), i, j, startLine);
      i = j;
      atCommandPos = false;
      continue;
    }

    // Whitespace (non-newline)
    if (ch === " " || ch === "\t") {
      let j = i + 1;
      while (j < n && (source[j] === " " || source[j] === "\t")) j += 1;
      push("text", source.slice(i, j), i, j, startLine);
      i = j;
      // Whitespace alone doesn't change command position
      continue;
    }

    // -Param only after whitespace / `,` / `(` so `$a-1` isn't misread.
    if (ch === "-" && i + 1 < n && /[A-Za-z]/.test(source[i + 1])) {
      const prev = tokens.length ? tokens[tokens.length - 1] : null;
      const prevOk =
        !prev ||
        prev.type === "text" ||
        prev.type === "newline" ||
        (prev.type === "operator" && (prev.value === "," || prev.value === "(" || prev.value === "|"));
      if (prevOk) {
        let j = i + 1;
        while (j < n && isIdentCont(source[j])) j += 1;
        const slice = source.slice(i, j);
        // Comparison/boolean operators only. Do NOT add parameter switches
        // (-ErrorAction, -WhatIf, -Confirm, -Force, -Recurse, ...) here:
        // they are detected by downstream lint rules as parameter tokens.
        const COMPARISON_OPS = new Set([
          "-eq", "-ne", "-gt", "-lt", "-ge", "-le", "-and", "-or", "-not",
          "-match", "-notmatch", "-like", "-notlike", "-contains",
          "-notcontains", "-in", "-notin", "-is", "-isnot", "-band", "-bor",
          "-bxor", "-bnot", "-replace", "-split", "-join", "-as", "-xor",
          "-cmatch", "-cnotmatch", "-clike", "-cnotlike", "-ceq", "-cne",
          "-cgt", "-clt", "-cge", "-cle",
        ].map((s) => s.toLowerCase()));
        const lower = slice.toLowerCase();
        if (COMPARISON_OPS.has(lower)) {
          push("operator", slice, i, j, startLine);
        } else {
          push("parameter", slice, i, j, startLine);
        }
        i = j;
        atCommandPos = false;
        continue;
      }
    }

    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[0-9.]/.test(source[j])) j += 1;
      push("number", source.slice(i, j), i, j, startLine);
      i = j;
      atCommandPos = false;
      continue;
    }

    // Identifier (potential cmdlet name, bare keyword, or just text).
    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < n && isIdentCont(source[j])) j += 1;
      const slice = source.slice(i, j);
      const isVerbNoun = VERB_NOUN_RE.test(slice);
      const isBareCmd = BARE_COMMAND_KEYWORDS.has(slice.toLowerCase());
      // Cmdlet if at command position or matches Verb-Noun.
      if (isVerbNoun || (atCommandPos && isBareCmd)) {
        push("cmdlet", slice, i, j, startLine);
      } else {
        push("text", slice, i, j, startLine);
      }
      i = j;
      atCommandPos = false;
      continue;
    }

    const two = source.slice(i, i + 2);
    if (two === "::" || two === "&&" || two === "||" || two === "..") {
      push("operator", two, i, i + 2, startLine);
      i += 2;
      atCommandPos = false;
      continue;
    }
    if ("|;{}()[],=+*/%&".includes(ch)) {
      push("operator", ch, i, i + 1, startLine);
      i += 1;
      if (ch === "|" || ch === ";" || ch === "{" || ch === "(") {
        atCommandPos = true;
      } else {
        atCommandPos = false;
      }
      continue;
    }

    push("text", ch, i, i + 1, startLine);
    i += 1;
  }

  return tokens;
}

export function detokenize(tokens: Token[]): string {
  return tokens.map((t) => t.value).join("");
}

export function tokensByLine(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const t of tokens) {
    if (t.type === "newline") {
      lines.push([]);
      continue;
    }
    lines[lines.length - 1].push(t);
  }
  return lines;
}

// Group tokens into cmdlet invocations (cmdlet + args until terminator).
export interface CommandInvocation {
  cmdlet: Token;
  args: Token[];
  line: number;
}

export function extractInvocations(tokens: Token[]): CommandInvocation[] {
  const invs: CommandInvocation[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type !== "cmdlet") continue;
    if (BARE_COMMAND_KEYWORDS.has(t.value.toLowerCase())) continue;
    const args: Token[] = [];
    let j = i + 1;
    while (j < tokens.length) {
      const n = tokens[j];
      if (n.type === "newline") break;
      if (n.type === "operator" && (n.value === ";" || n.value === "|" || n.value === "{" || n.value === "}")) break;
      if (n.type !== "text" || n.value.trim().length > 0) {
        args.push(n);
      } else if (n.type === "text") {
        args.push(n);
      }
      j += 1;
    }
    invs.push({ cmdlet: t, args, line: t.line });
    i = j - 1;
  }
  return invs;
}

// Return the token following a named -Param in an invocation's args.
export function getNamedArg(args: Token[], name: string): Token | null {
  const lower = name.toLowerCase();
  const target = lower.startsWith("-") ? lower : "-" + lower;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a.type === "parameter" && a.value.toLowerCase() === target) {
      // Find the next non-whitespace token
      for (let j = i + 1; j < args.length; j += 1) {
        const v = args[j];
        if (v.type === "text" && v.value.trim().length === 0) continue;
        return v;
      }
      return null;
    }
  }
  return null;
}

// Strip surrounding quotes and unescape just enough to feed into the
// simulator's mock environment. Not a full PowerShell string evaluator -
// variables ($x) inside double-quoted strings are returned literally with
// the `$` prefix preserved so the simulator can show them in the timeline
// rather than silently lying about substitution.
export function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      let inner = value.slice(1, -1);
      if (first === '"') {
        inner = inner.replace(/`"/g, '"').replace(/``/g, "`").replace(/`\$/g, "$");
      } else {
        inner = inner.replace(/''/g, "'");
      }
      return inner;
    }
  }
  return value;
}
