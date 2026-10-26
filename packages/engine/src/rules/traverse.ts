/**
 * The one shared traversal. Walks the parser tree generically (every object child with a
 * string `type`), in document order, calling enter / exit handlers keyed by node type and the
 * pseudo keys `Element` and `Attribute`.
 */
import { ATTRIBUTE_TYPES, isElement, type DocumentNode, type LiquidHtmlNode } from "../parse/parse";

export type Handler = (node: LiquidHtmlNode, parent: LiquidHtmlNode | undefined) => void;
export type HandlerMap = Map<string, Handler[]>;

const SKIP = new Set(["source", "position", "blockStartPosition", "blockEndPosition", "markupPosition", "whitespaceStart", "whitespaceEnd"]);

const isNode = (v: unknown): v is LiquidHtmlNode => !!v && typeof v === "object" && typeof (v as { type?: unknown }).type === "string";

function keysFor(node: LiquidHtmlNode): string[] {
  const keys: string[] = [node.type];
  if (isElement(node)) keys.push("Element");
  if (ATTRIBUTE_TYPES.has(node.type)) keys.push("Attribute");
  return keys;
}

export function traverse(root: DocumentNode, handlers: HandlerMap, ancestors: LiquidHtmlNode[]): void {
  const call = (suffix: "" | ":exit", node: LiquidHtmlNode, parent: LiquidHtmlNode | undefined) => {
    for (const key of keysFor(node)) for (const h of handlers.get(key + suffix) ?? []) h(node, parent);
  };
  const visit = (node: LiquidHtmlNode, parent: LiquidHtmlNode | undefined) => {
    call("", node, parent);
    ancestors.push(node);
    for (const k of Object.keys(node)) {
      if (SKIP.has(k)) continue;
      const v = (node as unknown as Record<string, unknown>)[k];
      if (Array.isArray(v)) for (const c of v) isNode(c) && visit(c, node);
      else if (isNode(v)) visit(v, node);
    }
    ancestors.pop();
    call(":exit", node, parent);
  };
  for (const h of handlers.get("Program") ?? []) h(root, undefined);
  ancestors.push(root);
  for (const k of Object.keys(root)) {
    const v = (root as unknown as Record<string, unknown>)[k];
    if (Array.isArray(v)) for (const c of v) isNode(c) && visit(c, root);
  }
  ancestors.pop();
  for (const h of handlers.get("Program:exit") ?? []) h(root, undefined);
}
