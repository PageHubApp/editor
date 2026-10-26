/**
 * Tree helpers the html kit's commands share: siblings (blank text skipped), source text of a
 * node as a column-0 snippet, snippet parsing, locks and the insertion point.
 */
import { EDIT_ATTRIBUTES } from "../../attributes/editAttributes";
import { indentAt } from "../../edit/whitespace";
import { parserTagsFacet } from "../../extensions/facets";
import { parseSource } from "../../parse/parse";
import { buildTree, type TreeNode } from "../../parse/tree";
import type { InsertPoint } from "../../state/builder";
import type { HandleRegistry, NodeHandle } from "../../state/handles";
import type { EditorState } from "../../state/state";

/** Elements that can't have children: the insertion point never goes inside them. */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set("area base br col embed hr img input link meta source track wbr".split(" "));

const blank = (h: NodeHandle) => h.kind === "text" && h.tag === "#text" && !h.text().trim();

/** Meaningful children (whitespace-only text skipped). */
export function childrenOf(h: NodeHandle): NodeHandle[] {
  return h.children().filter((c) => !blank(c));
}

/** The node's siblings including itself (whitespace-only text skipped); top level needs the registry. */
export function siblingsOf(h: NodeHandle, registry: HandleRegistry | undefined): NodeHandle[] {
  const p = h.parent();
  if (p) return childrenOf(p);
  if (!registry) return [h];
  return registry.state.tree(h.path).nodes.map((n) => registry.of(h.path, n)).filter((x) => !blank(x));
}

/** The sibling `delta` steps away (no wrap), or null. */
export function siblingAt(h: NodeHandle, registry: HandleRegistry | undefined, delta: number): NodeHandle | null {
  const list = siblingsOf(h, registry);
  return list[list.indexOf(h) + delta] ?? null;
}

/** A node's source as a snippet indented from column 0 (what insert expects). */
export function snippetOf(state: EditorState, h: NodeHandle): string {
  const indent = indentAt(state.files.get(h.path)!, h.range.from);
  return h
    .text()
    .split("\n")
    .map((l, i) => (i && l.startsWith(indent) ? l.slice(indent.length) : l))
    .join("\n");
}

/** Drop generated `data-edit-id`s from copied markup: a copy is a new element (normalize mints on save). */
export function withoutEditIds(snippet: string): string {
  return snippet.replace(new RegExp(`\\s+${EDIT_ATTRIBUTES.id}=(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "g"), "");
}

/** Top-level nodes of a snippet (blank text skipped), or null when it doesn't parse strict. */
export function snippetNodes(state: EditorState, snippet: string): TreeNode[] | null {
  try {
    const nodes = buildTree(parseSource(snippet, "strict", { env: state.facet(parserTagsFacet) }));
    return nodes.filter((n) => !(n.kind === "content" && n.type === "TextNode" && !snippet.slice(n.range.start, n.range.end).trim()));
  } catch {
    return null;
  }
}

/** Lock words on a node (`data-edit-lock`); `sealed` locks everything. */
export function locked(h: NodeHandle, word: "delete" | "drag"): boolean {
  if (h.kind !== "element") return false;
  const words = (h.attr(EDIT_ATTRIBUTES.lock) ?? "").split(/\s+/);
  return words.includes(word) || words.includes("sealed");
}

/** Where an insert lands: inside a selected empty container, else after the selection. */
export function insertionPoint(h: NodeHandle): InsertPoint {
  if (h.kind === "element" && !VOID_ELEMENTS.has(h.tag) && childrenOf(h).length === 0) return { append: h };
  return { after: h };
}

/** The handles an insert at `at` created (`count` top-level nodes), read after it applied. */
export function inserted(at: InsertPoint, count: number, registry: HandleRegistry | undefined): NodeHandle[] {
  if ("append" in at) return childrenOf(at.append).slice(-count);
  if ("prepend" in at) return childrenOf(at.prepend).slice(0, count);
  const anchor = "after" in at ? at.after : at.before;
  const list = siblingsOf(anchor, registry);
  const i = list.indexOf(anchor);
  return "after" in at ? list.slice(i + 1, i + 1 + count) : list.slice(Math.max(0, i - count), i);
}
