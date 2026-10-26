/**
 * `defineElement`: one definition per element type. Its `props` bindings derive source
 * edits, the inspector form, lint, insert and AI docs from a single schema per prop.
 */
import { EXTENSION, type Extension } from "../extensions/extension";
import { elementsFacet, parserTagsFacet, rulesFacet } from "../extensions/facets";
import { compileSelector, type SelectorTree } from "./selector";
import { NodeTypes } from "../parse/parse";
import type { ParseLike } from "../parse/environment";
import type { TreeNode } from "../parse/tree";
import type { Binding, BindingOptions } from "./bindings";
import type { NodeHandle } from "../state/handles";
import type { TransactionBuilder } from "../state/builder";
import { inspectorSpecOf, type InspectorSpec } from "./inspectorSpec";

export type PropsSpec = Record<string, Binding<any>>;
export type PropsOf<P extends PropsSpec> = { [K in keyof P]: P[K] extends Binding<infer T> ? T | undefined : never };
export type MatchSpec = string | { tag: "liquid"; name: string } | ((n: TreeNode, tree: SelectorTree) => boolean);

/** Editor-half component, loaded lazily. */
export type LazyComponent = () => Promise<unknown>;

export interface Migration {
  from: number;
  run(tr: TransactionBuilder, h: NodeHandle): void;
}

export interface ElementDefInput<P extends PropsSpec> {
  name: string;
  match: MatchSpec;
  props: P;
  children?: { allow?: string[]; deny?: string[] };
  canvas?: unknown;
  /** Sections, type and hide rules the inspector applies (`inspectorSpec.ts`), "auto", or a panel. */
  inspector?: "auto" | InspectorSpec | LazyComponent;
  lint?: unknown[];
  insert?: { label: string; icon: string; template: string; category?: string };
  describe: string;
  /** A new element of this kind inserted into one of these parents (element names) copies the look of a same-kind sibling (`peerInherit.ts`). */
  peerInherit?: { whenParentIs: string[]; reference?: "left-neighbor" | "right-neighbor" };
  version?: number;
  migrations?: Migration[];
  /** For a Liquid block tag: register it with the parser like this built-in (`form` = block with named args). */
  parseLike?: ParseLike;
}

export interface ElementDef<P extends PropsSpec = PropsSpec> extends Readonly<ElementDefInput<P>> {
  matches(n: TreeNode, tree: SelectorTree): boolean;
  /** Every prop, read through its binding. */
  read(h: NodeHandle, opts?: BindingOptions): PropsOf<P>;
  readProp<K extends keyof P & string>(h: NodeHandle, prop: K, opts?: BindingOptions): PropsOf<P>[K];
  /** Write one prop as the minimal source edit. */
  write<K extends keyof P & string>(tr: TransactionBuilder, h: NodeHandle, prop: K, value: PropsOf<P>[K], opts?: BindingOptions): TransactionBuilder;
  /** JSON Schema of the props (inspector forms, MCP, docs). */
  propsSchema(): Record<string, unknown>;
  /** The inspector rules for a node of this element with that tag (`byTag` applied). */
  inspectorFor(tag?: string): InspectorSpec;
  [EXTENSION](): Extension;
}

function compileMatch(match: MatchSpec): (n: TreeNode, tree: SelectorTree) => boolean {
  if (typeof match === "function") return match;
  if (typeof match === "string") return compileSelector(match);
  const name = match.name;
  return (n) =>
    (n.kind === "liquid-block" && n.tag === name) ||
    (n.kind === "content" && n.type === NodeTypes.LiquidTag && (n.node as { name: string }).name === name);
}

export function defineElement<P extends PropsSpec>(def: ElementDefInput<P>): ElementDef<P> {
  const test = compileMatch(def.match);
  const binding = (prop: string): Binding<any> => {
    const b = def.props[prop];
    if (!b) throw new Error(`element "${def.name}" has no prop "${prop}"`);
    return b;
  };
  const el: ElementDef<P> = {
    ...def,
    matches: test,
    read: (h, opts) => Object.fromEntries(Object.entries(def.props).map(([k, b]) => [k, b.read(h, opts)])) as PropsOf<P>,
    readProp: (h, prop, opts) => binding(prop).read(h, opts),
    write: (tr, h, prop, value, opts) => {
      const b = binding(prop);
      if (value !== undefined) b.schema.validate(value);
      return b.write(tr, h, value, opts);
    },
    inspectorFor: (tag) => inspectorSpecOf(def, tag),
    propsSchema: () => ({
      type: "object",
      title: def.name,
      description: def.describe,
      properties: Object.fromEntries(Object.entries(def.props).map(([k, b]) => [k, { ...b.schema.toJSONSchema(), "x-binding": `${b.kind}:${b.name}` }])),
      additionalProperties: false,
    }),
    [EXTENSION]: () => [
      elementsFacet.of(el),
      ...(def.lint ?? []).map((r) => rulesFacet.of(r)),
      ...(def.parseLike && typeof def.match === "object" ? [parserTagsFacet.of({ name: def.match.name, parseLike: def.parseLike })] : []),
    ],
  };
  return el;
}
