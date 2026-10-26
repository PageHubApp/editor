/**
 * Canvas session state and the commands the canvas, top bar, keymap and tests share: which
 * page is shown, which includes are open for editing, the device / responsive toggles, the
 * edge-drag width override, guides and the side-by-side mirror. Effect-only, so never an undo
 * step. Selection and hover live in the core selection; the canvas only maps a rendered
 * element's `data-edit-src` to a handle.
 */
import { StateEffect, StateField, contributes, defineCommand, effectsOf, setHover, setSelection, type CommandContext, type EditorState, type Extension, type NodeHandle, type Path } from "@pagehub/engine";
import { type View } from "@pagehub/engine/kits";
import { handleForSrc, includeTagFor, type SourceHost } from "@pagehub/engine/canvas";
import { setUi, uiField } from "../../state/uiState";
import { setInspector, inspectorField } from "../inspector/inspectorState";
import { chromeField, setChrome } from "../../shell/chromeState";
import { DEVICE_PRESETS, type DevicePreset } from "./viewportMath";
import { themeSetBreakpoint } from "@pagehub/engine/kits";
import { listPageFiles } from "../topbar/pages";

interface CanvasState {
  /** The page file shown (null: the first markup file outside partials/ and sections/). */
  page: Path | null;
  /** Include files opened with "Edit <name>": clicks inside them select their own elements. */
  includes: readonly Path[];
  device: boolean;
  /** Breakpoint view caps at the width (true) or is exact with horizontal scroll (false). */
  responsive: boolean;
  /** Edge-handle drag width; not persisted. */
  widthOverride: number | null;
  markers: boolean;
  guides: boolean;
  /** Read-only side-by-side mirror at this view. */
  mirror: View | null;
  /** The phone the device frame shows (a preset or "Custom" dimensions). */
  phone: DevicePreset;
  /** `data-edit-src` of the `<details>` previewed closed. Canvas-only (never the saved `open`); default is open. */
  closedDetails: readonly string[];
  /** `data-edit-src` of the `[popover]` / `<dialog>` previewed open. Canvas-only (never the saved source); default is closed. */
  openOverlays: readonly string[];
  /**
   * Trigger edit src → the state keys its previewed actions wrote, each with the value to put back on close. Canvas-only:
   * the writes go to the canvas runtime's state store, never the saved source.
   */
  statePreview: Readonly<Record<string, readonly (readonly [string, string | undefined])[]>>;
}

const DEFAULT_CANVAS: CanvasState = { page: null, includes: [], device: false, responsive: true, widthOverride: null, markers: false, guides: false, mirror: null, phone: DEVICE_PRESETS[0]!, closedDetails: [], openOverlays: [], statePreview: {} };

export const setCanvas = StateEffect.define<Partial<CanvasState>>("canvas.set");

export const canvasField = StateField.define<CanvasState>({
  name: "canvas",
  create: () => DEFAULT_CANVAS,
  update(value, tr) {
    const patches = effectsOf(tr, setCanvas);
    return patches.length ? patches.reduce<CanvasState>((v, p) => ({ ...v, ...p }), value) : value;
  },
});

export const canvasOf = (s: EditorState): CanvasState => (s.hasField(canvasField) ? s.field(canvasField) : DEFAULT_CANVAS);

/** Page files (under `pages/` in a hosted site, else markup outside include folders), home page first. */
export function pageFiles(s: EditorState): Path[] {
  return listPageFiles(s.files.keys());
}

/** The chosen page, ignoring any partial being edited: the chosen one, else (none chosen, or it
 * was deleted) the home page. Use this for "the page to return to". */
export function canvasPageBase(s: EditorState): Path | null {
  const c = canvasOf(s);
  if (c.page && s.files.has(c.page)) return c.page;
  return pageFiles(s)[0] ?? null;
}

/**
 * The file the canvas shows. The inspector's "Edit partial" (and the component board's isolate)
 * set `inspector.componentEditor`; while it names a file that exists, the canvas shows that
 * partial so every canvas tool works on it. Otherwise the chosen page (`canvasPageBase`).
 */
export function canvasPage(s: EditorState): Path | null {
  const editing = s.hasField(inspectorField) ? s.field(inspectorField).componentEditor : null;
  if (editing && s.files.has(editing)) return editing;
  return canvasPageBase(s);
}

/**
 * What a click on a rendered element selects: the element itself, unless it sits in an include
 * that isn't open for editing — then the page's `{% render %}` / `{% section %}` tag.
 */
export function selectTarget(store: SourceHost, src: string | null): NodeHandle | null {
  const h = handleForSrc(store, src);
  if (!h) return null;
  const page = canvasPage(store.state);
  if (!page || h.path === page || canvasOf(store.state).includes.includes(h.path)) return h;
  return includeTagFor(store, page, h.path) ?? h;
}

const hostOf = (ctx: CommandContext): SourceHost | null => (ctx.registry ? { state: ctx.state, registry: ctx.registry } : null);

const canvasSelect = defineCommand<{ src: string | null }>({
  id: "canvas.select",
  title: "Select element",
  run(ctx, args) {
    const host = hostOf(ctx);
    const h = args && host ? selectTarget(host, args.src) : null;
    if (!h) return false;
    if (ctx.selection.handles.length === 1 && ctx.selection.primary === h) return false;
    ctx.dispatch?.(ctx.tr.effect(setSelection, { handles: [h] }));
    return true;
  },
});

const canvasHover = defineCommand<{ src: string | null }>({
  id: "canvas.hover",
  title: "Hover element",
  run(ctx, args) {
    const host = hostOf(ctx);
    const h = args?.src && host ? selectTarget(host, args.src) : null;
    if (h === ctx.selection.hover) return false;
    ctx.dispatch?.(ctx.tr.effect(setHover, h));
    return true;
  },
});

const canvasEditInclude = defineCommand<{ path: Path }>({
  id: "canvas.editInclude",
  title: "Edit include",
  run(ctx, args) {
    const c = canvasOf(ctx.state);
    if (!args || !ctx.state.hasField(canvasField) || !ctx.state.files.has(args.path) || c.includes.includes(args.path)) return false;
    ctx.dispatch?.(ctx.tr.effect(setCanvas, { includes: [...c.includes, args.path] }));
    return true;
  },
});

const canvasSet = defineCommand<Partial<CanvasState>>({
  id: "canvas.set",
  title: "Canvas view",
  run(ctx, args) {
    if (!args || !ctx.state.hasField(canvasField)) return false;
    let tr = ctx.tr.effect(setCanvas, args);
    // Choosing a page (page selector, layer tree) also leaves any "Edit partial" view, and clears
    // the selection — the selected node lives on the page/partial we're leaving, so the inspector
    // must reset instead of showing a stale node from it.
    if (args.page !== undefined) {
      const editing = ctx.state.hasField(inspectorField) ? ctx.state.field(inspectorField).componentEditor : null;
      if (editing) {
        tr = tr.effect(setInspector, { componentEditor: null });
        // the partial's view-only previews (its auto-opened drawer) leave with it
        const open = canvasOf(ctx.state).openOverlays;
        if (args.openOverlays === undefined && open.some((src) => src.startsWith(`${editing}#`))) tr = tr.effect(setCanvas, { openOverlays: open.filter((src) => !src.startsWith(`${editing}#`)) });
      }
      if (args.page !== canvasPage(ctx.state)) tr = tr.effect(setSelection, { handles: [] });
    }
    ctx.dispatch?.(tr);
    return true;
  },
});

/**
 * Switch the canvas view (a switcher chip): clicking the active chip goes back to `desktop`;
 * the edge-drag width resets; breakpoint zoom resets to 100% unless fit-to-window is on.
 */
const canvasView = defineCommand<{ view: View }>({
  id: "canvas.view",
  title: "Switch breakpoint",
  run(ctx, args) {
    if (!args || !ctx.state.hasField(uiField)) return false;
    const current = ctx.state.field(uiField).view;
    const view = args.view === current && current !== "desktop" ? "desktop" : args.view;
    if (view === current) return false;
    ctx.tr.effect(setUi, { view });
    if (ctx.state.hasField(canvasField)) ctx.tr.effect(setCanvas, { widthOverride: null });
    if (ctx.state.hasField(chromeField) && !ctx.state.field(chromeField).fit) ctx.tr.effect(setChrome, { zoom: 1 });
    ctx.dispatch?.(ctx.tr);
    return true;
  },
});

/** Device frames on/off; turning them on from the fluid desktop view switches to mobile. */
const canvasDevice = defineCommand({
  id: "canvas.toggleDevice",
  title: "Toggle device frame",
  run(ctx) {
    if (!ctx.state.hasField(canvasField)) return false;
    const on = !canvasOf(ctx.state).device;
    ctx.tr.effect(setCanvas, { device: on, mirror: on ? null : canvasOf(ctx.state).mirror });
    if (on && ctx.state.hasField(uiField) && ctx.state.field(uiField).view === "desktop") ctx.tr.effect(setUi, { view: "mobile" });
    ctx.dispatch?.(ctx.tr);
    return true;
  },
});

/** Preview a `<details>` closed / open in the canvas only: no source change, no undo step. */
const canvasToggleDetails = defineCommand<{ src: string }>({
  id: "canvas.toggleDetails",
  title: "Preview details open / closed",
  run(ctx, args) {
    if (!args?.src || !ctx.state.hasField(canvasField)) return false;
    const closed = canvasOf(ctx.state).closedDetails;
    ctx.dispatch?.(ctx.tr.effect(setCanvas, { closedDetails: closed.includes(args.src) ? closed.filter((s) => s !== args.src) : [...closed, args.src] }));
    return true;
  },
});

/** Preview a `[popover]` / `<dialog>` open / closed in the canvas only: no source change, no undo step. */
const canvasToggleOverlay = defineCommand<{ src: string }>({
  id: "canvas.toggleOverlay",
  title: "Preview popover or dialog open / closed",
  run(ctx, args) {
    if (!args?.src || !ctx.state.hasField(canvasField)) return false;
    const open = canvasOf(ctx.state).openOverlays;
    ctx.dispatch?.(ctx.tr.effect(setCanvas, { openOverlays: open.includes(args.src) ? open.filter((s) => s !== args.src) : [...open, args.src] }));
    return true;
  },
});

/** Apply a lint diagnostic's fix (its splices, in one transaction = one undo step). */
const lintFix = defineCommand<{ path: Path; splices: ReadonlyArray<{ from: number; to: number; insert: string }> }>({
  id: "lint.fix",
  title: "Fix issue",
  run(ctx, args) {
    if (!args?.splices.length || !ctx.state.files.has(args.path)) return false;
    for (const sp of [...args.splices].sort((a, b) => b.from - a.from)) ctx.tr.replace({ path: args.path, from: sp.from, to: sp.to }, sp.insert);
    ctx.dispatch?.(ctx.tr);
    return true;
  },
});

const toggle = (id: string, title: string, key: "markers" | "guides") =>
  defineCommand({
    id,
    title,
    run(ctx) {
      if (!ctx.state.hasField(canvasField)) return false;
      ctx.dispatch?.(ctx.tr.effect(setCanvas, { [key]: !canvasOf(ctx.state)[key] }));
      return true;
    },
  });
export const toggleMarkers = toggle("view.toggleMarkers", "Toggle breakpoint lines", "markers");
export const toggleGuides = toggle("view.toggleGuides", "Toggle device guides", "guides");

const CANVAS_COMMANDS = [canvasSelect, canvasHover, canvasEditInclude, canvasSet, canvasView, canvasDevice, canvasToggleDetails, canvasToggleOverlay, lintFix, toggleMarkers, toggleGuides, themeSetBreakpoint] as const;

const PALETTE = contributes({ palette: ["canvas.toggleDevice", "view.toggleMarkers", "view.toggleGuides"].map((command) => ({ command, group: "View" })) });

/** The last transaction that changed text: its command, and whether it was a rich-text commit. */
interface LastEdit {
  command: string | undefined;
  serial: number;
}
const lastEditField = StateField.define<LastEdit>({
  name: "canvas.lastEdit",
  create: () => ({ command: undefined, serial: 0 }),
  update: (value, tr) => (tr.changes.empty ? value : { command: tr.annotations.command, serial: value.serial + 1 }),
});
export const lastEditOf = (s: EditorState): LastEdit | null => (s.hasField(lastEditField) ? s.field(lastEditField) : null);

/** Canvas state + commands. Add to `editorKit()` (coordinator) or to a test editor's extensions. */
export function canvasKit(): Extension {
  return KIT;
}
const KIT: Extension = [canvasField, lastEditField, CANVAS_COMMANDS, PALETTE];
