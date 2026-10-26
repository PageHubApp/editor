/**
 * ESLint-shaped rules. `defineRule({ meta, create })`: `create(ctx)` runs once per file and
 * returns visitor callbacks keyed by parser node type (`HtmlElement`, `LiquidTag`,
 * `LiquidVariableOutput`, `NamedArgument`, …), plus the pseudo keys `Element` (any HTML element),
 * `Attribute` (any attribute node), `Program` (the document) and `<key>:exit` for each. One shared
 * traversal (see run.ts) calls every rule's visitors, so adding a rule never adds a pass.
 *
 * A report carries a source range and optionally a fix (applied by default) and suggestions
 * (offered, never applied unasked), both as text splices in the file's own coordinates. Plugins
 * that need handles resolve them from the range at apply time; rules stay pure functions of text.
 */
import { EXTENSION, type Extension } from "../extensions/extension";
import { rulesFacet } from "../extensions/facets";
import type { Splice } from "../edit/ops";
import type { LiquidHtmlNode, Positioned, Range } from "../parse/parse";

export type Severity = "error" | "warning";
/** `sanitize` fixes are applied on every write (bad `data-edit-*` values); `fix` fixes only on request. */
export type FixKind = "fix" | "sanitize";

export interface RuleMeta {
  id: string;
  severity: Severity;
  description: string;
  /** What kind of fix this rule's reports carry. Default `fix`. */
  fixKind?: FixKind;
  /** The rule reads other files (`bundle`): its result depends on them, so the runner re-checks it when they change. */
  needs?: readonly "bundle"[];
}

export interface Suggestion {
  desc: string;
  splices: Splice[];
}

export interface Report {
  /** The node the report points at, or an explicit range. */
  node?: Positioned;
  range?: Range;
  message: string;
  fix?: Splice[];
  suggestions?: Suggestion[];
}

/** Names the site registers; rules that check them are inert when the set is absent. */
export interface RuleRegistry {
  tags?: ReadonlySet<string>;
  filters?: ReadonlySet<string>;
  /** Tags that existed once and were removed on purpose (named in the message). */
  removedTags?: ReadonlySet<string>;
}

export interface RuleContext<O = unknown> {
  readonly path: string;
  readonly source: string;
  readonly options: O;
  readonly registry: RuleRegistry;
  /** Filters whose output is trusted HTML (builtin `returns: "html"` + any registered `raw: true`). */
  readonly trustedFilters: ReadonlySet<string>;
  /** Parser environment of the site (custom block tags). */
  readonly env: import("../parse/environment").Environment | undefined;
  /** Another file of the bundle by path, or undefined. */
  file(path: string): string | undefined;
  /** Parent chain of the node being visited, outermost first (excludes the node). */
  readonly ancestors: readonly LiquidHtmlNode[];
  report(r: Report): void;
}

/** Receives the parse failure instead of every other visitor when the file does not parse strict. */
export type ParseErrorHandler = (error: Error & { loc?: { start: { line: number; column: number }; end: { line: number; column: number } } }) => void;

export type Visitor = {
  [key: string]: ((node: any, parent: LiquidHtmlNode | undefined) => void) | undefined;
} & {
  /** Called instead of every other visitor when the file does not parse strict. */
  ParseError?: ParseErrorHandler;
};

export interface Rule<O = unknown> {
  readonly meta: RuleMeta;
  create(ctx: RuleContext<O>): Visitor;
  [EXTENSION](): Extension;
}

export function defineRule<O = unknown>(def: { meta: RuleMeta; create(ctx: RuleContext<O>): Visitor }): Rule<O> {
  if (!/^[a-z][a-z0-9-]*$/.test(def.meta.id)) throw new Error(`rule id "${def.meta.id}" must be kebab-case`);
  const rule: Rule<O> = { ...def, [EXTENSION]: () => rulesFacet.of(rule) };
  return rule;
}
