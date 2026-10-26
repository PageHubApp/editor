/**
 * Keeps two stylesheets in the editor's own document that the canvas picks up: the canvas iframe
 * mirrors every `<style>` / `<link>` of its parent on each render (frameDom `syncHostStyles`), so
 * a `<style>` placed here reaches the page without touching the canvas code.
 *
 * - Theme vars: the Theme panel's overrides, scoped to the canvas (`themeVarsCss`) so palette /
 *   radius / spacing / font edits reflect live on the page but never on the editor chrome. Kept
 *   in sync with `theme.css`.
 * - Modifier presets: the `.ph-mod-*` rules (`MODIFIER_PRESET_CSS`) the demo's Tailwind build
 *   does not emit, so an applied modifier has its look in the canvas.
 *
 * Renders nothing. Mounted once by `<Editor>`, so both persist whether or not a panel is open.
 */
import { useEffect } from "react";
import { useEditorState } from "../../react/bindings";
import { readTheme, themeVarsCss, THEME_FILE } from "./themeModel";
import { usePaletteEditMode } from "./themePreview";
import { MODIFIER_PRESET_CSS } from "../modifiers/modifierPresets";
import { CANVAS_BRIDGE_ATTR } from "../canvas/frameDom";

const THEME_STYLE_ID = "ph-theme-vars";
const MODIFIER_STYLE_ID = "ph-modifier-presets";

function ensureStyle(id: string): HTMLStyleElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    el.setAttribute(CANVAS_BRIDGE_ATTR, "");
    (document.head ?? document.documentElement).appendChild(el);
  }
  return el;
}

export function CanvasStyleBridge() {
  const css = useEditorState((s) => s.files.get(THEME_FILE));
  const editMode = usePaletteEditMode();

  // Static once: the modifier-preset rules.
  useEffect(() => {
    const el = ensureStyle(MODIFIER_STYLE_ID);
    if (el && el.textContent !== MODIFIER_PRESET_CSS) el.textContent = MODIFIER_PRESET_CSS;
  }, []);

  // Synced: the theme overrides, before the canvas's async re-render reads them. When the panel
  // is editing the Dark variant, preview it live on the canvas.
  useEffect(() => {
    const el = ensureStyle(THEME_STYLE_ID);
    if (el) el.textContent = themeVarsCss(readTheme(css), editMode === "dark");
  }, [css, editMode]);

  return null;
}
