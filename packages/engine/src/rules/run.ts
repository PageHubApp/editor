/**
 * Running rules: one parse and one merged traversal per file for every rule. The runner
 * object is incremental by changed file: a file is re-checked only when its text changed (or,
 * for rules that read the bundle, when any `sections/` file changed).
 */
import { parseSource, type Range } from "../parse/parse";
import type { Environment } from "../parse/environment";
import { TRUSTED_HTML_FILTERS } from "../runtime/filters/builtinFilters";
import type { FixKind, ParseErrorHandler, Report, Rule, RuleContext, RuleRegistry, Severity, Suggestion } from "./defineRule";
import type { LiquidHtmlNode } from "../parse/parse";
import type { Splice } from "../edit/ops";
import { traverse, type HandlerMap } from "./traverse";

export interface Diagnostic {
  rule: string;
  severity: Severity;
  message: string;
  path: string;
  range: Range;
  fix?: { kind: FixKind; splices: Splice[] };
  suggestions?: Suggestion[];
}

export interface RunOptions {
  registry?: RuleRegistry;
  env?: Environment;
  /** Extra trusted-HTML filters (filters registered `raw: true`); the builtin ones are always trusted. */
  trustedFilters?: Iterable<string>;
  /** Per-rule override: a severity, or `off`. */
  severity?: Record<string, Severity | "off">;
  /** Per-rule options, by rule id. */
  options?: Record<string, unknown>;
  /** Extra files for `bundle` rules, merged under the files being checked. */
  files?: Record<string, string>;
}

function ruleIds(rules: readonly Rule<any>[]): void {
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.meta.id)) throw new Error(`duplicate rule id "${r.meta.id}"`);
    seen.add(r.meta.id);
  }
}

function checkFile(rules: readonly Rule<any>[], path: string, source: string, all: Record<string, string>, opts: RunOptions): Diagnostic[] {
  const active = rules.filter((r) => opts.severity?.[r.meta.id] !== "off");
  const out: Diagnostic[] = [];
  const trusted = new Set([...TRUSTED_HTML_FILTERS, ...(opts.trustedFilters ?? [])]);
  const ancestors: LiquidHtmlNode[] = [];
  const handlers: HandlerMap = new Map();
  const parseErrorHandlers: ParseErrorHandler[] = [];

  for (const rule of active) {
    const severity = (opts.severity?.[rule.meta.id] as Severity | undefined) ?? rule.meta.severity;
    const ctx: RuleContext = {
      path, source, options: opts.options?.[rule.meta.id], registry: opts.registry ?? {}, trustedFilters: trusted, env: opts.env,
      file: (p) => (p === path ? source : all[p]),
      ancestors,
      report(r: Report) {
        const range = r.range ?? (r.node ? { start: r.node.position.start, end: r.node.position.end } : { start: 0, end: 0 });
        out.push({
          rule: rule.meta.id, severity, message: r.message, path, range,
          ...(r.fix ? { fix: { kind: rule.meta.fixKind ?? "fix", splices: r.fix } } : {}),
          ...(r.suggestions?.length ? { suggestions: r.suggestions } : {}),
        });
      },
    };
    const visitor = rule.create(ctx);
    for (const [key, fn] of Object.entries(visitor)) {
      if (!fn) continue;
      if (key === "ParseError") parseErrorHandlers.push(fn as ParseErrorHandler);
      else (handlers.get(key) ?? handlers.set(key, []).get(key)!).push(fn as never);
    }
  }

  let ast;
  try {
    ast = parseSource(source, "strict", { env: opts.env });
  } catch (e) {
    for (const h of parseErrorHandlers) h(e as Error);
    return out.sort((a, b) => a.range.start - b.range.start);
  }
  traverse(ast, handlers, ancestors);
  return out.sort((a, b) => a.range.start - b.range.start);
}

/** Run `rules` over `files` (all of them, or only the paths in `only`). */
export function runRules(rules: readonly Rule<any>[], files: Record<string, string>, opts: RunOptions = {}, only?: readonly string[]): Diagnostic[] {
  ruleIds(rules);
  const all = { ...(opts.files ?? {}), ...files };
  return (only ?? Object.keys(files)).flatMap((p) => (files[p] === undefined ? [] : checkFile(rules, p, files[p]!, all, opts)));
}

const bundleStamp = (files: Record<string, string>): string =>
  Object.keys(files).filter((p) => p.startsWith("sections/")).sort().map((p) => `${p}\0${files[p]}`).join("\u0001");

export interface RuleRunner {
  /** Diagnostics for every file; unchanged files come from the cache. */
  run(files: Record<string, string>): Diagnostic[];
  /** How many files the last `run` actually re-checked. */
  readonly lastChecked: number;
}

export function createRuleRunner(rules: readonly Rule<any>[], opts: RunOptions = {}): RuleRunner {
  ruleIds(rules);
  const usesBundle = rules.some((r) => r.meta.needs?.includes("bundle"));
  const cache = new Map<string, { text: string; stamp: string; diags: Diagnostic[] }>();
  const runner = {
    lastChecked: 0,
    run(files: Record<string, string>): Diagnostic[] {
      const all = { ...(opts.files ?? {}), ...files };
      const stamp = usesBundle ? bundleStamp(all) : "";
      let checked = 0;
      const out: Diagnostic[] = [];
      for (const p of [...cache.keys()]) if (!(p in files)) cache.delete(p);
      for (const [p, text] of Object.entries(files)) {
        let hit = cache.get(p);
        if (!hit || hit.text !== text || hit.stamp !== stamp) {
          hit = { text, stamp, diags: checkFile(rules, p, text, all, opts) };
          cache.set(p, hit);
          checked++;
        }
        out.push(...hit.diags);
      }
      runner.lastChecked = checked;
      return out;
    },
  };
  return runner;
}
