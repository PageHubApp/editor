/** Markup helpers for FormElement controls: outer-source split, attribute filtering, option and label parsing. */
import { NodeTypes, allNodes, elementName, parseSource, segmentsText, type ElementTreeNode, type NodeHandle } from "@pagehub/engine";
import { escapeAttr, escapeMarkupText } from "@pagehub/engine/render";
import { useEditorState } from "../../../../react/bindings";
import { plainText, textOfElement } from "./elementControlShared";

export const FORM_TAGS = ["input", "textarea", "select"] as const;
export type FormTag = (typeof FORM_TAGS)[number];

/** The inspected element's outer source, split into open tag / attributes / inner / close tag. */
export interface Outer {
  tag: string;
  /** The `<tag …>` open tag, verbatim. */
  openSrc: string;
  /** The `</tag>` close tag, verbatim; "" for a void / self-closing element. */
  closeSrc: string;
  /** The attribute source between the tag name and `>`, trimmed. */
  attrsSrc: string;
  /** The source between the open and close tags. */
  inner: string;
  hasClose: boolean;
}

export const EMPTY_OUTER: Outer = { tag: "", openSrc: "", closeSrc: "", attrsSrc: "", inner: "", hasClose: false };

export function useOuter(handle: NodeHandle): Outer {
  return useEditorState((s) => {
    const src = s.files.get(handle.path);
    if (!src || !handle.alive || handle.kind !== "element") return EMPTY_OUTER;
    try {
      const node = handle.node() as ElementTreeNode;
      const openSrc = src.slice(node.openTag.start, node.openTag.end);
      // from the first attribute's start to the last one's end, as written (the engine's attribute ranges)
      const first = node.attributes[0];
      const last = node.attributes[node.attributes.length - 1];
      const attrsSrc = first && last ? src.slice(first.range.start, last.range.end).trim() : "";
      const hasClose = !!node.closeTag;
      const closeSrc = node.closeTag ? src.slice(node.closeTag.start, node.closeTag.end) : "";
      const inner = node.closeTag ? src.slice(node.openTag.end, node.closeTag.start) : "";
      return { tag: node.tag, openSrc, closeSrc, attrsSrc, inner, hasClose };
    } catch {
      return EMPTY_OUTER;
    }
  }, shallowOuter);
}

const shallowOuter = (a: Outer, b: Outer): boolean =>
  a.tag === b.tag && a.openSrc === b.openSrc && a.closeSrc === b.closeSrc && a.inner === b.inner;

/** The attribute source with the named attributes removed (whole `name="…"` tokens). */
export function dropAttrs(handle: NodeHandle, drop: readonly string[]): string {
  if (!handle.alive || handle.kind !== "element") return "";
  const node = handle.node() as ElementTreeNode;
  const outer = handle.text(); // the element's own source; `attributes[].range` are file offsets
  const base = node.range.start;
  const skip = new Set(drop.map((d) => d.toLowerCase()));
  return node.attributes
    .filter((a) => a.liquid || !skip.has(a.name.toLowerCase()))
    .map((a) => outer.slice(a.range.start - base, a.range.end - base))
    .join(" ")
    .trim();
}


export interface OptionItem {
  value: string;
  label: string;
}

/** The `<option>` elements of a select's inner source, read from the engine's parse (never a regex over markup). */
export function parseOptions(inner: string): OptionItem[] {
  let doc;
  try {
    doc = parseSource(inner, "tolerant");
  } catch {
    return [];
  }
  const out: OptionItem[] = [];
  for (const [node] of allNodes(doc)) {
    if (node.type !== NodeTypes.HtmlElement || elementName(node).toLowerCase() !== "option") continue;
    const attr = node.attributes.find((a) => (a.type === NodeTypes.AttrDoubleQuoted || a.type === NodeTypes.AttrSingleQuoted) && segmentsText(a.name).toLowerCase() === "value");
    const value = attr && "attributePosition" in attr ? inner.slice(attr.attributePosition.start, attr.attributePosition.end) : "";
    out.push({ value, label: textOfElement(inner, node).trim() });
  }
  return out;
}

export function buildOptionsInner(opts: readonly OptionItem[]): string {
  if (!opts.length) return "";
  return `\n  ${opts.map((o) => `<option value="${escapeAttr(o.value)}">${escapeMarkupText(o.label)}</option>`).join("\n  ")}\n`;
}

/** Find the `<label>` that names this field: a wrapping `<label>`, or a sibling `<label for="id">`. */
export function findLabel(handle: NodeHandle): NodeHandle | null {
  if (!handle.alive || handle.kind !== "element") return null;
  const parent = handle.parent();
  if (parent && parent.kind === "element" && parent.tag === "label") return parent;
  const id = handle.attr("id");
  if (!id || !parent) return null;
  for (const sib of parent.children()) {
    if (sib.kind === "element" && sib.tag === "label" && sib.attr("for") === id) return sib;
  }
  return null;
}

export function innerTextOf(handle: NodeHandle): string {
  try {
    const node = handle.node() as ElementTreeNode;
    if (!node.closeTag) return "";
    const src = handle.text();
    const open = node.openTag.end - node.range.start;
    const close = node.closeTag.start - node.range.start;
    return plainText(src.slice(open, close));
  } catch {
    return "";
  }
}
