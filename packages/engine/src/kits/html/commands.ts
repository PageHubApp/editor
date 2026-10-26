/**
 * The html kit's commands: selection moves, insert / duplicate / remove / move / wrap, and the
 * clipboard (copy / cut / paste as source text). Every command is pure: `can()` (no
 * `ctx.dispatch`) builds and validates the same edit and changes nothing, so a key whose
 * command can't run passes through. Selection follows: a duplicate / paste / insert
 * selects what it created, a remove selects the parent.
 */
import { defineCommand, selectAfter, type CommandContext } from "../../commands/defineCommand";
import { EDIT_ATTRIBUTES, validateEditAttribute } from "../../attributes/editAttributes";
import { applySplices } from "../../edit/ops";
import { edit, primary } from "./commandEdit";
import { roleOf } from "./dnd/layout";
import { DND_COMMANDS, automaticAt, draggedOfSnippet, dropPoint } from "./dnd/dropCommands";
import { pageEndPoint, type DropTo } from "./dnd/dropEdits";
import { defineFacet } from "../../extensions/extension";
import { elementsFacet } from "../../extensions/facets";
import { setSelection } from "../../state/state";
import type { InsertPoint } from "../../state/builder";
import type { NodeHandle } from "../../state/handles";
import type { TreeNode } from "../../parse/tree";
import { copyable, isDocumentElement, removable } from "./access";
import { withPeerClasses } from "./peerInherit";
import { clipboardFacet } from "./clipboard";
import { CLASS_CLIPBOARD } from "./classClipboard";
import { childrenOf, insertionPoint, inserted, locked, siblingAt, siblingsOf, snippetNodes, snippetOf, withoutEditIds } from "./nodes";
import { uniqueIds } from "./uniqueIds";

/** `blockProvenance`: when any contribution is true, `element.insert` with a `block` writes `data-edit-block`. */
export const blockProvenanceFacet = defineFacet<boolean, boolean>({ id: "blockProvenance", combine: (values) => values.some(Boolean) });


const select = (ctx: CommandContext, h: NodeHandle | null): boolean => {
  if (!h || h === primary(ctx)) return false;
  ctx.dispatch?.(ctx.tr.effect(setSelection, { handles: [h] }));
  return true;
};

// ── selection ───────────────────────────────────────────────────────────────────

/** The parent, unless it is the document itself (`html` / `body`): those are never selected, so the menu row hides. */
export const selectParent = defineCommand({
  id: "element.selectParent",
  title: "Select parent",
  run(ctx) {
    const parent = primary(ctx)?.parent() ?? null;
    return !!parent && !isDocumentElement(parent) && select(ctx, parent);
  },
});
/** Esc: select the parent; at the root (no selectable parent) deselect. */
export const selectParentOrClear = defineCommand({
  id: "selection.up",
  title: "Select parent, then deselect",
  run(ctx) {
    const parent = primary(ctx)?.parent() ?? null;
    if (parent && !isDocumentElement(parent)) return select(ctx, parent);
    if (!ctx.selection.handles.length) return false;
    ctx.dispatch?.(ctx.tr.effect(setSelection, { handles: [] }));
    return true;
  },
});
/** A pin (`<address data-pin>`) or route (`<span data-route>`) inside a `{% map %}`: "Select Map" selects that block. */
export const selectMap = defineCommand({
  id: "map.select",
  title: "Select Map",
  run(ctx) {
    const h = primary(ctx);
    if (!h || h.kind !== "element" || (h.attr("data-pin") === undefined && h.attr("data-route") === undefined)) return false;
    for (let p = h.parent(); p; p = p.parent()) if (p.kind === "liquid-block" && p.tag === "map") return select(ctx, p);
    return false;
  },
});
export const selectChild = defineCommand({ id: "element.selectChild", title: "Select first child", run: (ctx) => {
  const h = primary(ctx);
  return select(ctx, h ? (childrenOf(h)[0] ?? null) : null);
} });

/** Next / previous sibling, wrapping around (today's Tab / Shift+Tab). */
const step = (delta: 1 | -1) => (ctx: CommandContext) => {
  const h = primary(ctx);
  if (!h) return false;
  const list = siblingsOf(h, ctx.registry);
  if (list.length < 2) return false;
  return select(ctx, list[(list.indexOf(h) + delta + list.length) % list.length]!);
};
export const selectNext = defineCommand({ id: "element.selectNext", title: "Select next sibling", run: step(1) });
export const selectPrev = defineCommand({ id: "element.selectPrev", title: "Select previous sibling", run: step(-1) });

export const clearSelection = defineCommand({
  id: "selection.clear",
  title: "Deselect",
  run(ctx) {
    if (!ctx.selection.handles.length) return false;
    ctx.dispatch?.(ctx.tr.effect(setSelection, { handles: [] }));
    return true;
  },
});

// ── structure ───────────────────────────────────────────────────────────────────

/** Insert `snippet` at `at` and select the inserted top-level nodes. */
function insertSnippet(ctx: CommandContext, at: InsertPoint, snippet: string): boolean {
  const nodes = snippetNodes(ctx.state, snippet);
  if (!nodes?.length) return false;
  return edit(ctx, (tr) => {
    tr.insert(at, snippet);
    tr.effect(setSelection, selectAfter(() => inserted(at, nodes.length, ctx.registry)));
  });
}

/** Add `data-edit-block="<slug>"` to each top-level element of a snippet. */
function stampBlock(snippet: string, nodes: TreeNode[], slug: string): string {
  const splices = nodes.flatMap((n) => {
    if (n.kind !== "element") return [];
    const last = n.attributes.at(-1);
    const at = last ? last.range.end : n.openTag.start + 1 + n.tag.length;
    return [{ from: at, to: at, insert: ` ${EDIT_ATTRIBUTES.block}="${slug}"` }];
  });
  return applySplices(snippet, splices);
}

export interface InsertArgs {
  /** A registered element's `insert.template`. */
  element?: string;
  /** Source to insert (column 0). */
  snippet?: string;
  /** Library block slug (written as `data-edit-block` only with `blockProvenance`). */
  block?: string;
  /** With nothing selected: append at the end of this file. */
  path?: string;
  /** A drop point (drag from the insert panel); checked against the drop rules. */
  to?: DropTo;
  /** The Automatic element: the markup is chosen from where it lands (`automaticSnippet`). */
  automatic?: boolean;
}

export const insertElement = defineCommand<InsertArgs | undefined>({
  id: "element.insert",
  title: "Insert",
  run(ctx, args = {}) {
    let snippet = args.snippet;
    if (args.automatic) {
      const sel = primary(ctx);
      const point = args.to ?? (sel ? insertionPoint(sel) : null);
      snippet = (point ? automaticAt(ctx, point) : null) ?? undefined;
    }
    if (snippet === undefined && args.element) snippet = ctx.state.facet(elementsFacet).find((e) => e.name === args.element)?.insert?.template;
    if (!snippet) return false;
    snippet = uniqueIds(ctx.state, snippet);
    let nodes = snippetNodes(ctx.state, snippet);
    if (!nodes?.length) return false;
    if (args.block && ctx.state.facet(blockProvenanceFacet)) {
      if (validateEditAttribute(EDIT_ATTRIBUTES.block, args.block)) return false;
      snippet = stampBlock(snippet, nodes, args.block);
    }
    const dragged = draggedOfSnippet(ctx, snippet);
    if (!dragged) return false;
    let to: DropTo | undefined = args.to;
    if (!to) {
      const h = primary(ctx);
      if (h) {
        // a page (`<main>`) always goes to the top level of the file
        let top = h;
        for (let p = top.parent(); p; p = p.parent()) top = p;
        to = nodes[0]?.kind === "element" && nodes[0].tag === "main" ? { after: top } : insertionPoint(h);
      } else if (args.path && ctx.registry && ctx.state.files.has(args.path)) {
        const top = ctx.state.tree(args.path).nodes.map((n) => ctx.registry!.of(args.path!, n));
        const content = top.filter((x) => !(x.kind === "text" && !x.text().trim()));
        const page = content.find((x) => roleOf(x) === "page");
        const last = content.at(-1);
        // page chrome (`<main>`, `<header>`, `<footer>`) belongs beside the page; everything else inside it
        const chrome = nodes[0]?.kind === "element" && ["main", "header", "footer"].includes(nodes[0].tag);
        if (page && !chrome) to = pageEndPoint(page);
        else if (last) to = { after: last };
      }
    }
    const drop = to && dropPoint(ctx, to, dragged);
    if (!drop) return false;
    // peer class inherit: a button next to buttons looks like them (the snippet is still one edit)
    return insertSnippet(ctx, drop.at, withPeerClasses(ctx.state, snippet, nodes, drop.at));
  },
});

/** Context menu Insert ▸ "Add empty section" (the selected page) and "Add container" (any other container): append an empty flex column. */
const addEmpty = (id: string, title: string, tag: "section" | "div", page: boolean) =>
  defineCommand({
    id,
    title,
    run(ctx) {
      const h = primary(ctx);
      if (!h || h.kind !== "element" || (roleOf(h) === "page") !== page) return false;
      return insertElement.run(ctx, { snippet: `<${tag} class="gap-section flex w-full flex-col"></${tag}>`, to: { append: h } });
    },
  });
export const addSection = addEmpty("element.addSection", "Add empty section", "section", true);
export const addContainer = addEmpty("element.addContainer", "Add container", "div", false);

export const duplicate = defineCommand({
  id: "element.duplicate",
  title: "Duplicate",
  /** Copies first (overwriting the clipboard, as today), then pastes the copy as the next sibling. */
  run(ctx) {
    const h = copyable(ctx);
    if (!h) return false;
    const text = withoutEditIds(snippetOf(ctx.state, h));
    const ok = insertSnippet(ctx, { after: h }, text);
    if (ok && ctx.dispatch) ctx.state.facet(clipboardFacet).write(text);
    return ok;
  },
});

export const removeElement = defineCommand({
  id: "element.remove",
  title: "Delete",
  run(ctx) {
    const h = primary(ctx);
    if (!h || !removable(h)) return false;
    const parent = h.parent();
    return edit(ctx, (tr) => {
      tr.remove(h);
      tr.effect(setSelection, { handles: parent && parent.kind === "element" ? [parent] : [] });
    });
  },
});

const move = (delta: 1 | -1) => (ctx: CommandContext) => {
  const h = primary(ctx);
  if (!h || locked(h, "drag")) return false;
  const other = siblingAt(h, ctx.registry, delta);
  if (!other) return false;
  return edit(ctx, (tr) => void tr.move(h, delta < 0 ? { before: other } : { after: other }));
};
export const moveUp = defineCommand({ id: "element.moveUp", title: "Move up", run: move(-1) });
export const moveDown = defineCommand({ id: "element.moveDown", title: "Move down", run: move(1) });

export const wrapElement = defineCommand<{ tag?: string } | undefined>({
  id: "element.wrap",
  title: "Wrap in container",
  run(ctx, args = {}) {
    const h = primary(ctx);
    const tag = args.tag ?? "div";
    if (!h || !/^[a-z][a-z0-9-]*$/.test(tag)) return false;
    return edit(ctx, (tr) => void tr.wrap(h, `<${tag}>`, `</${tag}>`));
  },
});

// ── clipboard ───────────────────────────────────────────────────────────────────

export const copy = defineCommand({
  id: "element.copy",
  title: "Copy",
  run(ctx) {
    const h = copyable(ctx);
    if (!h) return false;
    if (ctx.dispatch) ctx.state.facet(clipboardFacet).write(withoutEditIds(snippetOf(ctx.state, h)));
    return true;
  },
});

export const cut = defineCommand({
  id: "element.cut",
  title: "Cut",
  run(ctx) {
    const h = copyable(ctx);
    if (!h) return false;
    const text = withoutEditIds(snippetOf(ctx.state, h));
    const parent = h.parent();
    const ok = edit(ctx, (tr) => {
      tr.remove(h);
      tr.effect(setSelection, { handles: parent && parent.kind === "element" ? [parent] : [] });
    });
    if (ok && ctx.dispatch) ctx.state.facet(clipboardFacet).write(text);
    return ok;
  },
});

/** Paste after the selection. `source` comes from a native paste event (cross-app); else the clipboard is read live. */
export const paste = defineCommand<{ source?: string } | undefined>({
  id: "element.paste",
  title: "Paste",
  run(ctx, args = {}) {
    if (ctx.ui.textEditing || ctx.ui.mediaManagerOpen) return false;
    const h = primary(ctx);
    const source = args.source ?? ctx.state.facet(clipboardFacet).read()?.source;
    return !!h && !!source && insertSnippet(ctx, { after: h }, source);
  },
});

export const HTML_COMMANDS = [selectParent, selectParentOrClear, selectMap, selectChild, selectNext, selectPrev, clearSelection, insertElement, addSection, addContainer, duplicate, removeElement, moveUp, moveDown, wrapElement, copy, cut, paste, ...CLASS_CLIPBOARD, ...DND_COMMANDS] as const;
