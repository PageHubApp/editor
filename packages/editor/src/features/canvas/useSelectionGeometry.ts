/**
 * Where the selection is drawn: its rendered elements (every `{% for %}` row), their rect in the
 * overlay layer, and the selected handle. Re-measured after a render, a selection change, a zoom
 * change, and a scroll of the canvas document (synchronously: `useCanvasScrollSync`).
 */
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { editSrcOf, includeTarget } from "@pagehub/engine/canvas";
import { useCanvasFrame } from "./canvasContext";
import { elementsFor, elementsOfFile, hostRect, toRect, unionRect } from "./frameDom";
import type { Rect } from "./geometry";

interface SelectionGeometry {
  handle: NodeHandle;
  /** Rendered elements of the selection (several for a repeated row). */
  elements: HTMLElement[];
  /** The first rendering's rect in the overlay layer. */
  rect: Rect;
  /** The include file the selected `{% render %}` / `{% section %}` tag shows, when it is one. */
  include: string | null;
}

const INCLUDE = /^\{%-?\s*(render|section)\s+(['"])([\w-]+)\2/;

/** `partials/<name>.liquid` / `sections/<name>.liquid` for an include tag handle. */
function includePathOf(h: NodeHandle): string | null {
  if (h.kind === "element" || !h.alive) return null;
  const m = INCLUDE.exec(h.text());
  if (!m) return null;
  const path = `${m[1] === "render" ? "partials" : "sections"}/${m[3]}.liquid`;
  return includeTarget(path) ? path : null;
}

/**
 * Re-renders the caller on every scroll / resize of the canvas document, synchronously inside the
 * event (`flushSync`): the browser runs the scroll event before it paints that frame, so overlays
 * measured here land on the same frame as the content they follow instead of one frame behind.
 */
export function useCanvasScrollSync(): void {
  const { doc, version } = useCanvasFrame();
  const [, setTick] = useState(0);
  useEffect(() => {
    const win = doc?.defaultView;
    if (!win) return;
    const bump = () => flushSync(() => setTick((t) => t + 1));
    win.addEventListener("scroll", bump, { passive: true });
    win.addEventListener("resize", bump);
    return () => {
      win.removeEventListener("scroll", bump);
      win.removeEventListener("resize", bump);
    };
  }, [doc, version]);
}

export function useSelectionGeometry(): SelectionGeometry | null {
  const { doc, frame, host } = useCanvasFrame();
  useCanvasScrollSync();
  const handle = useEditorState((s) => (s.selection.primary?.alive ? s.selection.primary : null));
  const range = useEditorState((s) => (s.selection.primary?.alive ? `${s.selection.primary.range.from}:${s.selection.primary.range.to}` : ""));
  const zoom = useEditorState((s) => chromeOf(s).zoom || 1);
  void range;
  if (!doc || !frame || !host || !handle) return null;
  const include = includePathOf(handle);
  const elements = include ? elementsOfFile(doc, include) : handle.kind === "element" ? elementsFor(doc, editSrcOf(handle)) : [];
  if (!elements.length) return null;
  const inner = include ? unionRect(elements.map((e) => toRect(e.getBoundingClientRect())))! : toRect(elements[0]!.getBoundingClientRect());
  return { handle, elements, rect: hostRect(inner, frame, host, zoom), include };
}
