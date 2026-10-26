/**
 * Zoom is remembered per mode — device frames and breakpoint views each keep their own level
 * and "Fit to window" flag (today's `-fit` storage), in this browser. Switching mode restores
 * that mode's zoom; nothing stored means Fit to window, the default (the inventory's 0.75
 * starting zoom is not copied: fit gives the frame the room the window has). The fluid desktop
 * view isn't stored. Switching between breakpoint views still resets an explicit zoom to 100%.
 */
import { useEffect, useRef } from "react";
import type { View } from "@pagehub/engine/kits";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { readJSON, writeJSON } from "../../primitives/storage";
import { chromeOf } from "../../shell/chromeState";

type ZoomMode = "device" | "breakpoint" | "desktop";
const zoomModeOf = (view: View, device: boolean): ZoomMode => (device ? "device" : view === "desktop" ? "desktop" : "breakpoint");
export const ZOOM_KEY: Readonly<Record<Exclude<ZoomMode, "desktop">, string>> = { device: "editor-device-zoom", breakpoint: "editor-breakpoint-zoom" };

export function useZoomPersistence(view: View, device: boolean): void {
  const store = useEditorStore();
  const mode = zoomModeOf(view, device);
  const zoom = useEditorState((s) => chromeOf(s).zoom);
  const fit = useEditorState((s) => chromeOf(s).fit);
  const loaded = useRef<ZoomMode | null>(null);
  useEffect(() => {
    if (mode === "desktop") return void (loaded.current = mode);
    const saved = readJSON<{ zoom: number; fit: boolean } | null>(ZOOM_KEY[mode], null);
    if (!saved || saved.fit) store.run("canvas.zoomFit");
    else store.run("canvas.zoomSet", { zoom: saved.zoom });
    loaded.current = mode;
  }, [mode, store]);
  useEffect(() => {
    if (mode === "desktop" || loaded.current !== mode) return;
    writeJSON(ZOOM_KEY[mode], { zoom, fit });
  }, [mode, zoom, fit]);
}
