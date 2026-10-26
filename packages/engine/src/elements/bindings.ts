/**
 * Bindings map a prop to source: `attr(name, schema)` (an attribute), `arg(name, schema)`
 * (a Liquid tag argument), `cls(group)` (one class group, per variant), `text()` (inner
 * text) and `tagName(allowed)`. Each reads from a handle and writes through the builder,
 * so a prop write is always the minimal text change.
 */
import { EditError, unescapeText } from "../edit/ops";
import { NodeTypes } from "../parse/parse";
import { t, SchemaError, type Schema } from "../schema/t";
import type { NodeHandle } from "../state/handles";
import type { TransactionBuilder } from "../state/builder";

export interface BindingOptions {
  /** Class variant prefix for `cls` (`md`, `hover`, `md:hover`); none = base. */
  variant?: string;
}

export interface Binding<T> {
  readonly kind: "attr" | "arg" | "cls" | "text" | "tagName";
  /** Attribute / argument name, class group id, `text` or `tagName`. */
  readonly name: string;
  readonly schema: Schema<T>;
  read(h: NodeHandle, opts?: BindingOptions): T | undefined;
  write(tr: TransactionBuilder, h: NodeHandle, value: T | undefined, opts?: BindingOptions): TransactionBuilder;
}

const missing = <T>(schema: Schema<T>): T | undefined => {
  const r = schema.check(undefined);
  return r.ok ? r.value : undefined;
};

export function attr<T>(name: string, schema: Schema<T>): Binding<T> {
  return {
    kind: "attr",
    name,
    schema,
    read(h) {
      const v = h.attr(name);
      if (v === undefined) return missing(schema);
      try {
        return schema.parse(v, "attr");
      } catch (e) {
        if (e instanceof SchemaError) return undefined; // holds Liquid, or isn't valid for the schema
        throw e;
      }
    },
    write: (tr, h, value) => tr.setAttr(h, name, value === undefined || value === null ? null : schema.serialize(value, "attr")),
  };
}

export function arg<T>(name: string, schema: Schema<T>): Binding<T> {
  return {
    kind: "arg",
    name,
    schema,
    read(h) {
      const a = h.args().find((x) => x.name === name);
      if (!a) return missing(schema);
      try {
        return schema.parse(a.source, "arg");
      } catch (e) {
        if (e instanceof SchemaError) return undefined; // a Liquid expression, not a literal
        throw e;
      }
    },
    write(tr, h, value) {
      if (value === undefined) throw new EditError(`argument ${name} can't be removed`);
      return tr.setTagArg(h, name, schema.serialize(value, "arg"));
    },
  };
}

/** A class group: one utility family (`text-size`, `bg-color`), matched per token. */
export interface ClassGroup {
  id: string;
  /** Allowed tokens (without variant prefix). */
  values?: readonly string[];
  /** Token test; defaults to membership in `values`. */
  match?: (token: string) => boolean;
  /** Ids of groups whose tokens a write of this group removes in the same scope (`p` removes `px`, `pt` ...). */
  conflicts?: readonly string[];
}

/**
 * The one class-token parser (cls binding and tailwind kit): `[variant prefix incl. trailing ":", utility]`.
 * Splits at the last colon outside `[...]` / `(...)`, so arbitrary values (`md:[--x:1px]`,
 * `bg-[url(https://a.b/c.png)]`) keep their colons.
 */
export function splitClass(token: string): [string, string] {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ":" && depth === 0) cut = i;
  }
  return cut < 0 ? ["", token] : [token.slice(0, cut + 1), token.slice(cut + 1)];
}

/** Whether a variant-free utility belongs to the group. */
export const groupTest = (g: ClassGroup): ((token: string) => boolean) => g.match ?? ((tok: string) => !!g.values?.includes(tok));

export function cls(group: ClassGroup): Binding<string> {
  const test = groupTest(group);
  const schema = group.values ? (t.enum(group.values as string[]) as Schema<string>) : t.string();
  const hits = (h: NodeHandle, variant = "") => h.classes().filter((c) => {
    const [prefix, base] = splitClass(c);
    return prefix === (variant ? `${variant}:` : "") && test(base);
  });
  return {
    kind: "cls",
    name: group.id,
    schema: schema.optional() as Schema<string>,
    read: (h, opts) => {
      const hit = hits(h, opts?.variant).at(-1);
      return hit === undefined ? undefined : splitClass(hit)[1];
    },
    write(tr, h, value, opts) {
      if (value !== undefined) schema.validate(value);
      const variant = opts?.variant ?? "";
      const remove = new Set(hits(h, variant));
      const token = value === undefined ? null : variant ? `${variant}:${value}` : value;
      const out: string[] = [];
      let placed = token === null;
      for (const c of h.classes()) {
        if (!remove.has(c)) out.push(c);
        else if (!placed) out.push(token!), (placed = true);
      }
      if (!placed) out.push(token!);
      return tr.setAttr(h, "class", out.length ? out.join(" ") : null);
    },
  };
}

/** Inner text of an element (or a text node's text), as the visitor reads it. */
export function text(): Binding<string> {
  const schema = t.string();
  return {
    kind: "text",
    name: "text",
    schema,
    read(h) {
      const n = h.node();
      if (n.kind === "content") return unescapeText(h.text());
      if (n.kind !== "element") return undefined;
      const real = n.children.filter((c) => !(c.kind === "content" && c.node.type === NodeTypes.TextNode && !c.node.value.trim()));
      if (!real.length) return "";
      const src = h.text();
      return unescapeText(src.slice(real[0]!.range.start - n.range.start, real.at(-1)!.range.end - n.range.start));
    },
    write: (tr, h, value) => tr.setText(h, value ?? ""),
  };
}

export function tagName<const V extends string>(allowed: readonly V[]): Binding<V> {
  const schema = t.enum(allowed);
  return {
    kind: "tagName",
    name: "tagName",
    schema,
    read: (h) => (allowed as readonly string[]).includes(h.tag) ? (h.tag as V) : undefined,
    write: (tr, h, value) => tr.setTagName(h, schema.validate(value)),
  };
}
