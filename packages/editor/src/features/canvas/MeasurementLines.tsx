// The Alt-hover measurement overlay: red distance lines and labels.
/**
 * Hold Alt and hover an element: red distance lines to its parent's edges and nearby siblings.
 * Releasing Alt, blurring the window, or dragging clears them. Drawn in the overlay layer; the
 * rects come from the canvas document and are mapped through the frame offset and zoom.
 */
import { useEffect, useState } from "react";
import { editSrcOf } from "@pagehub/engine/canvas";
import { useEditorState } from "../../react/bindings";
import { chromeOf } from "../../shell/chromeState";
import { useCanvasFrame } from "./canvasContext";
import { SRC_ATTR, elementsFor, hostRect, toRect } from "./frameDom";
import { measureLines, type MeasureLine } from "./measure";
import { useCanvasScrollSync } from "./useSelectionGeometry";

const RED = "#ef4444";

/** Whether Alt is held, in the host page or inside the canvas frame; cleared on blur. */
function useAltHeld(frame: Document | null): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const wins = [window, frame?.defaultView].filter((w): w is Window & typeof globalThis => !!w);
    const key = (e: Event) => setHeld((e as KeyboardEvent).altKey);
    const off = () => setHeld(false);
    for (const w of wins) {
      w.addEventListener("keydown", key);
      w.addEventListener("keyup", key);
      w.addEventListener("blur", off);
    }
    return () => {
      for (const w of wins) {
        w.removeEventListener("keydown", key);
        w.removeEventListener("keyup", key);
        w.removeEventListener("blur", off);
      }
    };
  }, [frame]);
  return held;
}

const marked = (el: Element): HTMLElement | null => (el.hasAttribute(SRC_ATTR) ? (el as HTMLElement) : el.querySelector<HTMLElement>(`[${SRC_ATTR}]`));

export function MeasurementLines() {
  const { doc, frame, host, version } = useCanvasFrame();
  const hover = useEditorState((s) => (s.selection.hover?.alive ? s.selection.hover : null));
  const zoom = useEditorState((s) => chromeOf(s).zoom || 1);
  const alt = useAltHeld(doc);
  useCanvasScrollSync();
  if (!alt || !hover || !doc || !frame || !host || !version || doc.body?.hasAttribute("data-is-dragging")) return null;
  const el = elementsFor(doc, editSrcOf(hover))[0];
  if (!el) return null;
  const parent = el.parentElement?.closest<HTMLElement>(`[${SRC_ATTR}]`) ?? null;
  const siblings = parent ? [...parent.children].filter((c) => c !== el).map(marked).filter((c): c is HTMLElement => !!c && c !== el) : [];
  const rect = (n: Element) => toRect(n.getBoundingClientRect());
  const lines = measureLines(rect(el), parent && parent.tagName !== "HTML" && parent.tagName !== "BODY" ? rect(parent) : null, siblings.map(rect));
  if (!lines.length) return null;
  // canvas-document coordinates → the overlay layer (a zero-size rect carries the point through)
  const at = (x: number, y: number) => {
    const r = hostRect(toRect({ left: x, top: y, width: 0, height: 0 }), frame, host, zoom);
    return { x: r.left, y: r.top };
  };
  return (
    <svg data-measurement-lines="" aria-hidden className="pointer-events-none absolute inset-0 z-40 size-full overflow-visible">
      {lines.map((l, i) => (
        <Line key={i} line={l} at={at} />
      ))}
    </svg>
  );
}

function Line({ line: l, at }: { line: MeasureLine; at(x: number, y: number): { x: number; y: number } }) {
  const a = at(l.x1, l.y1);
  const b = at(l.x2, l.y2);
  const c = at(l.labelX, l.labelY);
  const cap = l.direction === "horizontal" ? [[0, -4, 0, 4]] : [[-4, 0, 4, 0]];
  return (
    <g data-measure={l.direction} data-distance={l.distance}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={RED} strokeWidth={1} />
      {[a, b].flatMap((p, i) => cap.map(([x1, y1, x2, y2], j) => <line key={`${i}${j}`} x1={p.x + x1!} y1={p.y + y1!} x2={p.x + x2!} y2={p.y + y2!} stroke={RED} strokeWidth={1} />))}
      <rect x={c.x - 18} y={c.y - 8} width={36} height={16} rx={2} fill="rgba(255,255,255,0.95)" stroke={RED} />
      <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600} fill={RED}>
        {l.distance}px
      </text>
    </g>
  );
}
