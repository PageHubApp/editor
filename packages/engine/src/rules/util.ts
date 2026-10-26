/** Small readers shared by the core rules. */
import { NodeTypes, segmentsText, ATTRIBUTE_TYPES, type ElementNode, type LiquidHtmlNode, type Range } from "../parse/parse";
import type { Splice } from "../edit/ops";

export interface Attr {
  /** Lower-cased static name. */
  name: string;
  node: LiquidHtmlNode;
  range: Range;
  /** Static text of the value ("" for a bare attribute). Parts that are Liquid are dropped. */
  value: string;
  /** The value contains `{{ }}` / `{% %}`. */
  dynamic: boolean;
  /** Static text before the first Liquid part. */
  prefix: string;
}

export function attrsOf(el: ElementNode): Attr[] {
  const out: Attr[] = [];
  for (const a of el.attributes as LiquidHtmlNode[]) {
    if (!ATTRIBUTE_TYPES.has(a.type)) continue;
    const parts = ("value" in a && Array.isArray((a as { value: unknown }).value) ? (a as { value: LiquidHtmlNode[] }).value : []) as LiquidHtmlNode[];
    const texts = parts.filter((p) => p.type === NodeTypes.TextNode).map((p) => (p as { value: string }).value);
    const first = parts.findIndex((p) => p.type !== NodeTypes.TextNode);
    const prefix = parts.slice(0, first === -1 ? parts.length : first).map((p) => (p as { value: string }).value).join("");
    out.push({
      name: segmentsText((a as unknown as { name: never }).name).toLowerCase(),
      node: a,
      range: { start: a.position.start, end: a.position.end },
      value: texts.join(""),
      dynamic: first !== -1,
      prefix,
    });
  }
  return out;
}

export const attrOf = (el: ElementNode, name: string): Attr | undefined => attrsOf(el).find((a) => a.name === name);

/** Splice removing a node's range together with the whitespace before it (an attribute). */
export function removeWithLeadingSpace(source: string, range: Range): Splice {
  let from = range.start;
  while (from > 0 && /\s/.test(source[from - 1]!)) from--;
  return { from, to: range.end, insert: "" };
}
