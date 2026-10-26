// Dragging rows in the layers list via a pointer gesture (not HTML5 drag and drop).
/**
 * Dragging rows in a layers list. `useLayerDrag()` gives each row its props (`row(handle,
 * depth)`): a press drags the row (4px threshold, window listeners), the dragged row shows at
 * 40% opacity, and the row under the pointer gets a zone: before / after (a drop line indented
 * to the target's depth), inside (the row's drop-inside style; containers only), or after the
 * parent when the pointer is near the left edge. Nothing is shown over the dragged row or its
 * descendants, or off the rows. Release runs `element.move` (one transaction) when the drop
 * rules allow it, else nothing moves.
 */
import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { InsertPoint, NodeHandle } from "@pagehub/engine";
import { useEditorStore } from "../../react/bindings";
import { toRect } from "../canvas/frameDom";
import { useDragGesture } from "../../primitives/useDragGesture";
import { DRAG_THRESHOLD } from "./CanvasDnd";
import { CONTAINER_TAGS } from "./dropPlan";
import { layerZone, type LayerZone } from "./geometry";

interface LayerIndicator {
  target: NodeHandle;
  zone: LayerZone;
  /** Depth the drop line is indented to (the parent's for "after-parent"). */
  depth: number;
  /** The move the drop would run, and whether the drop rules allow it. */
  to: InsertPoint;
  valid: boolean;
}

const isLayerContainer = (h: NodeHandle) => (h.kind === "element" && CONTAINER_TAGS.has(h.tag)) || h.kind === "liquid-block";

const descends = (h: NodeHandle, of: NodeHandle) => {
  for (let p: NodeHandle | null = h; p; p = p.parent()) if (p === of) return true;
  return false;
};

export function useLayerDrag() {
  const store = useEditorStore();
  const rows = useRef(new Map<NodeHandle, { el: HTMLElement; depth: number }>());
  const [dragging, setDragging] = useState<NodeHandle | null>(null);
  const [indicator, setIndicator] = useState<LayerIndicator | null>(null);
  const armed = useRef<NodeHandle | null>(null);
  const current = useRef<LayerIndicator | null>(null);

  const over = (src: NodeHandle, x: number, y: number): LayerIndicator | null => {
    for (const [h, { el, depth }] of rows.current) {
      const r = toRect(el.getBoundingClientRect());
      if (!h.alive || x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      if (descends(h, src)) return null;
      let zone = layerZone(r, x, y, { depth, container: isLayerContainer(h), hasChildren: h.children().some((c) => c.kind !== "text" || !!c.text().trim()) });
      const parent = h.parent();
      if (zone === "after-parent" && !parent) zone = "after";
      const to: InsertPoint = zone === "before" ? { before: h } : zone === "after" ? { after: h } : zone === "inside" ? { append: h } : { after: parent! };
      return { target: zone === "after-parent" ? parent! : h, zone, depth: zone === "after-parent" ? depth - 1 : depth, to, valid: store.can("element.move", { nodes: [src], to }) };
    }
    return null;
  };

  const gesture = useDragGesture({
    threshold: DRAG_THRESHOLD,
    onMove(_e, m) {
      const src = armed.current;
      if (!src || Math.hypot(m.dx, m.dy) < DRAG_THRESHOLD) return;
      setDragging(src);
      current.current = over(src, m.clientX, m.clientY);
      setIndicator(current.current);
    },
    onEnd(e) {
      const src = armed.current;
      const drop = current.current;
      armed.current = null;
      current.current = null;
      setDragging(null);
      setIndicator(null);
      if (e && src && drop?.valid) store.run("element.move", { nodes: [src], to: drop.to });
    },
  });

  /** Props for one row: register its element, start a drag, the dragged / drop-inside looks. */
  const row = useCallback(
    (handle: NodeHandle, depth: number) => ({
      ref: (el: HTMLElement | null) => void (el ? rows.current.set(handle, { el, depth }) : rows.current.delete(handle)),
      "data-layer-row": "",
      "data-dragging": dragging === handle ? "" : undefined,
      "data-drop-inside": indicator?.zone === "inside" && indicator.target === handle ? "" : undefined,
      style: (dragging === handle ? { opacity: 0.4 } : undefined) as CSSProperties | undefined,
      onPointerDown(e: ReactPointerEvent) {
        armed.current = handle;
        gesture.onPointerDown(e);
      },
    }),
    [dragging, indicator, gesture],
  );

  return { row, dragging, indicator };
}

/** Where the drop line sits for a before / after indicator: the row edge, indented to the depth. */
export function dropLineStyle(rowRect: { top: number; bottom: number }, ind: LayerIndicator): CSSProperties | null {
  if (ind.zone === "inside") return null;
  return { position: "absolute", left: ind.depth * 16 + 8, right: 0, top: ind.zone === "before" ? rowRect.top - 1 : rowRect.bottom - 1, height: 2 };
}
