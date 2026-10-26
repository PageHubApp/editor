/**
 * Applying rule fixes. A fix is a list of splices in the file's coordinates; fixes from
 * different reports apply together when they don't overlap (the earlier one wins, the later
 * is left for the next pass, as in ESLint). `sanitizeSource` is "apply every sanitize fix",
 * repeated until stable.
 */
import { applySplices, sortSplices, type Splice } from "../edit/ops";
import type { Rule } from "./defineRule";
import { runRules, type Diagnostic, type RunOptions } from "./run";

export interface FixResult {
  output: string;
  applied: Diagnostic[];
  skipped: Diagnostic[];
}

export function applyFixes(source: string, diagnostics: readonly Diagnostic[], opts: { kind?: "fix" | "sanitize" | "all" } = {}): FixResult {
  const kind = opts.kind ?? "all";
  const candidates = diagnostics
    .filter((d) => d.fix && (kind === "all" || d.fix.kind === kind))
    .sort((a, b) => a.range.start - b.range.start);
  const taken: Splice[] = [];
  const applied: Diagnostic[] = [];
  const skipped: Diagnostic[] = [];
  for (const d of candidates) {
    try {
      sortSplices([...taken, ...d.fix!.splices]);
      taken.push(...d.fix!.splices);
      applied.push(d);
    } catch {
      skipped.push(d);
    }
  }
  return { output: taken.length ? applySplices(source, taken) : source, applied, skipped };
}

/** Apply every `sanitize` fix, re-running the rules until nothing is left to fix (at most `passes`). */
export function sanitizeSource(
  source: string,
  rules: readonly Rule<any>[],
  opts: RunOptions & { path?: string; passes?: number } = {},
): { output: string; changed: boolean } {
  const path = opts.path ?? "file";
  let text = source;
  for (let i = 0; i < (opts.passes ?? 4); i++) {
    const diags = runRules(rules, { ...(opts.files ?? {}), [path]: text }, opts, [path]);
    const { output, applied } = applyFixes(text, diags, { kind: "sanitize" });
    if (!applied.length || output === text) break;
    text = output;
  }
  return { output: text, changed: text !== source };
}
