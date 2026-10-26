/**
 * What the layers panel reads and runs. A row is an element or a Liquid block of the page file;
 * text, outputs and comments are content, not rows. Each row action is one command, so one undo
 * step: `layers.toggleHidden` (the `hidden` attribute, or a `hidden` class token being cleared),
 * `layers.remove` (refused under a `data-edit-lock` delete lock), renames through `attr.set`
 * (`data-edit-name`), moves through `element.move` (the drop rules decide what is allowed).
 */
import { EDIT_ATTRIBUTES, StateEffect, StateField, contributes, defineCommand, effectsOf, setSelection, type CommandContext, type EditorState, type ElementDef, type InsertPoint, type NodeHandle, type Store } from "@pagehub/engine";
import { locked } from "@pagehub/engine/kits";
import { readJSON, writeJSON } from "../../primitives/storage";
import { nodeName } from "../../state/nodeName";

const isRow = (h: NodeHandle): boolean => h.kind === "element" || h.kind === "liquid-block";

/** The rows under `h` (or a file's top level). */
export function rowChildren(h: NodeHandle): NodeHandle[] {
  return h.children().filter(isRow);
}

export function topRows(store: Store, path: string): NodeHandle[] {
  if (!store.state.files.has(path)) return [];
  return store.state.tree(path).nodes.map((n) => store.registry.of(path, n)).filter(isRow);
}

/** `data-edit-lock="sealed"`: the row has no chevron and its children never show. */
export const isSealed = (h: NodeHandle): boolean => h.kind === "element" && (h.attr(EDIT_ATTRIBUTES.lock) ?? "").trim() === "sealed";

const elementOf = (h: NodeHandle): ElementDef | null => (h.alive ? ((h as unknown as { element?: ElementDef }).element ?? null) : null);

/** The row label — the shared friendly name (`data-edit-name` → element insert label → tag). */
export const rowLabel = nodeName;

/** The element definition's `insert.icon`. */
export const rowIcon = (h: NodeHandle): string | undefined => elementOf(h)?.insert?.icon;

type RowRole = "header" | "footer" | "section" | null;
export const rowRole = (h: NodeHandle): RowRole => (h.kind === "element" && (h.tag === "header" || h.tag === "footer" || h.tag === "section") ? h.tag : null);

/** Hidden: the `hidden` attribute or a `hidden` class token. */
export const isHidden = (h: NodeHandle): boolean => h.kind === "element" && (h.attr("hidden") !== undefined || h.classes().includes("hidden"));

export const canRemove = (h: NodeHandle): boolean => h.alive && !locked(h, "delete");

/** Siblings among the rows (the parent's rows, or the file's top level). */
function rowSiblings(store: Store, h: NodeHandle): NodeHandle[] {
  const p = h.parent();
  return p ? rowChildren(p) : topRows(store, h.path);
}

export type RowMove = "up" | "down" | "out" | "in";

/** Where each row arrow moves `h`: swap with a sibling, after the parent, into the previous sibling. */
function rowMoveTarget(store: Store, h: NodeHandle, move: RowMove): InsertPoint | null {
  const list = rowSiblings(store, h);
  const i = list.indexOf(h);
  if (move === "up") return i > 0 ? { before: list[i - 1]! } : null;
  if (move === "down") return i >= 0 && i < list.length - 1 ? { after: list[i + 1]! } : null;
  if (move === "out") return h.parent() ? { after: h.parent()! } : null;
  return i > 0 ? { append: list[i - 1]! } : null;
}

/** Full answers by file contents: `element.move` is a dry-run edit (it re-parses the file), so each row's answer is kept until the files change. */
const moveAnswers = new WeakMap<object, WeakMap<NodeHandle, Partial<Record<RowMove, boolean>>>>();

/**
 * Whether row `h` can move. `full: false` is the cheap structural answer (a target exists); `full: true` also asks
 * `element.move` whether the drop rules allow it, and is cached until the files change. A row only needs the full
 * answer while its arrows can show (selected, or under the pointer).
 */
export function canMoveRow(store: Store, h: NodeHandle, move: RowMove, full = true): boolean {
  const to = rowMoveTarget(store, h, move);
  if (!to) return false;
  if (!full) return true;
  let byRow = moveAnswers.get(store.state.files);
  if (!byRow) moveAnswers.set(store.state.files, (byRow = new WeakMap()));
  const row = byRow.get(h) ?? {};
  byRow.set(h, row);
  return (row[move] ??= store.can("element.move", { nodes: [h], to }));
}

export function moveRow(store: Store, h: NodeHandle, move: RowMove): boolean {
  const to = rowMoveTarget(store, h, move);
  return !!to && store.run("element.move", { nodes: [h], to });
}

function apply(ctx: CommandContext, build: () => void): boolean {
  try {
    build();
  } catch {
    return false;
  }
  ctx.dispatch?.(ctx.tr);
  return true;
}

/** Hide a visible element (`hidden` attribute); show a hidden one (clears the attribute and the class token). */
const layersToggleHidden = defineCommand<{ at: NodeHandle }>({
  id: "layers.toggleHidden",
  title: "Toggle visibility",
  run(ctx, args) {
    const h = args?.at;
    if (!h?.alive || h.kind !== "element") return false;
    return apply(ctx, () => {
      if (!isHidden(h)) return void ctx.tr.setAttr(h, "hidden", "");
      if (h.attr("hidden") !== undefined) ctx.tr.setAttr(h, "hidden", null);
      const rest = h.classes().filter((c) => c !== "hidden");
      if (rest.length !== h.classes().length) ctx.tr.setAttr(h, "class", rest.length ? rest.join(" ") : null);
    });
  },
});

/** Delete one row (any row, not only the selection); the parent element is selected after. */
const layersRemove = defineCommand<{ at: NodeHandle }>({
  id: "layers.remove",
  title: "Delete",
  run(ctx, args) {
    const h = args?.at;
    if (!h || !canRemove(h)) return false;
    const parent = h.parent();
    return apply(ctx, () => {
      ctx.tr.remove(h);
      ctx.tr.effect(setSelection, { handles: parent && parent.kind === "element" ? [parent] : [] });
    });
  },
});

/**
 * A section of a layout file shows on every page. (other editors hide plumbing nodes with a flag;
 * HTML has none — every element is real markup — so there is no equivalent.)
 */
export const isGlobalSection = (h: NodeHandle): boolean => rowRole(h) === "section" && /^layouts?\//.test(h.path);

const DOCKED_KEY = "sidebar-layers-panel";
const setLayersDocked = StateEffect.define<boolean>("layers.docked");

/** Whether the layers panel is docked open at the sidebar's foot (persisted per browser). */
const layersDockedField = StateField.define<boolean>({
  name: "layersDocked",
  create: () => readJSON<boolean>(DOCKED_KEY, true),
  update: (value, tr) => effectsOf(tr, setLayersDocked).reduce((_, v) => v, value),
});
export const layersDockedOf = (s: EditorState): boolean => (s.hasField(layersDockedField) ? s.field(layersDockedField) : true);

/** Hide the docked panel to its "Layers" bar, or dock it open again (More › View; the bar and the chevron run it too). */
const layersToggleDocked = defineCommand({
  id: "layers.toggleDocked",
  title: "Dock / hide layers panel",
  run({ state, tr, dispatch }) {
    if (!state.hasField(layersDockedField)) return false;
    const next = !layersDockedOf(state);
    if (dispatch) {
      writeJSON(DOCKED_KEY, next);
      dispatch(tr.effect(setLayersDocked, next));
    }
    return true;
  },
});

/** Rows of More › View: "Pop out layers" (`panel.layers`) and the dock toggle. */
const MENUS = contributes({ menus: { "more/view": [{ command: "layers.toggleDocked", group: "view@15" }] } });

/** The layers panel's commands (add to the editor's extensions; `editorKit()` includes it). */
export function layersKit() {
  return [layersToggleHidden, layersRemove, layersDockedField, layersToggleDocked, MENUS];
}
