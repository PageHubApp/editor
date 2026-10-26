/**
 * A tiny module-level store for which palette variant the Theme panel is currently editing. The
 * panel's Light/Dark toggle writes it; `CanvasStyleBridge` (mounted by `<Editor>`, outside the
 * panel tree) subscribes so the canvas previews the dark palette while the Dark tab is active, so
 * toggling to Dark shows the dark colours live.
 *
 * It is NOT persisted to `theme.css` — it is editor-view state only. The dark colours themselves
 * persist as `--color-dark-*` (see themeModel), so the preview flag is purely cosmetic.
 */
import { useSyncExternalStore } from "react";

let mode: "light" | "dark" = "light";
const listeners = new Set<() => void>();

export function setPaletteEditMode(next: "light" | "dark"): void {
  if (next === mode) return;
  mode = next;
  for (const l of listeners) l();
}

function getPaletteEditMode(): "light" | "dark" {
  return mode;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Subscribe to the palette edit mode (re-renders on change). */
export function usePaletteEditMode(): "light" | "dark" {
  return useSyncExternalStore(subscribe, getPaletteEditMode, getPaletteEditMode);
}
