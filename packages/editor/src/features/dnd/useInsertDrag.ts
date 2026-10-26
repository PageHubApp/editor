// The insert panel's drag source: a toolbox tile or block card that starts a canvas drop session.
/**
 * The insert panel's drag source: a toolbox tile or a block card. A press turns the tile accent
 * (`pressed`); past 4px it starts a session with the new markup, and the canvas plans and
 * drops it through the same path as a canvas drag (`element.insert { …, to }`, smart defaults
 * included: `automatic` for the Automatic element). Release off the canvas inserts nothing.
 * A card whose markup hasn't arrived (`ready` false) still starts the session, so the pointer keeps
 * reaching the window over the canvas; the markup is swapped in once it arrives, and a release before
 * that cancels the drop.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { InsertArgs } from "@pagehub/engine/kits";
import { useEditorStore } from "../../react/bindings";
import { useDragGesture } from "../../primitives/useDragGesture";
import { DRAG_THRESHOLD } from "./CanvasDnd";
import { dragSessionOf } from "./dragSession";

export function useInsertDrag(insert: InsertArgs, label?: string, ready = true): { onPointerDown(e: ReactPointerEvent): void; pressed: boolean } {
  const session = dragSessionOf(useEditorStore());
  const [pressed, setPressed] = useState(false);
  const from = useRef({ x: 0, y: 0 });
  // The pressed tile / card, cloned as the cursor-following preview.
  const tile = useRef<HTMLElement | null>(null);
  const gesture = useDragGesture({
    threshold: DRAG_THRESHOLD,
    onStart(e) {
      from.current = { x: e.clientX, y: e.clientY };
      tile.current = e.currentTarget as HTMLElement;
      setPressed(true);
    },
    onMove(e, m) {
      if (!session.get() && Math.hypot(m.dx, m.dy) >= DRAG_THRESHOLD) session.start({ kind: "new", insert, label, preview: tile.current ?? undefined }, from.current.x, from.current.y, false);
      if (ready) session.setInsert(insert);
      if (session.get()) session.move(m.clientX, m.clientY, e.shiftKey);
    },
    onEnd(e) {
      setPressed(false);
      if (!session.get()) return;
      if (ready) session.setInsert(insert);
      if (e) session.move(e.clientX, e.clientY, e.shiftKey);
      session.end(!!e && ready);
    },
  });
  return { onPointerDown: gesture.onPointerDown, pressed };
}
