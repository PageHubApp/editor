/**
 * Select a node and, `REVEAL_AFTER_MS` later (once the canvas has rendered the change), scroll
 * the main canvas smoothly to it. Used after an insert from the Add panel or the Add Section
 * dialog, and by a notice's "Show".
 */
import type { NodeHandle, Store } from "@pagehub/engine";
import { editSrcOf } from "@pagehub/engine/canvas";
import { elementsFor } from "../canvas/frameDom";

export const REVEAL_AFTER_MS = 100;

/** Scroll the canvas to `h` (default: the selection) now; false when it isn't on the canvas. */
export function scrollToNode(store: Store, h: NodeHandle | null = store.state.selection.primary, block: ScrollLogicalPosition = "center"): boolean {
  const doc = typeof document === "undefined" ? null : document.querySelector<HTMLIFrameElement>("[data-canvas-frame]")?.contentDocument;
  if (!doc || !h?.alive || h.kind !== "element") return false;
  const el = elementsFor(doc, editSrcOf(h))[0];
  el?.scrollIntoView?.({ block, behavior: "smooth" });
  return !!el;
}

/** Select `h` (when given and not already selected), then scroll to the selection. */
export function revealNode(store: Store, h?: NodeHandle | null, block: ScrollLogicalPosition = "center"): void {
  if (h?.alive && store.state.selection.primary !== h) store.select(h);
  setTimeout(() => scrollToNode(store, undefined, block), REVEAL_AFTER_MS);
}
