/**
 * Line diffs: the unified diff shown before every write (`pendingDiff()`, the CLI), and the
 * line-level splices a remote edit is turned into so it can rebase over local edits.
 */
import type { Splice } from "../edit/ops";
import type { Path } from "../state/changes";

export interface FileDiff {
  path: Path;
  before: string;
  after: string;
  /** Unified diff with 3 lines of context (`--- a/<path>` / `+++ b/<path>` headers). */
  unified: string;
}

type Op = { k: " " | "-" | "+"; line: string };

const linesOf = (s: string): string[] => {
  if (!s) return [];
  const l = s.split("\n");
  if (l.at(-1) === "") l.pop();
  return l;
};

/** LCS line ops between `a` and `b` (common prefix / suffix trimmed first; a huge middle is replaced whole). */
function lineOps(a: string[], b: string[]): Op[] {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  const A = a.slice(p, a.length - q);
  const B = b.slice(p, b.length - q);
  const mid: Op[] = [];
  if (A.length * B.length > 4_000_000) {
    for (const line of A) mid.push({ k: "-", line });
    for (const line of B) mid.push({ k: "+", line });
  } else {
    const n = A.length;
    const m = B.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) {
        mid.push({ k: " ", line: A[i++]! });
        j++;
      } else if (j < m && (i >= n || dp[i]![j + 1]! > dp[i + 1]![j]!)) mid.push({ k: "+", line: B[j++]! });
      else mid.push({ k: "-", line: A[i++]! });
    }
  }
  return [...a.slice(0, p).map((line) => ({ k: " " as const, line })), ...mid, ...b.slice(b.length - q).map((line) => ({ k: " " as const, line }))];
}

const range = (start: number, count: number): string => (count === 1 ? `${start}` : `${count === 0 ? start - 1 : start},${count}`);

/** Unified diff of one file (empty string when equal). */
export function unifiedDiff(path: Path, before: string, after: string, context = 3): string {
  if (before === after) return "";
  const ops = lineOps(linesOf(before), linesOf(after));
  const changed = ops.map((o, i) => (o.k === " " ? -1 : i)).filter((i) => i >= 0);
  const out = [`--- a/${path}`, `+++ b/${path}`];
  const noEol = (s: string) => s.length > 0 && !s.endsWith("\n");
  let h = 0;
  while (h < changed.length) {
    let end = h;
    while (end + 1 < changed.length && changed[end + 1]! - changed[end]! <= 2 * context + 1) end++;
    const from = Math.max(0, changed[h]! - context);
    const to = Math.min(ops.length, changed[end]! + context + 1);
    let aLine = 1;
    let bLine = 1;
    for (let i = 0; i < from; i++) {
      if (ops[i]!.k !== "+") aLine++;
      if (ops[i]!.k !== "-") bLine++;
    }
    const body = ops.slice(from, to);
    const aCount = body.filter((o) => o.k !== "+").length;
    const bCount = body.filter((o) => o.k !== "-").length;
    out.push(`@@ -${range(aLine, aCount)} +${range(bLine, bCount)} @@`);
    for (let i = from; i < to; i++) {
      const o = ops[i]!;
      out.push(o.k + o.line);
      const lastA = o.k !== "+" && !ops.slice(i + 1).some((x) => x.k !== "+");
      const lastB = o.k !== "-" && !ops.slice(i + 1).some((x) => x.k !== "-");
      if ((lastA && noEol(before) && o.k === "-") || (lastB && noEol(after) && o.k === "+") || (o.k === " " && lastA && lastB && noEol(before))) out.push("\\ No newline at end of file");
    }
    h = end + 1;
  }
  return out.join("\n") + "\n";
}

export function fileDiff(path: Path, before: string, after: string): FileDiff {
  return { path, before, after, unified: unifiedDiff(path, before, after) };
}

/** Line-granular splices turning `before` into `after` (each changed run of lines is one splice). */
export function diffSplices(before: string, after: string): Splice[] {
  if (before === after) return [];
  const tok = (t: string): string[] => t.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const out: Splice[] = [];
  let pos = 0;
  let run: Splice | null = null;
  for (const o of lineOps(tok(before), tok(after))) {
    if (o.k === " ") {
      if (run) out.push(run);
      run = null;
      pos += o.line.length;
      continue;
    }
    run ??= { from: pos, to: pos, insert: "" };
    if (o.k === "-") run.to = pos += o.line.length;
    else run.insert += o.line;
  }
  if (run) out.push(run);
  return out;
}
