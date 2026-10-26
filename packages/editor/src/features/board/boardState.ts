/**
 * The component board (the "components editor"): every partial as a card on a pannable,
 * zoomable board. Session state (`boardField`, effect-only, never an undo step): open, pan,
 * zoom, whether a card is isolated, and the page to return to. Which partial is being worked on
 * is the inspector's `componentEditor` (one source of truth); isolating a partial shows it on
 * the regular canvas (`canvas.page` = the partial), so every canvas tool works on it.
 *
 * Commands — layout writes go to `.editor/board.json` (boardLayout.ts), one undo step each:
 * - `component.toggleEditor` — the top bar's Components editor toggle; closing restores the page.
 * - `component.new` — a new partial with an empty container, its card opened and selected.
 * - `component.edit { path }` / `component.isolate { path | null }` — open the board isolated
 *   on a partial (Edit Linked Instance, double-click, the focus icon; a selection inside that
 *   partial is kept) / exit isolation.
 * - `board.select { src }` — a click inside a card: select the element, work on its partial.
 * - `board.view { pan?, zoom? }` — pan / zoom (0.25–10).
 * - `board.moveCard { name, x, y, w?, h? }`, `board.arrange { axis, sizes? }`,
 *   `board.addNote { kind, x, y }`, `board.setNote { id, text?, x?, y?, remove? }`.
 */
import { StateEffect, StateField, contributes, defineCommand, effectsOf, selectAfter, setSelection, type CommandContext, type EditorState, type Extension, type Path } from "@pagehub/engine";
import { editSrcOf, handleForSrc } from "@pagehub/engine/canvas";
import { PARTIAL_FILE, addPartial, partialNames, uniquePartialName } from "@pagehub/engine/kits";
import { setInspector, inspectorField } from "../inspector/inspectorState";
import { canvasField, canvasOf, canvasPageBase, setCanvas } from "../canvas/canvasState";
import { MIN_H, MIN_W, arrangeBoard, cardBox, readBoard, writeBoard, type BoardLayout, type BoardNote } from "./boardLayout";

const BOARD_ZOOM_MIN = 0.25;
const BOARD_ZOOM_MAX = 10;
/** What a new component starts as (a plain container). */
export const NEW_COMPONENT = `<div class="flex w-full flex-col gap-space-sm p-space-md" data-edit-name="Component"></div>\n`;

interface BoardState {
  open: boolean;
  /** The `componentEditor` partial is shown alone, on the canvas. */
  isolated: boolean;
  pan: { x: number; y: number };
  zoom: number;
  /** The canvas page before isolation (restored on exit). */
  returnPage: Path | null;
}

const DEFAULT_BOARD: BoardState = { open: false, isolated: false, pan: { x: 40, y: 72 }, zoom: 1, returnPage: null };

const setBoard = StateEffect.define<Partial<BoardState>>("board.set");

const boardField = StateField.define<BoardState>({
  name: "board",
  create: () => DEFAULT_BOARD,
  update(value, tr) {
    const patches = effectsOf(tr, setBoard);
    const next = patches.length ? patches.reduce<BoardState>((v, p) => ({ ...v, ...p }), value) : value;
    // Choosing a page (`canvas.set { page }`: page selector, layer tree) leaves the board; isolating a partial
    // sets the canvas page too but says so in the same transaction (`isolated: true`).
    const choosesPage = effectsOf(tr, setCanvas).some((c) => c.page !== undefined);
    return choosesPage && next.open && !patches.some((p) => p.isolated || p.open) ? { ...next, open: false, isolated: false, returnPage: null } : next;
  },
});

export const boardOf = (s: EditorState): BoardState => (s.hasField(boardField) ? s.field(boardField) : DEFAULT_BOARD);
/** The partial being worked on (the inspector's `componentEditor`). */
export const activePartial = (s: EditorState): string | null => (s.hasField(inspectorField) ? s.field(inspectorField).componentEditor : null);
export const boardLayout = (s: EditorState): BoardLayout => readBoard(s.files);
export const boardNames = (s: EditorState): string[] => partialNames(s.files);

const clampZoom = (z: number) => Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, z));
const ready = (ctx: CommandContext) => ctx.state.hasField(boardField);
const partialOk = (s: EditorState, path: Path | undefined) => !!path && PARTIAL_FILE.test(path) && !!s.files.get(path)?.trim();

/**
 * Edit srcs of the `[popover]` / `<dialog>` elements that are the root of `path` or sit directly inside its root
 * wrapper. A closed one renders nothing, so isolating such a partial would show an empty canvas.
 */
function rootOverlays(ctx: CommandContext, path: Path): string[] {
  if (!ctx.registry) return [];
  let flat;
  try {
    flat = ctx.state.tree(path).flat;
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const n of flat) {
    if (n.kind !== "element") continue;
    const h = ctx.registry.of(path, n);
    if (h.tag !== "dialog" && h.attr("popover") === undefined) continue;
    const up = h.parent();
    if (!up || !up.parent()) out.push(editSrcOf(h));
  }
  return out;
}

/** Effects that isolate `path` on the canvas (remembering the page to come back to). A root popover / dialog opens (view-only). */
function isolate(ctx: CommandContext, path: Path): void {
  const b = boardOf(ctx.state);
  const returnPage = b.isolated ? b.returnPage : canvasPageBase(ctx.state);
  ctx.tr.effect(setBoard, { open: true, isolated: true, returnPage });
  ctx.tr.effect(setInspector, { componentEditor: path });
  if (ctx.state.hasField(canvasField)) {
    const open = canvasOf(ctx.state).openOverlays;
    const add = rootOverlays(ctx, path).filter((src) => !open.includes(src));
    ctx.tr.effect(setCanvas, add.length ? { page: path, openOverlays: [...open, ...add] } : { page: path });
  }
}

/** Effects that end isolation: the canvas goes back to the page it showed, so the partial that
 * was occupying it (`componentEditor`) is dropped — `canvasPage` reads that field. Its previews close with it. */
function endIsolation(ctx: CommandContext): void {
  const b = boardOf(ctx.state);
  if (!b.isolated) return;
  ctx.tr.effect(setBoard, { isolated: false, returnPage: null });
  const editing = activePartial(ctx.state);
  if (ctx.state.hasField(inspectorField)) ctx.tr.effect(setInspector, { componentEditor: null });
  if (ctx.state.hasField(canvasField)) {
    const open = canvasOf(ctx.state).openOverlays;
    const keep = editing ? open.filter((src) => !src.startsWith(`${editing}#`)) : open;
    ctx.tr.effect(setCanvas, keep.length === open.length ? { page: b.returnPage } : { page: b.returnPage, openOverlays: keep });
  }
}

const componentToggleEditor = defineCommand({
  id: "component.toggleEditor",
  title: "Switch to components editor",
  run(ctx) {
    if (!ready(ctx)) return false;
    const open = !boardOf(ctx.state).open;
    if (!open) endIsolation(ctx);
    ctx.tr.effect(setBoard, { open });
    if (ctx.state.hasField(inspectorField)) ctx.tr.effect(setInspector, { componentEditor: null });
    ctx.dispatch?.(ctx.tr.effect(setSelection, { handles: [] }));
    return true;
  },
});

/** The top bar label for the toggle: which editor it switches to. */
export const toggleEditorTitle = (s: EditorState): string => (boardOf(s).open ? "Switch to page editor" : "Switch to components editor");

function firstElement(ctx: CommandContext, path: Path) {
  let h = ctx.registry?.at(path, 0) ?? null;
  while (h && (h.kind !== "element" || h.range.from !== 0)) h = h.parent();
  return h ? [h] : [];
}

const componentNew = defineCommand<{ name?: string } | undefined>({
  id: "component.new",
  title: "New component",
  run(ctx, args) {
    if (!ready(ctx)) return false;
    const name = uniquePartialName(ctx.state.files, args?.name ?? "component");
    if (!ctx.dispatch) return true;
    const path = addPartial(ctx, name, NEW_COMPONENT);
    endIsolation(ctx);
    ctx.tr.effect(setBoard, { open: true });
    if (ctx.state.hasField(inspectorField)) ctx.tr.effect(setInspector, { componentEditor: path });
    ctx.tr.effect(setSelection, selectAfter(() => firstElement(ctx, path)));
    ctx.dispatch(ctx.tr.annotate({ group: {} }));
    return true;
  },
});

const componentEdit = defineCommand<{ path: Path }>({
  id: "component.edit",
  title: "Edit component",
  run(ctx, args) {
    if (!ready(ctx) || !partialOk(ctx.state, args?.path)) return false;
    const b = boardOf(ctx.state);
    if (b.open && b.isolated && activePartial(ctx.state) === args!.path) return false;
    isolate(ctx, args!.path);
    if (ctx.selection.primary?.path !== args!.path) ctx.tr.effect(setSelection, { handles: [] });
    ctx.dispatch?.(ctx.tr);
    return true;
  },
});

const componentIsolate = defineCommand<{ path: Path | null }>({
  id: "component.isolate",
  title: "Isolate component",
  run(ctx, args) {
    if (!ready(ctx) || !args) return false;
    if (args.path === null) {
      if (!boardOf(ctx.state).isolated) return false;
      endIsolation(ctx);
      ctx.dispatch?.(ctx.tr);
      return true;
    }
    return componentEdit.run(ctx, { path: args.path });
  },
});

/**
 * Leave the inspector's "Edit partial" view (the one opened from a `{% render %}` panel while the
 * component board is closed): the canvas returns to the page and the partial's selection drops.
 * The board's own isolation is left to `component.isolate` — this is a no-op while it's open.
 */
const componentClosePartial = defineCommand({
  id: "component.closePartial",
  title: "Back to page",
  run(ctx) {
    if (!ctx.state.hasField(inspectorField) || activePartial(ctx.state) === null) return false;
    if (ctx.state.hasField(boardField) && boardOf(ctx.state).open) return false;
    ctx.tr.effect(setInspector, { componentEditor: null });
    ctx.dispatch?.(ctx.tr.effect(setSelection, { handles: [] }));
    return true;
  },
});

const boardSelect = defineCommand<{ src: string | null }>({
  id: "board.select",
  title: "Select element",
  run(ctx, args) {
    if (!ready(ctx) || !ctx.registry || !args) return false;
    const h = handleForSrc({ state: ctx.state, registry: ctx.registry }, args.src);
    if (!h) return false;
    if (ctx.selection.primary === h && activePartial(ctx.state) === h.path) return false;
    if (ctx.state.hasField(inspectorField)) ctx.tr.effect(setInspector, { componentEditor: h.path });
    ctx.dispatch?.(ctx.tr.effect(setSelection, { handles: [h] }));
    return true;
  },
});

const boardView = defineCommand<{ pan?: { x: number; y: number }; zoom?: number }>({
  id: "board.view",
  title: "Pan / zoom the board",
  run(ctx, args) {
    if (!ready(ctx) || !args) return false;
    const b = boardOf(ctx.state);
    const zoom = args.zoom === undefined ? b.zoom : clampZoom(args.zoom);
    const pan = args.pan ?? b.pan;
    if (!Number.isFinite(zoom) || !Number.isFinite(pan.x) || !Number.isFinite(pan.y) || (zoom === b.zoom && pan.x === b.pan.x && pan.y === b.pan.y)) return false;
    ctx.dispatch?.(ctx.tr.effect(setBoard, { zoom, pan }));
    return true;
  },
});

/** Write a new layout (its own undo step, never merged with the last); false when nothing changes. */
function layoutEdit(ctx: CommandContext, next: (b: BoardLayout) => BoardLayout | null): boolean {
  if (!ready(ctx)) return false;
  const b = next(boardLayout(ctx.state));
  if (!b || !writeBoard(ctx, b)) return false;
  ctx.dispatch?.(ctx.tr.annotate({ group: {} }));
  return true;
}

const boardMoveCard = defineCommand<{ name: string; x: number; y: number; w?: number; h?: number }>({
  id: "board.moveCard",
  title: "Move component card",
  run: (ctx, a) =>
    !!a &&
    [a.x, a.y].every(Number.isFinite) &&
    boardNames(ctx.state).includes(a.name) &&
    layoutEdit(ctx, (b) => {
      const prev = b.cards[a.name];
      const w = a.w === undefined ? prev?.w : Math.max(MIN_W, Math.round(a.w));
      const h = a.h === undefined ? prev?.h : Math.max(MIN_H, Math.round(a.h));
      return { ...b, cards: { ...b.cards, [a.name]: { x: Math.round(a.x), y: Math.round(a.y), ...(w ? { w } : {}), ...(h ? { h } : {}) } } };
    }),
});

const boardArrange = defineCommand<{ axis: "row" | "column"; sizes?: Record<string, { w: number; h: number }> }>({
  id: "board.arrange",
  title: "Arrange components",
  run: (ctx, a) => !!a && (a.axis === "row" || a.axis === "column") && layoutEdit(ctx, (b) => arrangeBoard(b, boardNames(ctx.state), a.axis, a.sizes)),
});

const nextNoteId = (notes: readonly BoardNote[]) => `n${notes.reduce((m, n) => Math.max(m, Number(n.id.slice(1)) || 0), 0) + 1}`;

const boardAddNote = defineCommand<{ kind: "label" | "title"; x: number; y: number }>({
  id: "board.addNote",
  title: "Add label",
  run: (ctx, a) =>
    !!a &&
    (a.kind === "label" || a.kind === "title") &&
    layoutEdit(ctx, (b) => ({ ...b, notes: [...b.notes, { id: nextNoteId(b.notes), kind: a.kind, text: a.kind === "title" ? "Group title" : "Label", x: Math.round(a.x), y: Math.round(a.y) }] })),
});

const boardSetNote = defineCommand<{ id: string; text?: string; x?: number; y?: number; remove?: boolean }>({
  id: "board.setNote",
  title: "Edit label",
  run: (ctx, a) =>
    !!a &&
    layoutEdit(ctx, (b) => {
      const i = b.notes.findIndex((n) => n.id === a.id);
      if (i < 0) return null;
      if (a.remove) return { ...b, notes: b.notes.filter((_, j) => j !== i) };
      const n = b.notes[i]!;
      const next = { ...n, ...(a.text !== undefined ? { text: a.text } : {}), ...(Number.isFinite(a.x) ? { x: Math.round(a.x!) } : {}), ...(Number.isFinite(a.y) ? { y: Math.round(a.y!) } : {}) };
      return { ...b, notes: b.notes.map((x, j) => (j === i ? next : x)) };
    }),
});

const BOARD_COMMANDS = [componentToggleEditor, componentNew, componentEdit, componentIsolate, componentClosePartial, boardSelect, boardView, boardMoveCard, boardArrange, boardAddNote, boardSetNote] as const;

const CONTRIBUTIONS = contributes({
  menus: {
    topbar: [{ command: "component.toggleEditor", group: "view@60", when: "role != 'client'" }],
    "canvas/context": [{ command: "component.convert", group: "5_edit@2.5" }],
  },
  palette: ["component.toggleEditor", "component.new"].map((command) => ({ command, group: "Components" })),
});

const KIT: Extension = [boardField, BOARD_COMMANDS, CONTRIBUTIONS];

/** The component board: state, commands, top-bar toggle, "Convert to component". Needs `inspectorKit()` and `canvasKit()`. */
export function boardKit(): Extension {
  return KIT;
}
