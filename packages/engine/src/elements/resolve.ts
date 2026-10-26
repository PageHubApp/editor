/**
 * Element resolution: the first registered element (in precedence order) whose `match`
 * accepts a tree node. Markup no element claims resolves to a generic one —
 * `html.element`, `liquid.tag` or `text` — so every node has a definition.
 */
import { elementsFacet } from "../extensions/facets";
import { defineElement, type ElementDef } from "./defineElement";
import type { EditorState } from "../state/state";
import type { SelectorTree } from "./selector";
import type { TreeNode } from "../parse/tree";

export const htmlElement = defineElement({ name: "html.element", match: (n) => n.kind === "element", props: {}, describe: "Any HTML element." });
export const liquidTagElement = defineElement({
  name: "liquid.tag",
  match: (n) => n.kind === "liquid-block" || (n.kind === "content" && n.type === "LiquidTag"),
  props: {},
  describe: "A Liquid tag no element claims.",
});
export const textElement = defineElement({ name: "text", match: () => true, props: {}, describe: "Text, a Liquid output or a comment." });

const memo = new WeakMap<object, WeakMap<TreeNode, ElementDef<any>>>();

export function resolveElement(state: EditorState, n: TreeNode, tree: SelectorTree): ElementDef<any> {
  let byNode = memo.get(state.config);
  if (!byNode) memo.set(state.config, (byNode = new WeakMap()));
  let el = byNode.get(n);
  if (!el) {
    el = state.facet(elementsFacet).find((e) => e.matches(n, tree)) ?? (n.kind === "element" ? htmlElement : liquidTagElement.matches(n, tree) ? liquidTagElement : textElement);
    byNode.set(n, el);
  }
  return el;
}
