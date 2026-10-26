/**
 * The Add panel's session state — open, tab, category / subcategory / style, the search query,
 * the pending "add block above / below" position, the hovered block and the Quick Look — in a
 * core state field (never in history), so every step is a command the keymap, palette, menus,
 * MCP and tests reach. Closing keeps the rest, so reopening restores the last tab, category,
 * filters and query. A selection change closes the panel (an undo / redo doesn't); so does
 * popping out the layers.
 *
 * Blocks come from the host: `blockSourceFacet.of({ blocks, siteStyle })` (`@pagehub/engine/host`).
 */
import { StateEffect, StateField, contributes, defineCommand, effectsOf, setSelection, type EditorState, type NodeHandle } from "@pagehub/engine";
import { blockSourceFacet } from "@pagehub/engine/host";
import { setChrome, type ChromeState } from "../../shell/chromeState";

export type AddTab = "components" | "blocks";

export interface AddPanelState {
  open: boolean;
  tab: AddTab;
  category: string | null;
  sub: string | null;
  style: string | null;
  /** True once the author cleared the style: the site style stops auto-applying this session. */
  styleCleared: boolean;
  query: string;
  /** Set by "Add block above / below": a block double-click lands there once. */
  pending: { anchor: NodeHandle; position: "above" | "below" } | null;
  hovered: string | null;
  quickLook: string | null;
  /** The Add Section dialog (a section picker over the whole window) is open. */
  dialog: boolean;
}

const DEFAULT_ADD_PANEL: AddPanelState = { open: false, tab: "components", category: null, sub: null, style: null, styleCleared: false, query: "", pending: null, hovered: null, quickLook: null, dialog: false };

const setAddPanel = StateEffect.define<Partial<AddPanelState>>("addPanel.set");

/** An undo / redo replays a step (`annotations.undo`). */
const isHistory = (tr: { annotations: { undo?: unknown } }) => tr.annotations.undo !== undefined;

export const addPanelField = StateField.define<AddPanelState>({
  name: "addPanel",
  create: () => DEFAULT_ADD_PANEL,
  update(value, tr) {
    let next = effectsOf(tr, setAddPanel).reduce<AddPanelState>((v, p) => ({ ...v, ...p }), value);
    const closes = (effectsOf(tr, setSelection).length > 0 && !isHistory(tr)) || effectsOf(tr, setChrome).some((c) => c.panel === "layers" || c.drawer === "more");
    if (next.open && closes && !effectsOf(tr, setAddPanel).some((p) => p.open)) next = { ...next, open: false, pending: null, quickLook: null };
    return next;
  },
});

export const addPanelOf = (s: EditorState): AddPanelState => (s.hasField(addPanelField) ? s.field(addPanelField) : DEFAULT_ADD_PANEL);

/** Opening the panel opens the sidebar and closes the More drawer (one drawer at a time). */
const opening = <T extends { effect(e: typeof setChrome, v: Partial<ChromeState>): T }>(tr: T, next: Partial<AddPanelState>): T =>
  next.open ? tr.effect(setChrome, { sidebarOpen: true, drawer: null }) : tr;

const patch = (id: string, title: string, make: (s: AddPanelState, args: never) => Partial<AddPanelState> | null) =>
  defineCommand<unknown>({
    id,
    title,
    run(ctx, args) {
      if (!ctx.state.hasField(addPanelField)) return false;
      const next = make(ctx.state.field(addPanelField), args as never);
      if (!next) return false;
      ctx.dispatch?.(opening(ctx.tr.effect(setAddPanel, next), next));
      return true;
    },
  });

const insertToggle = patch("insert.toggle", "Insert", (s) => ({ open: !s.open, pending: s.open ? null : s.pending, quickLook: null }));
const insertClose = patch("insert.close", "Close Add panel", (s) => (s.open ? { open: false, pending: null, quickLook: null } : null));
/** Open (or navigate) with a patch: `{ tab, category, sub, style, query }`. */
const insertOpen = patch("insert.open", "Open Add panel", (_s, args: Partial<AddPanelState> | undefined) => ({ ...(args ?? {}), open: true }));
/** Patch without opening (search edits, hover). */
const insertSet = patch("insert.set", "Set Add panel", (_s, args: Partial<AddPanelState> | undefined) => (args ? { ...args } : null));

/** The Add Section dialog; with `{ anchor, position }` the pick lands above / below that node, else at the end of the page. */
const insertSectionDialog = patch("insert.sectionDialog", "Add section", (_s, args: Pick<AddPanelState, "pending"> | undefined) => ({ dialog: true, pending: args?.pending ?? null }));
const insertSectionDialogClose = patch("insert.sectionDialogClose", "Close Add section", (s) => (s.dialog ? { dialog: false, pending: null } : null));

const blockAt = (position: "above" | "below") =>
  defineCommand({
    id: position === "above" ? "insert.blockAbove" : "insert.blockBelow",
    title: position === "above" ? "Add block above" : "Add block below",
    run(ctx) {
      const anchor = ctx.selection.primary;
      if (!ctx.state.hasField(addPanelField) || !anchor?.alive || !ctx.state.facet(blockSourceFacet)) return false;
      ctx.dispatch?.(opening(ctx.tr.effect(setAddPanel, { open: true, tab: "blocks", pending: { anchor, position } }), { open: true }));
      return true;
    },
  });

/** Space while a block card is hovered (or the Quick Look is open): toggle the Quick Look. */
const insertQuickLook = patch("insert.quickLook", "Quick look", (s) => (s.quickLook ? { quickLook: null } : s.hovered && s.open ? { quickLook: s.hovered } : null));

export function addPanelKit() {
  return [
    addPanelField, insertToggle, insertClose, insertOpen, insertSet, insertSectionDialog, insertSectionDialogClose, blockAt("above"), blockAt("below"), insertQuickLook,
    contributes({
      keybindings: [{ command: "insert.quickLook", key: "space", when: "!textEditing" }],
      menus: { "canvas/context": [{ command: "insert.blockAbove", group: "insert@1" }, { command: "insert.blockBelow", group: "insert@2" }] },
      palette: [{ command: "insert.toggle", group: "View" }, { command: "insert.sectionDialog", group: "View" }],
    }),
  ];
}
