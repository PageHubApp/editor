/**
 * Editor session state the chrome shares — canvas view, the dark-variant toggle, multi-scope
 * writes, indicator density, the open breakpoint-chip popover. It lives in a core state field
 * (never in history: effect-only transactions don't make undo steps), so switching view or
 * scope is a command (`ui.set`) the keymap, palette, MCP and tests reach like any other.
 */
import { Prec, StateEffect, StateField, contributes, defineCommand, effectsOf, type Extension, type NodeHandle } from "@pagehub/engine";
import { type Breakpoint, type Scope, type View } from "@pagehub/engine/kits";
import { dismissTopOverlay, overlayDepth } from "../primitives/overlayStack";
import { CHROME_KIT } from "../shell/chromeState";
import { classLayers } from "./classLayers";
import { inspectorKit } from "../features/inspector/inspectorState";
import { canvasKit } from "../features/canvas/canvasState";
import { livePreviewKit } from "../features/canvas/livePreview";
import { richTextKit } from "../features/richtext/richTextState";
import { layersKit } from "../features/layers/layersKit";
import { addPanelKit } from "../features/add/addPanelState";
import { boardKit } from "../features/board/boardState";

export type IndicatorDensity = "auto" | "always" | "off";

export interface ChipPopover {
  handle: NodeHandle;
  group: string;
  /** "Show source": the layer cell to pulse. */
  pulse?: "mobile" | Breakpoint | null;
}

export interface UiState {
  /** Canvas view: `desktop` (fluid), `mobile` (base) or a breakpoint. */
  view: View;
  /** Class writes target `dark:` variants. */
  dark: boolean;
  /** When non-empty, class writes go to every listed breakpoint instead of the canvas one. */
  multiScope: readonly Breakpoint[];
  density: IndicatorDensity;
  chipPopover: ChipPopover | null;
  /** Active inspector tab (follows the scroll). */
  inspectorTab: string;
}

export const DEFAULT_UI: UiState = { view: "desktop", dark: false, multiScope: [], density: "auto", chipPopover: null, inspectorTab: "component" };

export const setUi = StateEffect.define<Partial<UiState>>("ui.set");

export const uiField = StateField.define<UiState>({
  name: "ui",
  create: () => DEFAULT_UI,
  update(value, tr) {
    const patches = effectsOf(tr, setUi);
    return patches.length ? patches.reduce<UiState>((v, p) => ({ ...v, ...p }), value) : value;
  },
});

const uiSet = defineCommand<Partial<UiState>>({
  id: "ui.set",
  title: "Set editor view",
  run(ctx, args) {
    if (!ctx.state.hasField(uiField) || !args) return false;
    ctx.tr.effect(setUi, args);
    ctx.dispatch?.(ctx.tr);
    return true;
  },
});

/**
 * Close the top chrome overlay (popover, panel, modal, menu). Can't run with nothing open, so
 * Escape falls through to `selection.clear` (Esc order: top overlay, then the selection).
 */
const overlayDismissTop = defineCommand({
  id: "overlay.dismissTop",
  title: "Close",
  run(ctx) {
    if (overlayDepth() === 0) return false;
    return ctx.dispatch ? dismissTopOverlay() : true;
  },
});

// built on first use: the canvas and inspector kits import this module's fields
let kit: Extension | undefined;

/** The extension `<Editor>` needs in the core's configuration. */
export function editorKit(): Extension {
  return (kit ??= [uiField, uiSet, classLayers, CHROME_KIT, inspectorKit(), canvasKit(), livePreviewKit(), richTextKit(), layersKit(), addPanelKit(), boardKit(), overlayDismissTop, Prec.high(contributes({ keybindings: [{ command: "overlay.dismissTop", key: "escape" }] }))]);
}

/**
 * The scopes the next class write targets (`getEffectiveViews` + `changeProp`): multi-scope
 * wins; else "scope = canvas view" (`desktop` and `mobile` write the base layer). A state
 * (`hover`) writes no breakpoint. `dark` chains onto each.
 */
export function writeScopes(ui: Pick<UiState, "view" | "dark" | "multiScope">, state?: string): Scope[] {
  const dark = ui.dark || undefined;
  if (state) return [{ dark, state }];
  if (ui.multiScope.length) return ui.multiScope.map((breakpoint) => ({ breakpoint, dark }));
  const breakpoint = ui.view === "desktop" || ui.view === "mobile" ? undefined : ui.view;
  return [{ breakpoint, dark }];
}
