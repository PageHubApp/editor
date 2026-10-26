/**
 * The edits a drop is made of, each a step on one `TransactionBuilder` so a whole drop is one
 * transaction (one undo step): resolving the drop point, cleaning up wrappers a move emptied,
 * and alignment on drop.
 */
import { EditError } from "../../../edit/ops";
import { indentAt, reindent } from "../../../edit/whitespace";
import type { InsertPoint, TransactionBuilder } from "../../../state/builder";
import type { EditorState } from "../../../state/state";
import type { Path } from "../../../state/changes";
import type { HandleRegistry, NodeHandle } from "../../../state/handles";
import { childrenOf } from "../nodes";
import { hasToken, isAncestorOrSelf, isFlexRow, layoutClasses, roleOf, tokensOf, wrapperKind, type AlignIntent } from "./layout";

/** A drop point: next to / inside a node, or the start / end of a file's top level. */
export type DropTo = InsertPoint | { file: Path; where: "start" | "end" };

const topLevel = (registry: HandleRegistry, path: Path) => registry.state.tree(path).nodes.map((n) => registry.of(path, n)).filter((h) => !(h.kind === "text" && h.tag === "#text" && !h.text().trim()));

/** The insert point and the parent it lands in (null: the top level). */
export function resolveDrop(registry: HandleRegistry, to: DropTo): { at: InsertPoint; parent: NodeHandle | null; path: Path } | null {
  if ("file" in to) {
    if (!registry.state.files.has(to.file)) return null;
    const top = topLevel(registry, to.file);
    const edge = to.where === "start" ? top[0] : top.at(-1);
    if (!edge) return null;
    return { at: to.where === "start" ? { before: edge } : { after: edge }, parent: null, path: to.file };
  }
  const anchor = "before" in to ? to.before : "after" in to ? to.after : "prepend" in to ? to.prepend : to.append;
  if (!anchor.alive) return null;
  const parent = "before" in to || "after" in to ? anchor.parent() : anchor;
  return { at: to, parent, path: anchor.path };
}

/** The footer chrome of a page: a `<footer>` or a `{% render 'footer' %}`. */
const isFooterChrome = (h: NodeHandle): boolean => h.tag === "footer" || (h.kind === "liquid-tag" && /^\{%-?\s*render\s+['"]footer['"]/.test(h.text()));

/** The end of a page's own content: before its footer when it has one, else the end of the `<main>`. */
export function pageEndPoint(page: NodeHandle): InsertPoint {
  const footer = childrenOf(page).find(isFooterChrome);
  return footer ? { before: footer } : { append: page };
}

/**
 * A section dropped at a file's top level next to the page's `<main>` goes into the page
 * instead: at its start when dropped before the page, at its end otherwise.
 */
export function coerceSectionDrop(registry: HandleRegistry, drop: NonNullable<ReturnType<typeof resolveDrop>>): NonNullable<ReturnType<typeof resolveDrop>> {
  if (drop.parent) return drop;
  const top = topLevel(registry, drop.path);
  const page = top.find((h) => roleOf(h) === "page");
  if (!page) return drop;
  const anchor = "before" in drop.at ? drop.at.before : "after" in drop.at ? drop.at.after : null;
  if (!anchor) return drop;
  const before = top.indexOf(anchor) < top.indexOf(page) || ("before" in drop.at && anchor === page);
  return { at: before ? { prepend: page } : pageEndPoint(page), parent: page, path: drop.path };
}

/** A node's inner content as a column-0 snippet (its children's source), or null when empty. */
function innerSnippet(state: EditorState, h: NodeHandle): string | null {
  const kids = childrenOf(h);
  if (!kids.length) return null;
  const text = state.files.get(h.path)!;
  return reindent(text.slice(kids[0]!.range.from, kids.at(-1)!.range.to), indentAt(text, kids[0]!.range.from), "");
}

/**
 * After `moved` left their parents: a Row / Item / Align wrapper left empty is removed, and a
 * Row left with a single Item is unwrapped (that Item's content takes the Row's place).
 * Wrappers that contain the destination are left alone.
 */
export function cleanupWrappers(tr: TransactionBuilder, state: EditorState, moved: readonly NodeHandle[], dest: NodeHandle | null): void {
  const parents = new Set(moved.map((h) => h.parent()).filter((p): p is NodeHandle => !!p));
  for (const p of parents) {
    if (dest && isAncestorOrSelf(p, dest)) continue;
    const kind = wrapperKind(state, p);
    if (!kind || childrenOf(p).some((c) => !moved.includes(c))) continue;
    const row = p.parent();
    if (kind === "item" && wrapperKind(state, row) === "row" && !(dest && isAncestorOrSelf(row!, dest))) {
      const rest = childrenOf(row!).filter((c) => c !== p);
      if (rest.length === 1) {
        const keep = wrapperKind(state, rest[0]) === "item" ? innerSnippet(state, rest[0]!) : reindent(rest[0]!.text(), indentAt(state.files.get(row!.path)!, rest[0]!.range.from), "");
        const indent = indentAt(state.files.get(row!.path)!, row!.range.from);
        if (keep) tr.replace(row!, reindent(keep, "", indent));
        else tr.remove(row!);
        continue;
      }
    }
    tr.remove(p);
  }
}

const SELF = ["self-auto", "self-start", "self-center", "self-end", "self-stretch", "self-baseline"];
const JUSTIFY = ["justify-start", "justify-center", "justify-end", "justify-between", "justify-around", "justify-evenly", "justify-stretch"];

const setTokens = (tr: TransactionBuilder, h: NodeHandle, strip: readonly string[], add: string) =>
  tr.setAttr(h, "class", [...tokensOf(h).filter((t) => !strip.includes(t)), add].join(" "));

/**
 * Alignment on drop (start-state handles; `node` already sits in `parent`):
 * - the node is an Align wrapper, or its parent is → rewrite the wrapper's class;
 * - a flex parent → cross axis writes `self-*` on the node, main axis `justify-*` on the parent;
 * - otherwise wrap the node in an Align wrapper — skipped for centre when the parent already
 *   has `items-center`, and when the parent is locked `move-out`.
 * Page / header / footer / section parents are never aligned. Returns false when nothing applies.
 */
export function applyAlign(tr: TransactionBuilder, state: EditorState, node: NodeHandle, parent: NodeHandle | null, intent: AlignIntent): boolean {
  const c = layoutClasses(state);
  const wrapper = (intent.axis === "vertical" ? c.alignVertical : c.alignHorizontal)[intent.zone];
  if (wrapperKind(state, node) === "align") return !!tr.setAttr(node, "class", wrapper);
  if (!parent || parent.kind !== "element" || roleOf(parent)) return false;
  if (wrapperKind(state, parent) === "align") return !!tr.setAttr(parent, "class", wrapper);
  if (hasToken(parent, "flex")) {
    const row = isFlexRow(parent);
    const cross = (!row && intent.axis === "horizontal") || (row && intent.axis === "vertical");
    if (cross) setTokens(tr, node, SELF, `self-${intent.zone}`);
    else setTokens(tr, parent, JUSTIFY, `justify-${intent.zone}`);
    return true;
  }
  if (intent.zone === "center" && hasToken(parent, "items-center")) return false;
  if ((parent.attr("data-edit-lock") ?? "").split(/\s+/).some((w) => w === "move-out" || w === "sealed")) return false;
  tr.wrap(node, `<div class="${wrapper}">`, "</div>");
  return true;
}

export function assertDrop(ok: boolean, why: string): asserts ok {
  if (!ok) throw new EditError(why);
}
