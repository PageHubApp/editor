/** Shared plumbing for the per-element inspector controls. */
import { NodeTypes, isElement, parseSource, type ElementTreeNode, type LiquidHtmlNode, type NodeHandle } from "@pagehub/engine";
import { innerRange } from "@pagehub/engine/kits";
import { useEditorState } from "../../../../react/bindings";
import type { RowDef } from "../../rows/inspectorRows";

export interface ElementControlProps {
  handle: NodeHandle;
  row: RowDef;
}

/** Stable per-handle key so an uncontrolled field keeps focus across edits but resets per element. */
const keys = new WeakMap<object, number>();
let nextKey = 0;
export const handleKey = (h: object): number => {
  let k = keys.get(h);
  if (k === undefined) keys.set(h, (k = ++nextKey));
  return k;
};

/** The element's live tag, re-read on every file change (`handle.tag` is fixed at construction). */
export function useLiveTag(handle: NodeHandle): string {
  return useEditorState((s) => {
    void s.files.get(handle.path);
    return liveTag(handle);
  });
}

/** Live tag read outside React, for the registry's type gate. */
export function liveTag(handle: NodeHandle): string {
  try {
    if (!handle.alive) return "";
    const node = handle.node();
    return node.kind === "element" ? node.tag : "";
  } catch {
    return "";
  }
}

/**
 * The text of a node list inside `source[from, to)`: text nodes and Liquid source as written, the whitespace
 * between siblings kept, tags and comments dropped, elements contributing their own text.
 */
export function textOfNodes(source: string, nodes: readonly LiquidHtmlNode[], from = 0, to = source.length): string {
  let out = "";
  let at = from;
  for (const n of nodes) {
    out += source.slice(at, n.position.start);
    if (n.type === NodeTypes.TextNode) out += n.value;
    else if (n.type === NodeTypes.HtmlElement) out += textOfNodes(source, n.children, n.blockStartPosition.end, n.blockEndPosition.start);
    else if (n.type !== NodeTypes.HtmlComment && !isElement(n)) out += source.slice(n.position.start, n.position.end);
    at = n.position.end;
  }
  return out + source.slice(at, to);
}

/** The text between an element's open and close tags. */
export function textOfElement(source: string, el: Extract<LiquidHtmlNode, { type: NodeTypes.HtmlElement }>): string {
  return textOfNodes(source, el.children, el.blockStartPosition.end, el.blockEndPosition.start);
}

/** A markup fragment's text, read from the engine's parse (tags dropped, Liquid kept). Unparseable markup reads as empty. */
export function plainText(source: string): string {
  try {
    return textOfNodes(source, parseSource(source, "tolerant").children).trim();
  } catch {
    return "";
  }
}

/** The element's inner source (between its open and close tags), trimmed; re-read on every file change. */
export function useLeafInner(handle: NodeHandle): string {
  return useEditorState((s) => {
    const src = s.files.get(handle.path);
    if (!src) return "";
    try {
      const { from, to } = innerRange(handle.node() as ElementTreeNode);
      return src.slice(from, to).trim();
    } catch {
      return "";
    }
  });
}
