/**
 * Shell state the keymap, palette and context menu share: which panel is open, the palette,
 * the context menu's position, grid lines, hidden-component visibility, preview and zoom. It
 * lives in a core state field (never in history: effect-only transactions are not undo steps),
 * so every toggle is a command the keymap, palette, MCP and tests reach like any other.
 * `chromeUi` projects the field onto the `when` context (`paletteOpen`, `mediaManagerOpen`,
 * `preview`, …).
 */
import { Prec, StateEffect, StateField, contributes, defineCommand, effectsOf, setSelection, type EditorState, type Extension, type NodeHandle, type UiContext } from "@pagehub/engine";

import { MEDIA_KEYS } from "../features/media/mediaKeys";

export type ChromePanel = "media" | "theme" | "layers" | "modifiers" | "scripts";

/**
 * A complex inspector editor that opens in the right slide-out drawer instead of a cramped
 * popover / floating modal: node visibility conditions (`{% if %}`), the repeat-for-each data
 * binding, and a text leaf's raw HTML source. It targets whatever node the inspector shows, so
 * only the kind is stored — the drawer reads the inspected handle itself.
 */
export type DetailKind = "conditions" | "dataSource" | "html" | "action" | "handlers";

export interface ChromeState {
  paletteOpen: boolean;
  /** Viewport position of the open context menu. */
  contextMenu: { x: number; y: number } | null;
  /** The toggled pop-out panel / dialog, one at a time. */
  panel: ChromePanel | null;
  /** A complex inspector editor shown in the right drawer (conditions / data binding / Edit HTML). Mutually exclusive with `panel`. */
  detail: DetailKind | null;
  /** The inspector's search popup. */
  sidebarSearch: boolean;
  /** The unsaved-changes sheet (the `DiffPreview` slot). */
  diffOpen: boolean;
  gridlines: boolean;
  showHidden: boolean;
  preview: boolean;
  zoom: number;
  /** Zoom follows the canvas box ("Fit to window", the default); any explicit zoom turns it off. */
  fit: boolean;
  /** The settings sidebar (hidden in preview whatever this says). */
  sidebarOpen: boolean;
  /** Docked on the left (default) or the right. Not persisted. */
  sidebarLeft: boolean;
  /** When the user last closed the sidebar (a new selection within 80ms doesn't reopen it). */
  sidebarClosedAt: number;
  /** The sidebar's drawer under the top bar (the More menu; the Add panel keeps its own state, `addPanelField`). */
  drawer: ChromeDrawer | null;
  /** What preview mode cleared; restored when it exits. */
  previewSelection: readonly NodeHandle[];
}

type ChromeDrawer = "more";

const DEFAULT_CHROME: ChromeState = {
  paletteOpen: false, contextMenu: null, panel: null, detail: null, sidebarSearch: false, diffOpen: false, gridlines: false, showHidden: false, preview: false, zoom: 1, fit: true,
  sidebarOpen: true, sidebarLeft: true, sidebarClosedAt: 0, drawer: null, previewSelection: [],
};

export const ZOOM_PRESETS: readonly number[] = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 3, 5, 7.5, 10];

export const setChrome = StateEffect.define<Partial<ChromeState>>("chrome.set");

export const chromeField = StateField.define<ChromeState>({
  name: "chrome",
  create: () => DEFAULT_CHROME,
  update(value, tr) {
    const patches = effectsOf(tr, setChrome);
    return patches.length ? patches.reduce<ChromeState>((v, p) => ({ ...v, ...p }), value) : value;
  },
});

/** The chrome state, or the defaults when `editorKit()` isn't installed. */
export const chromeOf = (state: EditorState): ChromeState => (state.hasField(chromeField) ? state.field(chromeField) : DEFAULT_CHROME);

/** The part of the `when` context the field owns. */
export function chromeUi(c: ChromeState): UiContext {
  return { paletteOpen: c.paletteOpen, mediaManagerOpen: c.panel === "media", preview: c.preview };
}

/** A command that patches the field; `patch` returns null when the command can't apply. */
function chromeCommand(id: string, title: string, patch: (c: ChromeState, ui: UiContext) => Partial<ChromeState> | null) {
  return defineCommand({
    id,
    title,
    run(ctx) {
      if (!ctx.state.hasField(chromeField)) return false;
      const next = patch(ctx.state.field(chromeField), ctx.ui);
      if (!next) return false;
      ctx.dispatch?.(ctx.tr.effect(setChrome, next));
      return true;
    },
  });
}

export const paletteToggle = chromeCommand("palette.toggle", "Command palette", (c) => ({ paletteOpen: !c.paletteOpen, contextMenu: null }));
export const paletteClose = chromeCommand("palette.close", "Close command palette", (c) => (c.paletteOpen ? { paletteOpen: false } : null));

const contextMenuOpen = defineCommand<{ x: number; y: number }>({
  id: "contextMenu.open",
  title: "Open context menu",
  run(ctx, at) {
    if (!ctx.state.hasField(chromeField) || !at) return false;
    ctx.dispatch?.(ctx.tr.effect(setChrome, { contextMenu: { x: at.x, y: at.y } }));
    return true;
  },
});
const contextMenuClose = chromeCommand("contextMenu.close", "Close context menu", (c) => (c.contextMenu ? { contextMenu: null } : null));

const panel = (id: ChromePanel, title: string) => chromeCommand(`panel.${id}`, title, (c) => ({ panel: c.panel === id ? null : id, detail: null }));
const PANEL_COMMANDS = [panel("media", "Media manager"), panel("theme", "Theme settings"), panel("layers", "Layers"), panel("modifiers", "Modifiers"), panel("scripts", "Scripts")] as const;

/** Open a complex editor (conditions / data binding / Edit HTML) in the right drawer; re-running the same one closes it. Takes over the drawer from any open panel. */
const detailOpen = defineCommand<{ kind: DetailKind }>({
  id: "inspector.detail",
  title: "Edit in drawer",
  run(ctx, args) {
    if (!ctx.state.hasField(chromeField) || !args) return false;
    const c = ctx.state.field(chromeField);
    ctx.dispatch?.(ctx.tr.effect(setChrome, { detail: c.detail === args.kind ? null : args.kind, panel: null }));
    return true;
  },
});
export const detailClose = chromeCommand("inspector.detailClose", "Close drawer editor", (c) => (c.detail ? { detail: null } : null));

const diffToggle = chromeCommand("diff.toggle", "Show unsaved changes", (c) => ({ diffOpen: !c.diffOpen }));
const diffClose = chromeCommand("diff.close", "Close unsaved changes", (c) => (c.diffOpen ? { diffOpen: false } : null));

export const toggleGridlines = chromeCommand("view.toggleGridlines", "Toggle grid lines", (c) => ({ gridlines: !c.gridlines }));
export const toggleHidden = chromeCommand("view.toggleHidden", "Toggle hidden components", (c) => ({ showHidden: !c.showHidden }));
/** Preview turns editing off and clears the selection; leaving it restores that selection. */
function setPreview(id: string, title: string, next: (c: ChromeState) => boolean | null) {
  return defineCommand({
    id,
    title,
    run(ctx) {
      if (!ctx.state.hasField(chromeField)) return false;
      const c = ctx.state.field(chromeField);
      const on = next(c);
      if (on === null || on === c.preview) return false;
      const keep = c.previewSelection.filter((h) => h.alive);
      ctx.tr.effect(setChrome, on ? { preview: true, previewSelection: ctx.selection.handles, contextMenu: null, drawer: null, detail: null } : { preview: false, previewSelection: [] });
      ctx.tr.effect(setSelection, on ? { handles: [] } : { handles: keep });
      ctx.dispatch?.(ctx.tr);
      return true;
    },
  });
}
const previewToggle = setPreview("preview.toggle", "Toggle preview", (c) => !c.preview);
const previewExit = setPreview("preview.exit", "Exit preview", (c) => (c.preview ? false : null));

export const sidebarOpen = chromeCommand("sidebar.open", "Open settings panel", (c) => (c.sidebarOpen ? null : { sidebarOpen: true }));
/** `{ auto: true }`: the editor closing it (narrow window), not the user — a selection may reopen it at once. */
const sidebarClose = defineCommand<{ auto?: boolean } | undefined>({
  id: "sidebar.close",
  title: "Close settings panel",
  run(ctx, args) {
    const c = ctx.state.hasField(chromeField) ? ctx.state.field(chromeField) : null;
    if (!c?.sidebarOpen) return false;
    ctx.dispatch?.(ctx.tr.effect(setChrome, { sidebarOpen: false, drawer: null, sidebarClosedAt: args?.auto ? 0 : Date.now() }));
    return true;
  },
});
const sidebarToggleSide = chromeCommand("sidebar.toggleSide", "Move settings panel", (c) => ({ sidebarLeft: !c.sidebarLeft }));
const moreToggle = chromeCommand("menu.more", "Settings", (c) => ({ drawer: c.drawer === "more" ? null : "more" }));
const drawerClose = chromeCommand("drawer.close", "Close drawer", (c) => (c.drawer ? { drawer: null } : null));
const sidebarSearchToggle = chromeCommand("sidebar.search", "Search settings", (c) => ({ sidebarSearch: !c.sidebarSearch }));

/** Zoom keys do nothing (and so reach the browser) while the pointer is over the sidebar or top bar. */
const overChrome = (ui: UiContext) => ui.pointerOver === "panel" || ui.pointerOver === "topbar";
const zoomTo = (id: string, title: string, next: (z: number) => number | null) =>
  chromeCommand(id, title, (c, ui) => {
    if (overChrome(ui)) return null;
    const z = next(c.zoom);
    return z === null || (z === c.zoom && !c.fit) ? null : { zoom: z, fit: false };
  });
export const zoomIn = zoomTo("canvas.zoomIn", "Zoom in", (z) => ZOOM_PRESETS.find((p) => p > z + 1e-9) ?? null);
export const zoomOut = zoomTo("canvas.zoomOut", "Zoom out", (z) => [...ZOOM_PRESETS].reverse().find((p) => p < z - 1e-9) ?? null);
export const zoomReset = zoomTo("canvas.zoomReset", "Reset zoom", () => 1);
export const ZOOM_MIN = ZOOM_PRESETS[0]!;
export const ZOOM_MAX = ZOOM_PRESETS[ZOOM_PRESETS.length - 1]!;

/** A level from the zoom dropdown (clamped to the preset range); turns fit off. */
export const zoomSet = defineCommand<{ zoom: number }>({
  id: "canvas.zoomSet",
  title: "Set zoom",
  run(ctx, args) {
    if (!ctx.state.hasField(chromeField) || !args || !Number.isFinite(args.zoom)) return false;
    ctx.dispatch?.(ctx.tr.effect(setChrome, { zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, args.zoom)), fit: false }));
    return true;
  },
});
export const zoomFit = chromeCommand("canvas.zoomFit", "Fit to window", (c) => (c.fit ? null : { fit: true }));
/** The canvas measured its fit zoom (only while fit is on). */
export const zoomFitApply = defineCommand<{ zoom: number }>({
  id: "canvas.zoomFitApply",
  title: "Apply fit zoom",
  run(ctx, args) {
    const c = ctx.state.hasField(chromeField) ? ctx.state.field(chromeField) : null;
    if (!c?.fit || !args || Math.abs(args.zoom - c.zoom) < 1e-4) return false;
    ctx.dispatch?.(ctx.tr.effect(setChrome, { zoom: args.zoom }));
    return true;
  },
});

/** Top-bar buttons, rightmost first (the row is reversed); the breakpoint switcher follows undo. */
export const TOPBAR_SLOT = "topbar";
/** The More drawer's sections. */
export const MORE_SLOTS = ["more/settings", "more/view", "more/tools", "more/preferences"] as const;

const MENUS = contributes({
  menus: {
    [TOPBAR_SLOT]: [
      { command: "insert.toggle", group: "primary@10", when: "role != 'client'" },
      { command: "history.redo", group: "history@20" },
      { command: "history.undo", group: "history@30" },
      { command: "preview.toggle", group: "view@50" },
      { command: "file.save", group: "save@70" },
      { command: "menu.more", group: "more@80" },
      // Publish sits at the far right (lowest order → first in the reversed row), styled as a filled pill.
      { command: "site.publish", group: "publish@5" },
    ],
    "more/settings": [{ command: "panel.theme", group: "settings@20" }, { command: "panel.media", group: "settings@30" }, { command: "panel.scripts", group: "settings@40", when: "role != 'client'" }],
    "more/view": [
      { command: "panel.layers", group: "view@10" },
      { command: "view.toggleGridlines", group: "view@30" },
      { command: "view.toggleMarkers", group: "view@40" },
      { command: "view.toggleGuides", group: "view@50" },
      { command: "view.toggleHidden", group: "view@60" },
    ],
    "more/tools": [{ command: "panel.modifiers", group: "tools@10" }],
    "more/preferences": [{ command: "sidebar.toggleSide", group: "preferences@10" }],
  },
});

const KEYBINDINGS = contributes({
  keybindings: [
    { command: "palette.toggle", key: "mod+k", when: "paletteOpen || !textEditing" },
    { command: "history.redo", key: "mod+y", when: "!textEditing" },
    { command: "panel.media", key: "mod+shift+m", when: "!textEditing" },
    { command: "panel.theme", key: "mod+shift+d" },
    { command: "panel.layers", key: "mod+shift+l", when: "!textEditing" },
    { command: "panel.modifiers", key: "mod+shift+o", when: "!textEditing" },
    { command: "view.toggleGridlines", key: "mod+shift+g", when: "!textEditing" },
    { command: "view.toggleHidden", key: "mod+shift+h" },
    { command: "sidebar.search", key: "mod+f", when: "pointerOver == 'panel'" },
    { command: "canvas.zoomIn", key: "mod+=" },
    { command: "canvas.zoomIn", key: "mod+shift+=" },
    { command: "canvas.zoomOut", key: "mod+-" },
    { command: "canvas.zoomReset", key: "mod+0" },
  ],
  palette: [
    ...["history.undo", "history.redo", "element.copy", "element.cut", "element.paste", "element.duplicate", "element.remove", "element.wrap"].map((command) => ({ command, group: "Edit" })),
    ...["element.selectParent", "element.selectChild", "element.selectNext", "element.selectPrev", "element.moveUp", "element.moveDown", "selection.clear"].map((command) => ({ command, group: "Navigate" })),
    ...[...PANEL_COMMANDS.map((c) => c.id), "view.toggleGridlines", "view.toggleHidden", "preview.toggle", "canvas.zoomIn", "canvas.zoomOut", "canvas.zoomReset", "canvas.zoomFit"].map((command) => ({ command, group: "View" })),
    { command: "file.save", group: "File" },
    { command: "diff.toggle", group: "File" },
  ],
});

/** Escape leaves preview before anything else (highest precedence, only while previewing). */
const PREVIEW_ESC = Prec.highest(contributes({ keybindings: [{ command: "preview.exit", key: "escape", when: "preview" }] }));

export const CHROME_KIT: Extension = [
  chromeField, paletteToggle, paletteClose, diffToggle, diffClose, contextMenuOpen, contextMenuClose, ...PANEL_COMMANDS, detailOpen, detailClose,
  toggleGridlines, toggleHidden, previewToggle, previewExit, sidebarSearchToggle, zoomIn, zoomOut, zoomReset, zoomSet, zoomFit, zoomFitApply,
  sidebarOpen, sidebarClose, sidebarToggleSide, moreToggle, drawerClose,
  KEYBINDINGS, PREVIEW_ESC, MEDIA_KEYS, MENUS,
];
