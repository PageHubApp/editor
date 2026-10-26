/**
 * "Beside" drops: placing a node to the left or right of a target in a column turns the two
 * into a row. `planBeside` decides what the drop does (and the indicator's label):
 * - "Insert into row": the target already sits in an Item of a simple row → a new Item;
 * - "Split content": the target is promoted to its layout root (up to 10 levels: a column
 *   stack with 2–6 meaningful children) and that splits against the dragged node;
 * - "Create split": a new Row with the target and the dragged node in two Items.
 * Promotion never lands in a page / header / footer / section.
 */
import { indentAt, reindent } from "../../../edit/whitespace";
import type { EditorState } from "../../../state/state";
import type { NodeHandle } from "../../../state/handles";
import { childrenOf } from "../nodes";
import { isCentred, isFlexRow, isSimpleRow, isStack, layoutClasses, roleOf, wrapperKind, type BesideSide } from "./layout";

export type BesideLabel = "Insert into row" | "Split content" | "Create split";

export interface BesidePlan {
  /** What ends up beside the dragged node (the target, or its promoted layout root). */
  target: NodeHandle;
  promoted: boolean;
  /** "Insert into row": the row, and the Item the dragged node goes next to. */
  row: NodeHandle | null;
  anchor: NodeHandle | null;
  label: BesideLabel;
}

const CONTAINER_TAGS = new Set(["div", "section", "main", "header", "footer", "article", "aside", "nav", "form", "ul", "ol", "li", "figure", "fieldset"]);
const containerLike = (h: NodeHandle | null | undefined) => !!h && h.kind === "element" && CONTAINER_TAGS.has(h.tag);

function layoutRoot(state: EditorState, node: NodeHandle, child: NodeHandle): boolean {
  if (!containerLike(node) || isSimpleRow(node) || roleOf(node) || isFlexRow(node)) return false;
  const kind = wrapperKind(state, node);
  if (kind === "row" || kind === "item") return false;
  const kids = childrenOf(node).filter((c) => { const k = wrapperKind(state, c); return k !== "row" && k !== "item"; });
  if (kids.length < 2 || kids.length > 6) return false;
  return isStack(node) || isCentred(node) || kids.filter((c) => !containerLike(c)).length >= 2 || !containerLike(child);
}

function promote(state: EditorState, target: NodeHandle): NodeHandle {
  if (isSimpleRow(target)) return target;
  let t = target;
  let p = target.parent();
  for (let depth = 1; p && p.parent() && depth <= 10; depth++) {
    if (layoutRoot(state, p, t)) return p;
    const next: NodeHandle | null = p.parent();
    if (!next || roleOf(next) || isSimpleRow(next)) break;
    t = p;
    p = next;
  }
  return target;
}

export function planBeside(state: EditorState, target: NodeHandle): BesidePlan | null {
  if (target.kind !== "element" || !target.parent()) return null;
  let eff = promote(state, target);
  if (eff !== target && roleOf(eff.parent())) eff = target;
  const parent = eff.parent();
  const row = parent?.parent() ?? null;
  if (parent && row && isSimpleRow(row) && wrapperKind(state, parent) === "item") return { target: eff, promoted: eff !== target, row, anchor: parent, label: "Insert into row" };
  return { target: eff, promoted: eff !== target, row: null, anchor: null, label: eff !== target ? "Split content" : "Create split" };
}

type ItemMode = "default" | "promoted-target" | "promoted-dragged";

/** An Item's class: equal width; centred content keeps its look, aligned to the drop side. */
export function itemClass(state: EditorState, node: NodeHandle | null, side: BesideSide, mode: ItemMode): string {
  const c = layoutClasses(state);
  const base = mode === "promoted-target" ? c.promotedTargetItem : mode === "promoted-dragged" ? c.promotedDraggedItem : c.item;
  return isCentred(node) ? `${base} ${c.sideAlign[side]}` : base;
}

/** The Row's class: `flex-nowrap` when promoted; two centred parts align to the right side. */
export function rowClass(state: EditorState, side: BesideSide, parts: ReadonlyArray<NodeHandle | null>, promoted: boolean): string {
  const base = promoted ? layoutClasses(state).promotedRow : layoutClasses(state).row;
  return side === "right" && parts.filter(isCentred).length >= 2 ? base.replace("items-stretch", "items-end") : base;
}

const nest = (text: string) => `  ${reindent(text, "", "  ")}`;
export const itemMarkup = (cls: string, body: string) => `<div class="${cls}">\n${nest(body)}\n</div>`;
export const rowMarkup = (cls: string, items: readonly string[]) => `<div class="${cls}">\n${items.map(nest).join("\n")}\n</div>`;

/** A node's source as a column-0 snippet with the ranges of `without` (nodes inside it) cut out. */
export function snippetWithout(state: EditorState, h: NodeHandle, without: readonly NodeHandle[]): string {
  const text = state.files.get(h.path)!;
  const cuts = without.filter((w) => w.path === h.path && w.range.from >= h.range.from && w.range.to <= h.range.to).sort((a, b) => b.range.from - a.range.from);
  let body = text.slice(h.range.from, h.range.to);
  for (const w of cuts) {
    let from = w.range.from;
    let to = w.range.to;
    const lineFrom = text.lastIndexOf("\n", from - 1) + 1;
    if (!text.slice(lineFrom, from).trim()) {
      const eol = text.indexOf("\n", to);
      if (eol >= 0 && !text.slice(to, eol).trim() && eol < h.range.to) {
        from = lineFrom;
        to = eol + 1;
      }
    }
    body = body.slice(0, from - h.range.from) + body.slice(to - h.range.from);
  }
  return reindent(body, indentAt(text, h.range.from), "");
}
