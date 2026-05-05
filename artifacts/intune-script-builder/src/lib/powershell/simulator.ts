// Risk-preview simulator: walks a tokenized script against a mocked
// Windows environment and emits side-effect steps for the UI timeline.
// Read-only — never executes real PowerShell. Branches are decided when
// possible; otherwise both paths are walked.

import {
  tokenize,
  unquote,
  type Token,
} from "./tokenizer";

export type StepKind =
  | "read"
  | "write"
  | "delete"
  | "exec"
  | "log"
  | "branch"
  | "exit"
  | "skip"
  | "note";

export interface SimStep {
  kind: StepKind;
  line: number;
  cmdlet?: string;
  summary: string;
  before?: string;
  after?: string;
}

export interface MockEnv {
  // Registry: flat map keyed by `HIVE\Path::ValueName`.
  registry: Record<string, string>;
  // Services: name -> status
  services: Record<string, "Running" | "Stopped">;
  // Files / folders that exist
  files: Set<string>;
  // Scheduled tasks: name -> state
  tasks: Record<string, "Ready" | "Disabled" | "Running">;
}

export interface SimResult {
  steps: SimStep[];
  exitCode: number | null;
  finalEnv: MockEnv;
}

// Default mock state. Mixed values so both compliant and non-compliant
// outcomes are reachable depending on the script under test.
function defaultEnv(): MockEnv {
  return {
    registry: {
      "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System::EnableSmartScreen": "0",
      "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion::ProgramFilesDir": "C:\\Program Files",
    },
    services: {
      Spooler: "Running",
      WinDefend: "Running",
      BITS: "Stopped",
    },
    files: new Set<string>([
      "C:\\Windows\\System32\\drivers\\etc\\hosts",
      "C:\\ProgramData",
    ]),
    tasks: {
      ScheduledDefrag: "Ready",
    },
  };
}

function regKey(path: string, name: string): string {
  return `${path}::${name}`;
}

function evalConst(tok: Token | undefined | null): string | null {
  if (!tok) return null;
  if (tok.type === "string") return unquote(tok.value);
  if (tok.type === "number") return tok.value;
  if (tok.type === "text" && tok.value.trim().length) return tok.value.trim();
  return null;
}

// Pre-process tokens into per-line groups (comments / whitespace stripped).
interface LogicalLine {
  line: number;
  tokens: Token[];
  raw: string;
}

function logicalLines(tokens: Token[]): LogicalLine[] {
  const out: LogicalLine[] = [];
  let cur: Token[] = [];
  let curLine = tokens[0]?.line ?? 1;
  let raw = "";
  const flush = () => {
    if (cur.length) {
      out.push({ line: curLine, tokens: cur, raw });
    }
    cur = [];
    raw = "";
  };
  for (const t of tokens) {
    if (t.type === "comment") continue;
    if (t.type === "newline") {
      flush();
      curLine = t.line + 1;
      continue;
    }
    if (cur.length === 0 && (t.type !== "text" || t.value.trim().length > 0)) {
      curLine = t.line;
    }
    if (t.type === "text" && t.value.trim().length === 0) {
      raw += t.value;
      continue;
    }
    cur.push(t);
    raw += t.value;
  }
  flush();
  return out;
}

// We walk try blocks only; catch/finally are noted as skipped.
function isTryOpen(l: LogicalLine): boolean {
  const t = l.tokens[0];
  return !!t && t.type === "cmdlet" && t.value.toLowerCase() === "try";
}

function isCloseBrace(l: LogicalLine): boolean {
  return l.tokens.length === 1 && l.tokens[0].type === "operator" && l.tokens[0].value === "}";
}

// Pull predicate tokens out of an `if (...) {` line.
function asIfLine(l: LogicalLine): { predicate: Token[] } | null {
  const t0 = l.tokens[0];
  if (!t0 || t0.type !== "cmdlet" || t0.value.toLowerCase() !== "if") return null;
  let depth = 0;
  let start = -1;
  let end = -1;
  for (let i = 0; i < l.tokens.length; i += 1) {
    const t = l.tokens[i];
    if (t.type !== "operator") continue;
    if (t.value === "(") {
      if (depth === 0) start = i + 1;
      depth += 1;
    } else if (t.value === ")") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (start < 0 || end < 0) return null;
  return { predicate: l.tokens.slice(start, end) };
}

// Truthiness for our string-encoded values. `<set:...>` sentinels are
// opaque non-null objects (e.g. a service handle) and count as truthy.
function isTruthyValue(v: string | undefined | null): boolean {
  if (v == null) return false;
  if (v === "" || v === "0") return false;
  if (v.toLowerCase() === "false") return false;
  return true;
}

// Resolve an RHS expression to a string value (or null if unresolvable).
// Handles constants, variables, parens, Test-Path, Get-* (opaque), and
// $null comparisons.
function evalExpression(toks: Token[], env: MockEnv, vars: Record<string, string>): string | null {
  const xs = toks.filter((t) => !(t.type === "text" && t.value.trim() === ""));
  if (xs.length === 0) return null;

  // Unwrap one fully-enclosing paren pair
  if (xs[0].type === "operator" && xs[0].value === "(") {
    let depth = 1;
    let endAt = -1;
    for (let i = 1; i < xs.length; i += 1) {
      if (xs[i].type === "operator" && xs[i].value === "(") depth += 1;
      else if (xs[i].type === "operator" && xs[i].value === ")") {
        depth -= 1;
        if (depth === 0) { endAt = i; break; }
      }
    }
    if (endAt === xs.length - 1) {
      return evalExpression(xs.slice(1, endAt), env, vars);
    }
  }

  if (xs[0].type === "variable" && xs[0].value === "$null" && xs[1]?.type === "operator") {
    const op = xs[1].value.toLowerCase();
    if (op === "-eq" || op === "-ne") {
      const rhs = evalExpression(xs.slice(2), env, vars);
      if (rhs == null) return null;
      const eq = rhs === "" || rhs === "False";
      return op === "-eq" ? (eq ? "True" : "False") : (eq ? "False" : "True");
    }
  }

  const opIdx = xs.findIndex((t) => t.type === "operator" && (t.value.toLowerCase() === "-eq" || t.value.toLowerCase() === "-ne"));
  if (opIdx > 0 && xs[opIdx + 1]?.type === "variable" && xs[opIdx + 1].value === "$null") {
    const lhs = evalExpression(xs.slice(0, opIdx), env, vars);
    if (lhs == null) return null;
    const eq = lhs === "" || lhs === "False";
    return xs[opIdx].value.toLowerCase() === "-eq" ? (eq ? "True" : "False") : (eq ? "False" : "True");
  }

  if (xs[0].type === "cmdlet" && xs[0].value.toLowerCase() === "test-path") {
    for (let j = 1; j < xs.length; j += 1) {
      const v = xs[j];
      let path: string | null = null;
      if (v.type === "string") path = unquote(v.value);
      else if (v.type === "variable") path = vars[v.value] ?? null;
      if (path != null) {
        const exists =
          env.files.has(path) ||
          Object.keys(env.registry).some((k) => k.startsWith(path));
        return exists ? "True" : "False";
      }
    }
    return null;
  }

  // `Get-*` RHS: opaque sentinel (truthy, value unknown).
  if (xs[0].type === "cmdlet" && /^get-/i.test(xs[0].value)) {
    return `<set:${xs[0].value}>`;
  }

  if (xs.length === 1) {
    const t = xs[0];
    if (t.type === "string") return unquote(t.value);
    if (t.type === "number") return t.value;
    if (t.type === "variable") {
      const lc = t.value.toLowerCase();
      if (lc === "$true") return "True";
      if (lc === "$false") return "False";
      return vars[t.value] ?? null;
    }
    if (t.type === "cmdlet") {
      const lc = t.value.toLowerCase();
      if (lc === "true") return "True";
      if (lc === "false") return "False";
    }
    if (t.type === "text" && t.value.trim()) return t.value.trim();
    return null;
  }

  if (xs[0].type === "variable" && xs[1]?.type === "operator") {
    const left = vars[xs[0].value];
    const op = xs[1].value.toLowerCase();
    const rhs = evalExpression(xs.slice(2), env, vars);
    if (left == null || rhs == null) return null;
    if (op === "-eq") return left === rhs ? "True" : "False";
    if (op === "-ne") return left !== rhs ? "True" : "False";
  }

  return null;
}

// Evaluate a predicate against the env. Returns true/false or null when
// the shape isn't decidable.
function evalPredicate(predicate: Token[], env: MockEnv, vars: Record<string, string>): boolean | null {
  let toks = predicate.filter((t) => !(t.type === "text" && t.value.trim() === ""));

  let negate = false;
  while (toks.length && toks[0].type === "operator" && toks[0].value.toLowerCase() === "-not") {
    negate = !negate;
    toks = toks.slice(1);
  }

  if (toks.length && toks[0].type === "operator" && toks[0].value === "(") {
    let depth = 1;
    let endAt = -1;
    for (let i = 1; i < toks.length; i += 1) {
      if (toks[i].type === "operator" && toks[i].value === "(") depth += 1;
      else if (toks[i].type === "operator" && toks[i].value === ")") {
        depth -= 1;
        if (depth === 0) { endAt = i; break; }
      }
    }
    if (endAt === toks.length - 1) {
      const inner = evalPredicate(toks.slice(1, endAt), env, vars);
      if (inner == null) return null;
      return negate ? !inner : inner;
    }
  }

  while (toks.length && toks[0].type === "operator" && toks[0].value.toLowerCase() === "-not") {
    negate = !negate;
    toks = toks.slice(1);
  }

  if (toks.length === 1 && toks[0].type === "variable") {
    const v = vars[toks[0].value];
    if (v === undefined) return null;
    const t = isTruthyValue(v);
    return negate ? !t : t;
  }

  const v = evalExpression(toks, env, vars);
  if (v == null) return null;
  const t = isTruthyValue(v);
  return negate ? !t : t;
}

// Index of the line containing the matching `}` for a `{` at/after openIdx.
function findClosingBrace(lines: LogicalLine[], openIdx: number): number {
  let depth = 0;
  let started = false;
  for (let i = openIdx; i < lines.length; i += 1) {
    for (const t of lines[i].tokens) {
      if (t.type !== "operator") continue;
      if (t.value === "{") {
        depth += 1;
        started = true;
      } else if (t.value === "}") {
        depth -= 1;
        if (started && depth === 0) return i;
      }
    }
  }
  return lines.length - 1;
}

// Extract the body of a brace block starting at `openIdx` as synthetic
// logical lines. Required so one-line `if (...) { ... }` bodies get walked.
function extractBody(lines: LogicalLine[], openIdx: number): { bodyLines: LogicalLine[]; closeIdx: number } {
  let openLine = openIdx;
  let openTokIdx = -1;
  while (openLine < lines.length) {
    const idx = lines[openLine].tokens.findIndex((t) => t.type === "operator" && t.value === "{");
    if (idx >= 0) { openTokIdx = idx; break; }
    openLine += 1;
  }
  if (openTokIdx < 0) return { bodyLines: [], closeIdx: openIdx };

  const collected: Map<number, Token[]> = new Map();
  const pushTok = (t: Token) => {
    const arr = collected.get(t.line) ?? [];
    arr.push(t);
    collected.set(t.line, arr);
  };

  let depth = 1;
  let li = openLine;
  let ti = openTokIdx + 1;
  let closeIdx = openIdx;
  while (li < lines.length && depth > 0) {
    const line = lines[li];
    while (ti < line.tokens.length && depth > 0) {
      const t = line.tokens[ti];
      if (t.type === "operator" && t.value === "{") {
        depth += 1;
        pushTok(t);
      } else if (t.type === "operator" && t.value === "}") {
        depth -= 1;
        if (depth === 0) {
          closeIdx = li;
          break;
        }
        pushTok(t);
      } else {
        pushTok(t);
      }
      ti += 1;
    }
    if (depth === 0) break;
    li += 1;
    ti = 0;
  }

  // Rebuild LogicalLines, splitting on `;` so chained statements dispatch.
  const bodyLines: LogicalLine[] = [];
  const sortedLineNums = [...collected.keys()].sort((a, b) => a - b);
  for (const lnNum of sortedLineNums) {
    const toks = collected.get(lnNum) ?? [];
    let buf: Token[] = [];
    const flush = () => {
      const trimmed = buf.filter((x) => !(x.type === "text" && x.value.trim() === ""));
      if (trimmed.length) {
        bodyLines.push({ line: lnNum, tokens: buf, raw: buf.map((t) => t.value).join("") });
      }
      buf = [];
    };
    for (const t of toks) {
      if (t.type === "operator" && t.value === ";") {
        flush();
        continue;
      }
      buf.push(t);
    }
    flush();
  }

  return { bodyLines, closeIdx };
}

// Extract a positional arg for a cmdlet line (first non-parameter,
// non-whitespace token after the cmdlet itself).
function firstPositional(args: Token[]): Token | null {
  let skipNext = false;
  for (const a of args) {
    if (skipNext) { skipNext = false; continue; }
    if (a.type === "text" && a.value.trim() === "") continue;
    if (a.type === "parameter") {
      // assume it consumes the next non-whitespace token as its value
      skipNext = true;
      continue;
    }
    return a;
  }
  return null;
}

function namedArg(args: Token[], name: string): Token | null {
  const target = name.toLowerCase().startsWith("-") ? name.toLowerCase() : "-" + name.toLowerCase();
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a.type !== "parameter") continue;
    if (a.value.toLowerCase() !== target) continue;
    for (let j = i + 1; j < args.length; j += 1) {
      const v = args[j];
      if (v.type === "text" && v.value.trim() === "") continue;
      return v;
    }
    return null;
  }
  return null;
}

function resolveTok(t: Token | null, vars: Record<string, string>): string | null {
  if (!t) return null;
  if (t.type === "string") return unquote(t.value);
  if (t.type === "number") return t.value;
  if (t.type === "variable") return vars[t.value] ?? null;
  if (t.type === "text" && t.value.trim().length) return t.value.trim();
  return null;
}

// `$x = <expr>` -> [name, value] when evalExpression can resolve the RHS.
function asAssignment(l: LogicalLine, env: MockEnv, vars: Record<string, string>): [string, string] | null {
  const t = l.tokens.filter((x) => !(x.type === "text" && x.value.trim() === ""));
  if (t.length < 3) return null;
  if (t[0].type !== "variable") return null;
  if (!(t[1].type === "operator" && t[1].value === "=")) return null;
  const rhs = t.slice(2);
  const v = evalExpression(rhs, env, vars);
  if (v == null) return null;
  return [t[0].value, v];
}

interface SimContext {
  env: MockEnv;
  vars: Record<string, string>;
  steps: SimStep[];
  exitCode: number | null;
}

function simulateRange(lines: LogicalLine[], from: number, to: number, ctx: SimContext): void {
  let i = from;
  while (i <= to && ctx.exitCode == null) {
    const l = lines[i];
    if (!l) { i += 1; continue; }

    // Skip pure brace-closing lines
    if (isCloseBrace(l)) { i += 1; continue; }

    // try { ... }
    if (isTryOpen(l)) {
      const body = extractBody(lines, i);
      ctx.steps.push({
        kind: "note",
        line: l.line,
        summary: "Enter try block (catch branch is simulated only on failure)",
      });
      simulateRange(body.bodyLines, 0, body.bodyLines.length - 1, ctx);
      i = body.closeIdx + 1;
      // skip catch/finally bodies (we don't simulate the failure path)
      while (i < lines.length) {
        const n = lines[i];
        const head = n.tokens[0];
        if (head && head.type === "cmdlet" && (head.value.toLowerCase() === "catch" || head.value.toLowerCase() === "finally")) {
          const c2 = findClosingBrace(lines, i);
          ctx.steps.push({
            kind: "skip",
            line: n.line,
            summary: `Skip ${head.value} block (try succeeded in simulation)`,
          });
          i = c2 + 1;
          continue;
        }
        break;
      }
      continue;
    }

    // if/elseif/else: evaluate predicates in order; first TRUE wins. When
    // any predicate is undecidable, walk every undecided branch.
    const ifInfo = asIfLine(l);
    if (ifInfo) {
      type Branch = { line: number; predicate: Token[] | null; bodyLines: LogicalLine[]; closeIdx: number; label: string };
      const branches: Branch[] = [];
      const firstBody = extractBody(lines, i);
      branches.push({ line: l.line, predicate: ifInfo.predicate, bodyLines: firstBody.bodyLines, closeIdx: firstBody.closeIdx, label: "if" });

      let cursor = firstBody.closeIdx + 1;
      while (cursor < lines.length) {
        const n = lines[cursor];
        if (!n) break;
        const head = n.tokens.filter((x) => !(x.type === "text" && x.value.trim() === ""))[0];
        if (!head || head.type !== "cmdlet") break;
        const lc = head.value.toLowerCase();
        if (lc === "elseif") {
          const ei = asIfLine(n);
          const bod = extractBody(lines, cursor);
          branches.push({ line: n.line, predicate: ei?.predicate ?? null, bodyLines: bod.bodyLines, closeIdx: bod.closeIdx, label: "elseif" });
          cursor = bod.closeIdx + 1;
          continue;
        }
        if (lc === "else") {
          const bod = extractBody(lines, cursor);
          branches.push({ line: n.line, predicate: null, bodyLines: bod.bodyLines, closeIdx: bod.closeIdx, label: "else" });
          cursor = bod.closeIdx + 1;
          break;
        }
        break;
      }

      let chosen = -1;
      const undecided: number[] = [];
      for (let bi = 0; bi < branches.length; bi += 1) {
        const b = branches[bi];
        if (b.predicate == null) {
          // else: only fires if no earlier branch was chosen and none undecided
          if (chosen < 0 && undecided.length === 0) {
            chosen = bi;
          } else if (chosen < 0) {
            undecided.push(bi);
          }
          break;
        }
        const decided = evalPredicate(b.predicate, ctx.env, ctx.vars);
        if (decided === true) {
          chosen = bi;
          break;
        } else if (decided === null) {
          undecided.push(bi);
        }
      }

      if (chosen >= 0 && undecided.length === 0) {
        const b = branches[chosen];
        ctx.steps.push({ kind: "branch", line: b.line, summary: `Branch: ${b.label} predicate evaluated TRUE` });
        simulateRange(b.bodyLines, 0, b.bodyLines.length - 1, ctx);
        for (let bi = 0; bi < branches.length; bi += 1) {
          if (bi === chosen) continue;
          ctx.steps.push({ kind: "skip", line: branches[bi].line, summary: `Skip ${branches[bi].label} branch (earlier branch matched)` });
        }
      } else if (chosen < 0 && undecided.length === 0) {
        ctx.steps.push({ kind: "branch", line: l.line, summary: "Branch: every if/elseif predicate evaluated FALSE" });
        for (const b of branches) {
          ctx.steps.push({ kind: "skip", line: b.line, summary: `Skip ${b.label} body (predicate false)` });
        }
      } else {
        // We could not decide one or more branches: walk each undecided branch
        // (and the chosen branch if any) so the user sees what every path does.
        const toWalk = chosen >= 0 ? [chosen, ...undecided] : undecided;
        ctx.steps.push({
          kind: "branch",
          line: l.line,
          summary: `Branch: ${toWalk.length} possible path${toWalk.length === 1 ? "" : "s"} - walking each`,
        });
        for (const bi of toWalk) {
          const b = branches[bi];
          ctx.steps.push({ kind: "branch", line: b.line, summary: `...walking ${b.label} branch` });
          simulateRange(b.bodyLines, 0, b.bodyLines.length - 1, ctx);
          if (ctx.exitCode != null) break;
        }
      }
      i = cursor;
      continue;
    }

    // do { ... } while ($false) - just walk the body once
    {
      const head = l.tokens[0];
      if (head && head.type === "cmdlet" && head.value.toLowerCase() === "do") {
        const body = extractBody(lines, i);
        simulateRange(body.bodyLines, 0, body.bodyLines.length - 1, ctx);
        // skip the `while (...)` clause line(s)
        i = body.closeIdx + 1;
        const after = lines[i];
        if (after) {
          const h2 = after.tokens.filter((x) => !(x.type === "text" && x.value.trim() === ""))[0];
          if (h2 && h2.type === "cmdlet" && h2.value.toLowerCase() === "while") {
            i += 1;
          }
        }
        continue;
      }
    }

    // assignment
    const asg = asAssignment(l, ctx.env, ctx.vars);
    if (asg) {
      ctx.vars[asg[0]] = asg[1];
      i += 1;
      continue;
    }

    // cmdlet invocation
    const head = l.tokens.filter((x) => !(x.type === "text" && x.value.trim() === ""))[0];
    if (head && head.type === "cmdlet") {
      const lc = head.value.toLowerCase();
      const args = l.tokens.slice(l.tokens.indexOf(head) + 1);

      switch (lc) {
        case "exit": {
          const codeTok = firstPositional(args);
          const code = codeTok ? parseInt(resolveTok(codeTok, ctx.vars) ?? "0", 10) : 0;
          ctx.exitCode = isNaN(code) ? 0 : code;
          ctx.steps.push({
            kind: "exit",
            line: l.line,
            cmdlet: "exit",
            summary: `exit ${ctx.exitCode}`,
          });
          return;
        }
        case "throw": {
          ctx.exitCode = 1;
          ctx.steps.push({ kind: "exit", line: l.line, cmdlet: "throw", summary: "throw -> simulator treats as exit 1" });
          return;
        }
        case "write-output":
        case "write-host":
        case "write-verbose":
        case "write-warning": {
          const msg = firstPositional(args);
          const text = msg ? resolveTok(msg, ctx.vars) ?? msg.value : "";
          ctx.steps.push({
            kind: "log",
            line: l.line,
            cmdlet: head.value,
            summary: text.length > 120 ? text.slice(0, 117) + "..." : text,
          });
          break;
        }
        case "test-path": {
          const p = firstPositional(args);
          const path = p ? resolveTok(p, ctx.vars) : null;
          if (path) {
            const exists = ctx.env.files.has(path) || Object.keys(ctx.env.registry).some((k) => k.startsWith(path));
            ctx.steps.push({
              kind: "read",
              line: l.line,
              cmdlet: head.value,
              summary: `Test-Path ${path} -> ${exists}`,
            });
          }
          break;
        }
        case "get-itemproperty":
        case "get-itempropertyvalue": {
          const path = resolveTok(namedArg(args, "-Path"), ctx.vars);
          const name = resolveTok(namedArg(args, "-Name"), ctx.vars);
          if (path && name) {
            const v = ctx.env.registry[regKey(path, name)];
            ctx.steps.push({
              kind: "read",
              line: l.line,
              cmdlet: head.value,
              summary: `Read ${path} \\ ${name} -> ${v ?? "(not set)"}`,
              before: v,
            });
          } else {
            ctx.steps.push({ kind: "read", line: l.line, cmdlet: head.value, summary: "Read registry value (path/name not statically resolvable)" });
          }
          break;
        }
        case "set-itemproperty": {
          const path = resolveTok(namedArg(args, "-Path"), ctx.vars);
          const name = resolveTok(namedArg(args, "-Name"), ctx.vars);
          const val = resolveTok(namedArg(args, "-Value"), ctx.vars);
          if (path && name) {
            const k = regKey(path, name);
            const before = ctx.env.registry[k];
            ctx.env.registry[k] = val ?? "";
            ctx.steps.push({
              kind: "write",
              line: l.line,
              cmdlet: head.value,
              summary: `Set ${path} \\ ${name} = ${val ?? "''"}`,
              before,
              after: val ?? "",
            });
          } else {
            ctx.steps.push({ kind: "write", line: l.line, cmdlet: head.value, summary: "Write registry value (path/name not statically resolvable)" });
          }
          break;
        }
        case "new-itemproperty": {
          const path = resolveTok(namedArg(args, "-Path"), ctx.vars);
          const name = resolveTok(namedArg(args, "-Name"), ctx.vars);
          const val = resolveTok(namedArg(args, "-Value"), ctx.vars);
          if (path && name) {
            const k = regKey(path, name);
            ctx.env.registry[k] = val ?? "";
            ctx.steps.push({ kind: "write", line: l.line, cmdlet: head.value, summary: `Create ${path} \\ ${name} = ${val ?? "''"}` });
          }
          break;
        }
        case "remove-itemproperty": {
          const path = resolveTok(namedArg(args, "-Path"), ctx.vars);
          const name = resolveTok(namedArg(args, "-Name"), ctx.vars);
          if (path && name) {
            const k = regKey(path, name);
            const before = ctx.env.registry[k];
            delete ctx.env.registry[k];
            ctx.steps.push({ kind: "delete", line: l.line, cmdlet: head.value, summary: `Remove ${path} \\ ${name}`, before });
          }
          break;
        }
        case "new-item": {
          const path = resolveTok(namedArg(args, "-Path"), ctx.vars) ?? resolveTok(firstPositional(args), ctx.vars);
          const itemType = resolveTok(namedArg(args, "-ItemType"), ctx.vars) ?? "File";
          if (path) {
            ctx.env.files.add(path);
            ctx.steps.push({ kind: "write", line: l.line, cmdlet: head.value, summary: `Create ${itemType.toLowerCase()} ${path}` });
          }
          break;
        }
        case "remove-item": {
          const path = resolveTok(namedArg(args, "-Path"), ctx.vars) ?? resolveTok(firstPositional(args), ctx.vars);
          if (path) {
            ctx.env.files.delete(path);
            ctx.steps.push({ kind: "delete", line: l.line, cmdlet: head.value, summary: `Remove ${path}` });
          }
          break;
        }
        case "get-service": {
          const name = resolveTok(namedArg(args, "-Name"), ctx.vars) ?? resolveTok(firstPositional(args), ctx.vars);
          if (name) {
            const status = ctx.env.services[name] ?? "Stopped";
            ctx.vars["$svc"] = status;
            ctx.steps.push({ kind: "read", line: l.line, cmdlet: head.value, summary: `Get-Service ${name} -> ${status}` });
          }
          break;
        }
        case "start-service": {
          const name = resolveTok(namedArg(args, "-Name"), ctx.vars) ?? resolveTok(firstPositional(args), ctx.vars);
          if (name) {
            const before = ctx.env.services[name];
            ctx.env.services[name] = "Running";
            ctx.steps.push({ kind: "exec", line: l.line, cmdlet: head.value, summary: `Start-Service ${name}`, before, after: "Running" });
          }
          break;
        }
        case "stop-service": {
          const name = resolveTok(namedArg(args, "-Name"), ctx.vars) ?? resolveTok(firstPositional(args), ctx.vars);
          if (name) {
            const before = ctx.env.services[name];
            ctx.env.services[name] = "Stopped";
            ctx.steps.push({ kind: "exec", line: l.line, cmdlet: head.value, summary: `Stop-Service ${name}`, before, after: "Stopped" });
          }
          break;
        }
        case "get-scheduledtask": {
          ctx.steps.push({ kind: "read", line: l.line, cmdlet: head.value, summary: "Enumerate scheduled tasks" });
          break;
        }
        case "enable-scheduledtask": {
          const name = resolveTok(namedArg(args, "-TaskName"), ctx.vars);
          if (name) {
            ctx.env.tasks[name] = "Ready";
            ctx.steps.push({ kind: "exec", line: l.line, cmdlet: head.value, summary: `Enable-ScheduledTask ${name}` });
          }
          break;
        }
        case "disable-scheduledtask": {
          const name = resolveTok(namedArg(args, "-TaskName"), ctx.vars);
          if (name) {
            ctx.env.tasks[name] = "Disabled";
            ctx.steps.push({ kind: "exec", line: l.line, cmdlet: head.value, summary: `Disable-ScheduledTask ${name}` });
          }
          break;
        }
        default: {
          ctx.steps.push({
            kind: "exec",
            line: l.line,
            cmdlet: head.value,
            summary: `${head.value} (call not modelled - assumed no-op)`,
          });
        }
      }
    }

    i += 1;
  }
}

export function simulateScript(source: string, env: MockEnv = defaultEnv()): SimResult {
  const tokens = tokenize(source);
  const lines = logicalLines(tokens);
  const ctx: SimContext = { env, vars: {}, steps: [], exitCode: null };
  // Initialise some standard env-style variables so substitutions are
  // visible in the timeline.
  ctx.vars["$env:ProgramData"] = "C:\\ProgramData";
  ctx.vars["$env:USERPROFILE"] = "C:\\Users\\TestUser";
  ctx.vars["$env:APPDATA"] = "C:\\Users\\TestUser\\AppData\\Roaming";
  ctx.vars["$null"] = "";

  simulateRange(lines, 0, lines.length - 1, ctx);

  return { steps: ctx.steps, exitCode: ctx.exitCode, finalEnv: ctx.env };
}

// Public default env factory for the UI to seed a fresh simulation.
export function freshMockEnv(): MockEnv {
  return defaultEnv();
}
