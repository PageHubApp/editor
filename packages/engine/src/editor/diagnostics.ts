/**
 * Rules in a live editor: the configured rules (`rulesFacet`) run after every
 * dispatch that changed text (`onBatchComplete`, incremental by file) into `editor.diagnostics`,
 * and on save (`prepareWrite`): sanitize fixes are applied to the written text, and any
 * error-severity diagnostic left blocks that file's write. The rule registry — known tags and
 * filters, and which filters are trusted HTML — comes from the configured `tagsFacet` /
 * `filtersFacet` plus the built-ins every renderer has.
 */
import { Liquid } from "liquidjs";
import type { Configuration, Extension } from "../extensions/extension";
import { parserTagsFacet, rulesFacet } from "../extensions/facets";
import { REMOVED_TAGS } from "../liquid/engine";
import { onBatchComplete } from "../normalize/hooks";
import { BUILTIN_FILTER_DEFS, BUILTIN_TAGS } from "../runtime/builtins";
import { filtersFacet, tagsFacet } from "../runtime/facets";
import { sanitizeSource } from "../rules/fixer";
import { createRuleRunner, runRules, type Diagnostic, type RunOptions, type RuleRunner } from "../rules/run";
import type { Rule } from "../rules/defineRule";
import { prepareWrite } from "../storage/defineStorage";
import type { EditorState } from "../state/state";
import type { Path } from "../state/changes";

/** Files rules check (markup). */
export const isMarkup = (p: Path): boolean => /\.(liquid|html?)$/.test(p);

let core: { tags: string[]; filters: string[] } | undefined;
const coreNames = () => {
  if (!core) {
    const l = new Liquid();
    core = { tags: Object.keys(l.tags), filters: Object.keys(l.filters) };
  }
  return core;
};

/** Rule options for a configuration: registry (core + built-in + configured tags / filters), trusted filters, parser environment. */
export function ruleOptionsOf(config: Configuration): RunOptions {
  const removed = new Set<string>(REMOVED_TAGS);
  const tags = config.facet(tagsFacet);
  const filters = config.facet(filtersFacet);
  return {
    env: config.facet(parserTagsFacet),
    registry: {
      tags: new Set([...coreNames().tags.filter((n) => !removed.has(n)), ...BUILTIN_TAGS.map((t) => t.name), ...tags.keys()]),
      filters: new Set([...coreNames().filters, ...BUILTIN_FILTER_DEFS.map((f) => f.name), ...filters.keys()]),
      removedTags: removed,
    },
    trustedFilters: [...filters.values()].filter((f) => f.returns === "html").map((f) => f.name),
  };
}

const markupFiles = (state: EditorState): Record<string, string> => Object.fromEntries([...state.files].filter(([p]) => isMarkup(p)));

const errorText = (d: Diagnostic, source: string): string => {
  const before = source.slice(0, d.range.start);
  const line = before.split("\n").length;
  return `${d.rule}: ${d.message} (line ${line}, column ${d.range.start - before.lastIndexOf("\n")})`;
};

export class DiagnosticsTracker {
  private runner: RuleRunner | null = null;
  private config: Configuration | null = null;
  private rules: readonly Rule<any>[] = [];
  private opts: RunOptions = {};
  private files: EditorState["files"] | null = null;
  private current: readonly Diagnostic[] = [];

  /** The hooks to configure: diagnostics after each dispatch, sanitize + error gate on save. */
  readonly extension: Extension = [
    onBatchComplete("rules", (state) => void this.update(state)),
    prepareWrite("rules", ({ path, text, state }) => {
      if (!isMarkup(path)) return;
      this.configure(state);
      if (!this.rules.length) return;
      const files = { ...markupFiles(state), [path]: text };
      const { output } = sanitizeSource(text, this.rules, { ...this.opts, path, files });
      const errors = runRules(this.rules, { ...files, [path]: output }, { ...this.opts, files }, [path]).filter((d) => d.severity === "error");
      return { text: output, errors: errors.map((d) => errorText(d, output)) };
    }),
  ];

  private configure(state: EditorState): void {
    if (this.config === state.config) return;
    this.config = state.config;
    this.rules = state.facet(rulesFacet) as Rule<any>[];
    this.opts = ruleOptionsOf(state.config);
    this.runner = createRuleRunner(this.rules, this.opts);
    this.files = null;
  }

  /** Diagnostics for `state` (recomputed only for files whose text changed). */
  update(state: EditorState): readonly Diagnostic[] {
    this.configure(state);
    if (this.files !== state.files) {
      this.files = state.files;
      this.current = this.rules.length ? this.runner!.run(markupFiles(state)) : [];
    }
    return this.current;
  }
}
