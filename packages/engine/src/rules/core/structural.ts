/** The structural rules: what keeps stored source editable. */
import { EDITABLE_ATTRIBUTE, isEditAttribute } from "../../attributes/editAttributes";
import { ATTRIBUTE_TYPES, NodeTypes, elementName, type ElementNode, type LiquidHtmlNode } from "../../parse/parse";
import { defineRule } from "../defineRule";
import { attrsOf } from "../util";
import { jsIn } from "./security";

/** Convert a parser error's 1-based line / column to an offset. */
function offsetOf(source: string, line: number, column: number): number {
  let offset = 0;
  for (let l = 1; l < line; l++) {
    const nl = source.indexOf("\n", offset);
    if (nl === -1) return source.length;
    offset = nl + 1;
  }
  return Math.min(source.length, offset + Math.max(0, column - 1));
}

export const parseRule = defineRule({
  meta: { id: "parse", severity: "error", description: "The file must be well-formed HTML + Liquid (strict parse)." },
  create(ctx) {
    return {
      ParseError(err) {
        const range = err.loc
          ? // the parser reports 1-based columns, with an inclusive end
            { start: offsetOf(ctx.source, err.loc.start.line, err.loc.start.column), end: Math.min(ctx.source.length, offsetOf(ctx.source, err.loc.end.line, err.loc.end.column) + 1) }
          : { start: 0, end: 0 };
        ctx.report({ range, message: err.message.split("\n")[0]! });
      },
    };
  },
});

/**
 * The one Liquid an attribute list may hold: a gated action, the form the editor's "only fire when" writes
 * (`actionGate.ts` in @pagehub/editor): `<button {% if customer %}data-cart="add"{% endif %}>`. Exactly one `{% if %}`
 * branch (no `{% elsif %}` / `{% else %}`) holding only action attributes with static names: runtime `data-*` ones and
 * the native action attributes (`href`, `target`, `rel`, `command`, `commandfor`, `action`, `download`). Never script
 * (`on*`, a `javascript:` URL), an editor attribute (`data-edit-*`, `data-editable`), `class`, `id` or `style`. Values
 * may carry `{{ output }}`.
 */
const GATED_NATIVE = new Set(["href", "target", "rel", "command", "commandfor", "action", "download"]);

function isGatedAction(el: ElementNode, attr: LiquidHtmlNode): boolean {
  if (attr.type !== NodeTypes.LiquidTag || (attr as { name: string }).name !== "if") return false;
  const branches = (attr as { children?: LiquidHtmlNode[] }).children ?? [];
  if (branches.length !== 1) return false;
  const inner = (branches[0] as { children?: LiquidHtmlNode[] }).children ?? [];
  if (!inner.length || !inner.every((a) => ATTRIBUTE_TYPES.has(a.type) && !hasLiquidPart((a as { name: unknown }).name))) return false;
  const attrs = attrsOf({ attributes: inner } as unknown as ElementNode);
  if (attrs.some((a) => !(GATED_NATIVE.has(a.name) || a.name.startsWith("data-")) || isEditAttribute(a.name) || a.name === EDITABLE_ATTRIBUTE)) return false;
  return !jsIn("gate", attrs.map((a) => ({ name: a.name, value: a.name.startsWith("on") ? a.value : a.prefix, dynamic: a.dynamic }))).length && !jsIn(elementName(el), []).length;
}

export const noLiquidInAttrList = defineRule({
  meta: {
    id: "no-liquid-in-attr-list",
    severity: "error",
    description:
      "No Liquid tag or output in an attribute list; put the whole element inside the {% if %}. One exception, a gated action: <button {% if customer %}data-cart=\"add\"{% endif %}> (one {% if %}, no else, holding only data-* or href / target / rel / command / commandfor / action / download; never data-edit-* or javascript:).",
  },
  create: (ctx) => ({
    Element(el: ElementNode) {
      for (const attr of el.attributes) {
        if (attr.type === NodeTypes.LiquidTag && isGatedAction(el, attr)) continue;
        if (attr.type === NodeTypes.LiquidTag || attr.type === NodeTypes.LiquidVariableOutput) {
          ctx.report({ node: attr, message: `Liquid in the attribute list of <${elementName(el)}>` });
        }
      }
    },
  }),
});

export const noTagInAttrValue = defineRule({
  meta: { id: "no-tag-in-attr-value", severity: "error", description: "No {% tag %} inside an attribute value; {{ output }} is fine." },
  create: (ctx) => ({
    LiquidTag(node: LiquidHtmlNode, parent) {
      if (parent && ATTRIBUTE_TYPES.has(parent.type)) ctx.report({ node, message: `{% ${(node as { name: string }).name} %} inside an attribute value` });
    },
  }),
});

export const noDanglingOpen = defineRule({
  meta: { id: "no-dangling-open", severity: "error", description: "An element opened in one Liquid branch must close in the same branch." },
  create: (ctx) => ({
    // Opened in a branch, never closed there: the parser records a zero-width close.
    HtmlElement(node: Extract<ElementNode, { type: NodeTypes.HtmlElement }>) {
      if (node.blockEndPosition.start === node.blockEndPosition.end) ctx.report({ node, message: `<${elementName(node)}> is not closed in the branch that opens it` });
    },
  }),
});

export const noDanglingClose = defineRule({
  meta: { id: "no-dangling-close", severity: "error", description: "A closing tag needs its opening tag in the same branch." },
  create: (ctx) => ({
    HtmlDanglingMarkerClose: (node: LiquidHtmlNode) => ctx.report({ node, message: "closing tag without an opening tag in the same branch" }),
  }),
});

const hasLiquidPart = (name: unknown): boolean => Array.isArray(name) && name.some((part: { type: string }) => part.type !== NodeTypes.TextNode);

export const staticAttrName = defineRule({
  meta: { id: "static-attr-name", severity: "error", description: "Attribute names must be static text." },
  create: (ctx) => ({
    Element(el: ElementNode) {
      for (const attr of el.attributes) {
        if (ATTRIBUTE_TYPES.has(attr.type) && hasLiquidPart((attr as { name: unknown }).name)) ctx.report({ node: attr, message: `Liquid in an attribute name on <${elementName(el)}>` });
      }
    },
  }),
});

export const staticTagName = defineRule({
  meta: { id: "static-tag-name", severity: "error", description: "Tag names must be static text." },
  create: (ctx) => ({
    Element(el: ElementNode) {
      if (hasLiquidPart(el.name)) ctx.report({ node: el, message: "Liquid in a tag name" });
    },
  }),
});
