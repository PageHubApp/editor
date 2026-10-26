// Drag and drop on the canvas, driven by a pointer gesture over the source-text core.
/**
 * Drag and drop on the canvas. Mounted once in the canvas overlay layer, it
 * - registers the canvas as the session's drop surface (plans from the pointer, drops by
 *   running the plan's command: one transaction);
 * - starts a move drag from a primary-button press on a rendered element (4px threshold; the
 *   whole element is the handle). Pages (`<main>`), footers and `drag`-locked elements don't
 *   drag. The gesture runs on window listeners (`useDragGesture`); while it runs the frame
 *   ignores the pointer and its own pointer events are forwarded to the host window, so a
 *   release anywhere ends it, and a release outside the canvas drops nothing;
 * - Shift at the start or at any time during the drag → copy (pointer moves or `keydown`; it stays a copy);
 * - stamps the drag flags and preview on the canvas document, and suppresses hover.
 */
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { type NodeHandle } from "@pagehub/engine";
import { editSrcOf } from "@pagehub/engine/canvas";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { useDragGesture } from "../../primitives/useDragGesture";
import { useCanvasFrame } from "../canvas/canvasContext";
import { canvasPage, selectTarget } from "../canvas/canvasState";
import { elementsFor, framePoint, srcOf, toRect } from "../canvas/frameDom";
import { roleOf } from "@pagehub/engine/kits"; import { locked } from "@pagehub/engine/kits"; import { clearDragFlags, clearPreview, movePreview, setCopyFlag, setDragFlags, showPreview } from "./dragFlags";
import { dragSessionOf, type DragState } from "./dragSession";
import { DropIndicator } from "./DropIndicator";
import { planDrop } from "./dropPlan";
import type { BesideMemo } from "./geometry";

/** Pixels before a press on an element becomes a drag. */
export const DRAG_THRESHOLD = 4;
const EDITABLE = "input, textarea, select, [contenteditable=''], [contenteditable='true'], .ProseMirror";
const NEW_SIZE = { width: 120, height: 40 };

const isDraggable = (h: NodeHandle | null): h is NodeHandle => !!h && h.alive && h.kind === "element" && roleOf(h) !== "page" && h.tag !== "footer" && !locked(h, "drag");

export function CanvasDnd() {
  const store = useEditorStore();
  const session = dragSessionOf(store);
  const { frame, doc, version, host } = useCanvasFrame();
  const zoom = useEditorState((s) => chromeOf(s).zoom || 1);
  const preview = useEditorState((s) => chromeOf(s).preview);
  const live = useRef({ frame, doc, zoom, host });
  live.current = { frame, doc, zoom, host };
  const memo = useRef<BesideMemo>({ key: "", side: null });
  const pending = useRef<{ handle: NodeHandle; x: number; y: number; shift: boolean } | null>(null);

  // the canvas as the drop surface
  useEffect(() => {
    const toFrame = (x: number, y: number) => framePoint(live.current.frame!, live.current.zoom, x, y);
    session.surface = {
      plan(s: DragState) {
        const { frame: f, doc: d } = live.current;
        const page = canvasPage(store.state);
        if (!f || !d || !page) return null;
        const fr = f.getBoundingClientRect();
        if (s.pointer.x < fr.left || s.pointer.x > fr.right || s.pointer.y < fr.top || s.pointer.y > fr.bottom) return null;
        const p = toFrame(s.pointer.x, s.pointer.y);
        const hostDoc = live.current.host?.ownerDocument;
        if (hostDoc) movePreview(hostDoc, s.pointer.x, s.pointer.y);
        setCopyFlag(d, s.copy);
        const src = s.source.kind === "existing" ? s.source.handles[0] : null;
        const el = src ? elementsFor(d, editSrcOf(src))[0] : null;
        const r = el?.getBoundingClientRect();
        return planDrop({ store, doc: d, source: s.source, ...p, origin: toFrame(s.origin.x, s.origin.y), copy: s.copy, memo: memo.current, page, size: r ? { width: r.width, height: r.height } : NEW_SIZE });
      },
      drop: (plan) => store.run(plan.command, plan.args),
      started(s) {
        const { doc: d, frame: f, host: hostEl, zoom: z } = live.current;
        const hostDoc = hostEl?.ownerDocument;
        memo.current = { key: "", side: null };
        if (f) f.style.pointerEvents = "none";
        store.run("canvas.hover", { src: null });
        if (s.source.kind === "existing") {
          if (!d) return;
          const els = s.source.handles.flatMap((h) => elementsFor(d, editSrcOf(h)));
          const el = els[0];
          // Measure + clone before the drag flags flatten the source. The preview is `fixed` in the
          // host document, so everything is viewport coords: the element's viewport box is the frame
          // offset plus its canvas rect times the zoom (same mapping as the host(e) press point).
          if (el && hostDoc && f) {
            const fr = f.getBoundingClientRect();
            const r = toRect(el.getBoundingClientRect());
            const left = fr.left + r.left * z;
            const top = fr.top + r.top * z;
            showPreview(hostDoc, el, { width: r.width * z, height: r.height * z, scale: z, grabX: s.origin.x - left, grabY: s.origin.y - top });
          }
          const h = s.source.handles[0]!;
          setDragFlags(d, els, roleOf(h) ?? h.tag);
          setCopyFlag(d, s.copy);
        } else if (s.source.preview && hostDoc) {
          // A panel tile / block card: clone it 1:1 as the cursor-following preview.
          const t = s.source.preview.getBoundingClientRect();
          showPreview(hostDoc, s.source.preview, { width: t.width, height: t.height, scale: 1, grabX: s.origin.x - t.left, grabY: s.origin.y - t.top });
        }
        if (hostDoc) movePreview(hostDoc, s.origin.x, s.origin.y);
      },
      ended() {
        if (live.current.frame) live.current.frame.style.pointerEvents = "";
        if (live.current.doc) clearDragFlags(live.current.doc);
        const hostDoc = live.current.host?.ownerDocument;
        if (hostDoc) clearPreview(hostDoc);
      },
    };
    return () => {
      if (session.get()) session.end(false);
      session.surface = null;
    };
  }, [session, store]);

  const gesture = useDragGesture({
    threshold: DRAG_THRESHOLD,
    onMove(e, m) {
      const p = pending.current;
      if (p && Math.hypot(m.dx, m.dy) >= DRAG_THRESHOLD) {
        pending.current = null;
        session.start({ kind: "existing", handles: [p.handle] }, p.x, p.y, p.shift || e.shiftKey);
      }
      if (session.get()) session.move(m.clientX, m.clientY, e.shiftKey);
    },
    onEnd(e) {
      pending.current = null;
      if (!session.get()) return;
      if (e) session.move(e.clientX, e.clientY, e.shiftKey);
      session.end(!!e);
    },
  });

  // a press on a rendered element arms a drag; the frame's own pointer events reach the window
  useEffect(() => {
    if (!doc || !frame || !version || preview) return;
    const win = doc.defaultView;
    const host = (e: PointerEvent | MouseEvent) => {
      const f = frame.getBoundingClientRect();
      const z = live.current.zoom;
      return { x: f.left + e.clientX * z, y: f.top + e.clientY * z };
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as Element).closest?.(EDITABLE)) return;
      const h = selectTarget(store, srcOf(e.target as Element));
      if (!isDraggable(h)) return;
      const p = host(e);
      pending.current = { handle: h, ...p, shift: e.shiftKey };
      gesture.onPointerDown({ button: 0, clientX: p.x, clientY: p.y } as ReactPointerEvent);
    };
    const forward = (e: PointerEvent) => {
      if (!pending.current && !session.get()) return;
      const p = host(e);
      const Ctor = (window.PointerEvent ?? window.MouseEvent) as typeof PointerEvent;
      window.dispatchEvent(new Ctor(e.type, { clientX: p.x, clientY: p.y, buttons: e.buttons, button: e.button, shiftKey: e.shiftKey }));
    };
    // A press inside the iframe would move focus into it and blur the host window, which the drag
    // gesture reads as "end" (its blur handler) — killing every canvas drag before the first move.
    // Preventing the mousedown default keeps focus on the host (selection still runs: it is a
    // separate listener, unaffected by preventDefault). Editable targets keep their caret.
    const onMouseDownFocus = (e: MouseEvent) => void (e.button === 0 && !(e.target as Element).closest?.(EDITABLE) && e.preventDefault());
    doc.addEventListener("pointerdown", onDown);
    doc.addEventListener("mousedown", onMouseDownFocus);
    for (const t of ["pointermove", "pointerup", "pointercancel"]) win?.addEventListener(t, forward as EventListener);
    return () => {
      doc.removeEventListener("pointerdown", onDown);
      doc.removeEventListener("mousedown", onMouseDownFocus);
      for (const t of ["pointermove", "pointerup", "pointercancel"]) win?.removeEventListener(t, forward as EventListener);
    };
  }, [doc, frame, version, preview, store, session, gesture.onPointerDown]);

  // Shift pressed during a drag switches it to copy
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => void (e.key === "Shift" && session.get() && session.setCopy(true));
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

  return <DropIndicator />;
}
