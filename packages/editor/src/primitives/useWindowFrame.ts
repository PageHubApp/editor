/**
 * Position and size of a floating window: drag by a handle, resize by edge handles. Both run on
 * `useDragGesture` (window listeners), so a release over an iframe or outside the window still
 * ends the gesture — it ends on cancel, blur and a buttonless move, not just `pointerup` (which
 * would otherwise leave the panel resizing with no button held).
 */
import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { clamp } from "./math";
import { readJSON, writeJSON } from "./storage";
import { useDragGesture } from "./useDragGesture";

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}

/** Drag the window by a handle; kept `inset` px inside the browser window. Not persisted. */
export function useDraggableWindow(initial: Point, inset = 12) {
  const [position, setPosition] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const windowRef = useRef<HTMLDivElement | null>(null);
  const start = useRef(initial);
  const { onPointerDown } = useDragGesture({
    onStart(e) {
      // buttons inside the handle (close) don't start a drag
      if ((e.target as HTMLElement).closest("button")) return false;
      e.preventDefault();
      start.current = position;
      setDragging(true);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    },
    onMove(_e, m) {
      const rect = windowRef.current?.getBoundingClientRect();
      const maxX = window.innerWidth - (rect?.width ?? 0) - inset;
      const maxY = window.innerHeight - (rect?.height ?? 0) - inset;
      setPosition({ x: Math.max(inset, Math.min(maxX, start.current.x + m.dx)), y: Math.max(inset, Math.min(maxY, start.current.y + m.dy)) });
    },
    onEnd() {
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
  });
  return { position, setPosition, dragging, windowRef, onHandlePointerDown: onPointerDown };
}

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const CURSOR: Record<ResizeEdge, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };
const H = 8;
const C = 14;
const EDGE_STYLE: Record<ResizeEdge, CSSProperties> = {
  n: { top: -H / 2, left: C, right: C, height: H },
  s: { bottom: -H / 2, left: C, right: C, height: H },
  e: { right: -H / 2, top: C, bottom: C, width: H },
  w: { left: -H / 2, top: C, bottom: C, width: H },
  ne: { top: -H / 2, right: -H / 2, width: C, height: C },
  nw: { top: -H / 2, left: -H / 2, width: C, height: C },
  se: { bottom: -H / 2, right: -H / 2, width: C, height: C },
  sw: { bottom: -H / 2, left: -H / 2, width: C, height: C },
};

interface ResizableOptions {
  /** Persists as `resizable-<storageKey>` unless `persist` is false. */
  storageKey: string;
  initial: Size;
  min: Size;
  max: Size;
  edges: readonly ResizeEdge[];
  persist: boolean;
  /** Edges on the north / west side move the origin: called with the shift to apply. */
  onOriginShift?(dx: number, dy: number): void;
}

export function useResizable({ storageKey, initial, min, max, edges, persist, onOriginShift }: ResizableOptions) {
  const clampSize = useCallback(
    (w: number, h: number): Size => ({
      width: clamp(Math.round(w), Math.min(min.width, max.width), max.width),
      height: clamp(Math.round(h), Math.min(min.height, max.height), max.height),
    }),
    [min.width, min.height, max.width, max.height],
  );
  const [stored] = useState(() => (persist ? readJSON<Size | null>(`resizable-${storageKey}`, null) : null));
  const [size, setSizeState] = useState<Size>(() => (stored ? clampSize(stored.width, stored.height) : initial));
  const [resizing, setResizing] = useState(false);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const drag = useRef<{ edge: ResizeEdge; from: Size; shifted: Point } | null>(null);

  const setSize = useCallback((next: Size) => setSizeState((p) => (p.width === next.width && p.height === next.height ? p : next)), []);

  const gesture = useDragGesture({
    onStart(e) {
      e.preventDefault();
      e.stopPropagation();
      setResizing(true);
      document.body.style.userSelect = "none";
    },
    onMove(_e, m) {
      const d = drag.current;
      if (!d) return;
      const { edge, from } = d;
      const w = edge.includes("e") ? from.width + m.dx : edge.includes("w") ? from.width - m.dx : from.width;
      const h = edge.includes("s") ? from.height + m.dy : edge.includes("n") ? from.height - m.dy : from.height;
      const next = clampSize(w, h);
      const shift = { x: edge.includes("w") ? from.width - next.width : 0, y: edge.includes("n") ? from.height - next.height : 0 };
      if (shift.x !== d.shifted.x || shift.y !== d.shifted.y) onOriginShift?.(shift.x - d.shifted.x, shift.y - d.shifted.y);
      d.shifted = shift;
      sizeRef.current = next;
      setSize(next);
    },
    onEnd() {
      drag.current = null;
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (persist) writeJSON(`resizable-${storageKey}`, sizeRef.current);
    },
  });

  const handles = edges.map((edge) => ({
    edge,
    style: { position: "absolute", cursor: CURSOR[edge], ...EDGE_STYLE[edge] } as CSSProperties,
    onPointerDown(e: ReactPointerEvent) {
      drag.current = { edge, from: sizeRef.current, shifted: { x: 0, y: 0 } };
      document.body.style.cursor = CURSOR[edge];
      gesture.onPointerDown(e);
    },
  }));

  return { size, setSize, resizing, handles, hasStoredSize: stored !== null };
}
