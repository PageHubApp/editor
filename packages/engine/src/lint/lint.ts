/**
 * Editor-safety lint: the structural rules, run through the rules system (`../rules`).
 * The parser accepts every pattern below in both modes and never throws on them, so these
 * rules are what keep stored source editable: Liquid logic wraps whole elements, and names
 * are static. Runs on every write (editor, AI, import, restore). An empty result means editable.
 */
import type { ParseOptions, Range } from "../parse/parse";
import { lintRules } from "../rules/coreRules";
import { runRules } from "../rules/run";

export type LintRuleId =
  | "parse"
  | "no-liquid-in-attr-list"
  | "no-dangling-open"
  | "no-dangling-close"
  | "static-attr-name"
  | "static-tag-name";

export interface LintIssue {
  rule: LintRuleId;
  message: string;
  range: Range;
}

export const LINT_RULES = Object.fromEntries(lintRules.map((r) => [r.meta.id, r.meta.description])) as Record<LintRuleId, string>;

export function lint(source: string, opts: ParseOptions = {}): LintIssue[] {
  return runRules(lintRules, { file: source }, { env: opts.env }).map((d) => ({ rule: d.rule as LintRuleId, message: d.message, range: d.range }));
}
