// The selected element's handles (resize, rotate, padding, gap, delete) over the canvas frame.
/**
 * The default `NodeTools` slot: the delete strip and the handles on the selected element, and
 * the hovered element's strip (`HoverStrip`).
 * - non-container elements: edge resize (6px of the right / bottom edge, rotation-aware) and
 *   rotate (18px around the bottom-left corner; Shift snaps 15°);
 * - containers: padding zones (12px inside an edge) and resize zones (8px outside right /
 *   bottom), shown after a 400ms dwell; and the gap marker between flex children.
 * Zones are found from `pointermove` on the canvas document; a drag runs through
 * `useDragGesture` (window listeners), previews with an inline style, and ends in ONE
 * `classes.set` in the current write scopes (breakpoint + `dark:`).
 */
import { HoverStrip } from "./HoverStrip";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { NodeHandle } from "@pagehub/engine";
import { useEditorState, useEditorStore, useRunCommand } from "../../react/bindings";
import { useUi } from "../../react/useUi";
import { writeScopes } from "../../state/uiState";
import { chromeOf } from "../../shell/chromeState";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { useDragGesture } from "../../primitives/useDragGesture";
import { useCanvasFrame } from "./canvasContext";
import { toRect } from "./frameDom";
import { GAP_COOLDOWN_MS, PADDING_DWELL_MS, containerZone, edgeZone, gapAt, gapToken, gapsBetween, heightToken, paddingAfterDrag, paddingToken, projectDelta, rotateAngle, rotateDegrees, rotateToken, widthToken, type Gap, type Rect, type Side } from "./geometry";
import { useKeepInView } from "./useKeepInView";
import { useSelectionGeometry } from "./useSelectionGeometry";

export const CONTAINER_TAGS = new Set(["div", "section", "main", "header", "footer", "article", "aside", "nav", "form", "ul", "ol"]);
const NO_HANDLES = new Set(["html", "body", "head"]);

type Zone =
  | { kind: "edge"; side: "right" | "bottom" }
  | { kind: "rotate" }
  | { kind: "padding"; side: Side }
  | { kind: "resize"; side: "right" | "bottom" }
  /** `gap.x` / `gap.y` are relative to the container's box (canvas px). */
  | { kind: "gap"; gap: Gap; axis: "row" | "column" };

const px = (v: string | null | undefined) => parseFloat(v ?? "") || 0;

/** The zone under a canvas-document point for the selected element (null: none). */
function zoneAt(el: HTMLElement, tag: string, x: number, y: number, deg: number): Zone | null {
  if (NO_HANDLES.has(tag)) return null;
  const r = toRect(el.getBoundingClientRect());
  if (!CONTAINER_TAGS.has(tag)) {
    const z = edgeZone(r, x, y, deg);
    return z === "rotate" ? { kind: "rotate" } : z ? { kind: "edge", side: z } : null;
  }
  const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (cs && /flex/.test(cs.display)) {
    const axis = cs.flexDirection.startsWith("column") ? "column" : "row";
    const kids = [...el.children].filter((c) => (c as HTMLElement).offsetParent !== null || c.getBoundingClientRect().width > 0).map((c) => toRect(c.getBoundingClientRect()));
    if (kids.length >= 2) {
      const gap = gapAt(gapsBetween(kids, axis, px(axis === "row" ? cs.columnGap : cs.rowGap)), x, y);
      if (gap) return { kind: "gap", gap: { ...gap, x: gap.x - r.left, y: gap.y - r.top }, axis };
    }
  }
  const c = containerZone(r, x, y);
  return c ? (c.mode === "padding" ? { kind: "padding", side: c.side } : { kind: "resize", side: c.side as "right" | "bottom" }) : null;
}

/** The rotate cursor: Tabler's rotate-clockwise glyph turned to the element's angle. */
function rotateCursor(deg: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2"><g transform="rotate(${Math.round(deg)} 12 12)"><path d="M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, grab`;
}

/** Readout colours: padding green, resize / gap / edge blue. */
const READOUT: Record<Zone["kind"], string> = { padding: "bg-white text-[#15803d]", resize: "bg-white text-[#1d4ed8]", gap: "bg-blue-600 text-white", edge: "bg-blue-600 text-white", rotate: "bg-blue-600 text-white" };

const ZONE_CURSOR: Record<string, string> = { right: "ew-resize", left: "ew-resize", top: "ns-resize", bottom: "ns-resize" };

function zoneBox(z: Zone, r: Rect, zoom: number): CSSProperties {
  if (z.kind === "gap") {
    const size = Math.max(8, z.gap.size * zoom);
    return z.axis === "row" ? { left: r.left + z.gap.x * zoom - size / 2, top: r.top, width: size, height: r.height } : { left: r.left, top: r.top + z.gap.y * zoom - size / 2, width: r.width, height: size };
  }
  if (z.kind === "rotate") return { left: r.left - 18, top: r.bottom - 18, width: 36, height: 36, borderRadius: 18 };
  if (z.kind === "edge") return z.side === "right" ? { left: r.right - 6, top: r.top, width: 12, height: r.height } : { left: r.left, top: r.bottom - 6, width: r.width, height: 12 };
  const side = z.side;
  const thick = z.kind === "padding" ? 12 : 8;
  if (side === "right") return z.kind === "resize" ? { left: r.right, top: r.top, width: thick, height: r.height } : { left: r.right - thick, top: r.top, width: thick, height: r.height };
  if (side === "left") return { left: r.left, top: r.top, width: thick, height: r.height };
  if (side === "top") return { left: r.left, top: r.top, width: r.width, height: thick };
  return z.kind === "resize" ? { left: r.left, top: r.bottom, width: r.width, height: thick } : { left: r.left, top: r.bottom - thick, width: r.width, height: thick };
}

const ZONE_CLASS: Record<Zone["kind"], string> = {
  edge: "bg-transparent",
  rotate: "bg-transparent",
  padding: "bg-[rgba(147,196,125,.3)] hover:bg-[rgba(147,196,125,.5)]",
  resize: "bg-[rgba(59,130,246,.2)] hover:bg-[rgba(59,130,246,.4)]",
  gap: "bg-blue-500/[.18]",
};

function useZone(el: HTMLElement | null, handle: NodeHandle | null, deg: number, dragging: boolean): [Zone | null, (z: Zone | null) => void] {
  const { doc, version } = useCanvasFrame();
  const [zone, setZone] = useState<Zone | null>(null);
  const cooldown = useRef(0);
  useEffect(() => {
    if (!doc || !el || !handle || dragging) return;
    let dwell: ReturnType<typeof setTimeout> | undefined;
    const onMove = (e: PointerEvent) => {
      const found = zoneAt(el, handle.tag, e.clientX, e.clientY, deg);
      const z = found?.kind === "gap" && Date.now() < cooldown.current ? null : found;
      clearTimeout(dwell);
      if (z && (z.kind === "padding" || z.kind === "resize")) dwell = setTimeout(() => setZone(z), PADDING_DWELL_MS);
      else setZone(z);
      doc.body?.toggleAttribute("data-ph-edge", false);
      if (z?.kind === "edge") doc.body?.setAttribute("data-ph-edge", z.side);
      doc.body?.toggleAttribute("data-ph-rotate", z?.kind === "rotate");
      if (z?.kind === "rotate") doc.body?.style.setProperty("--ph-rotate-cursor", rotateCursor(deg));
    };
    doc.addEventListener("pointermove", onMove);
    return () => {
      clearTimeout(dwell);
      doc.removeEventListener("pointermove", onMove);
    };
  }, [doc, version, el, handle, deg, dragging]);
  return [zone, (z) => {
    if (!z) cooldown.current = Date.now() + GAP_COOLDOWN_MS;
    setZone(z);
  }];
}

export function NodeTools() {
  const store = useEditorStore();
  const run = useRunCommand();
  const { frame } = useCanvasFrame();
  const g = useSelectionGeometry();
  const zoom = useEditorState((s) => chromeOf(s).zoom || 1);
  const ui = useUi((u) => u);
  const el = g && !g.include ? g.elements[0]! : null;
  const handle = el ? g!.handle : null;
  const deg = useEditorState(() => (handle?.alive ? rotateDegrees(handle.classes().find((c) => /^-?rotate-/.test(c)) ?? null) : 0));
  const [dragging, setDragging] = useState(false);
  const [zone, setZone] = useZone(el, handle, deg, dragging);
  const keepReadout = useKeepInView<HTMLSpanElement>();
  const keepPill = useKeepInView<HTMLSpanElement>();
  const [readout, setReadout] = useState<string | null>(null);
  /** Rotate: the "N°" pill follows the pointer at +14px (host coordinates). */
  const [pillAt, setPillAt] = useState<{ x: number; y: number } | null>(null);
  const { host } = useCanvasFrame();
  const drag = useRef<{ zone: Zone; start: number; rect: Rect; parentWidth: number; last: { group: string; token: string | null } | null } | null>(null);

  const gesture = useDragGesture({
    onStart: () => {
      if (!el || !zone) return false;
      const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
      const r = toRect(el.getBoundingClientRect());
      const start = zone.kind === "padding" ? px(cs[`padding${zone.side[0]!.toUpperCase()}${zone.side.slice(1)}` as "paddingTop"]) : zone.kind === "gap" ? zone.gap.size : zone.kind === "rotate" ? deg : zone.side === "right" ? r.width : r.height;
      drag.current = { zone, start, rect: r, parentWidth: el.parentElement?.getBoundingClientRect().width ?? 0, last: null };
      if (frame) frame.style.pointerEvents = "none";
      setDragging(true);
    },
    onMove: (e, m) => {
      const d = drag.current;
      if (!d || !el) return;
      const dx = m.dx / zoom;
      const dy = m.dy / zoom;
      const free = e.altKey;
      const z = d.zone;
      if (z.kind === "padding") {
        const t = paddingToken(z.side, paddingAfterDrag(z.side, d.start, dx, dy));
        el.style.setProperty(`padding-${z.side}`, `${t.px}px`);
        d.last = { group: t.group, token: t.token };
        setReadout(`${t.px}px`);
      } else if (z.kind === "gap") {
        const t = gapToken(d.start + (z.axis === "row" ? dx : dy));
        el.style.gap = `${t.px}px`;
        d.last = { group: "gap", token: t.token };
        setReadout(`${t.px}px`);
      } else if (z.kind === "rotate") {
        const c = { x: d.rect.left + d.rect.width / 2, y: d.rect.top + d.rect.height / 2 };
        const f = frame!.getBoundingClientRect();
        const toFrame = (cx: number, cy: number) => ({ x: (cx - f.left) / zoom, y: (cy - f.top) / zoom });
        const a = rotateAngle(c, toFrame(m.clientX - m.dx, m.clientY - m.dy), toFrame(m.clientX, m.clientY), d.start, e.shiftKey);
        el.style.rotate = `${a}deg`;
        const hr = host?.getBoundingClientRect();
        if (hr) setPillAt({ x: m.clientX - hr.left + 14, y: m.clientY - hr.top + 14 });
        d.last = { group: "rotate", token: rotateToken(a) };
        setReadout(`${a}°`);
      } else {
        const size = Math.max(0, d.start + (z.kind === "edge" ? projectDelta(dx, dy, z.side, deg) : z.side === "right" ? dx : dy));
        const t = z.side === "right" ? widthToken(size, d.parentWidth, free) : heightToken(size, free);
        el.style.setProperty(z.side === "right" ? "width" : "height", `${t.px}px`);
        d.last = { group: z.side === "right" ? "width" : "height", token: t.token };
        setReadout(`${t.px}px`);
      }
    },
    onEnd: () => {
      const d = drag.current;
      drag.current = null;
      if (frame) frame.style.pointerEvents = "";
      setDragging(false);
      setReadout(null);
      setPillAt(null);
      if (el) for (const p of ["width", "height", "gap", "rotate", "padding-top", "padding-right", "padding-bottom", "padding-left"]) el.style.removeProperty(p);
      if (d?.last && handle?.alive) store.run("classes.set", { group: d.last.group, token: d.last.token, scopes: writeScopes(ui), at: handle });
      setZone(null);
    },
  });

  if (!g || !frame)
    return (
      <div data-slot="NodeTools" className="pointer-events-none absolute inset-0">
        <HoverStrip />
      </div>
    );
  const r = g.rect;
  return (
    <div data-slot="NodeTools" className="pointer-events-none absolute inset-0">
      <HoverStrip />
      {zone && (
        <div
          data-zone={zone.kind}
          data-zone-side={"side" in zone ? zone.side : zone.kind === "gap" ? zone.axis : undefined}
          className={`pointer-events-auto absolute z-30 ${dragging && zone.kind === "gap" ? "bg-blue-500/[.35]" : ZONE_CLASS[zone.kind]}`}
          style={{ ...zoneBox(zone, r, zoom), cursor: zone.kind === "gap" ? (zone.axis === "row" ? "ew-resize" : "ns-resize") : zone.kind === "rotate" ? "var(--ph-rotate-cursor, grab)" : ZONE_CURSOR[zone.side] }}
          onPointerDown={gesture.onPointerDown}
        >
          {zone.kind === "gap" && <div className="absolute top-1/2 left-1/2 h-0.5 w-5 -translate-x-1/2 -translate-y-1/2 bg-blue-500" />}
          {zone.kind === "edge" && (
            <>
              <div data-edge-line="" className={`absolute bg-blue-500 ${zone.side === "right" ? "top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2" : "right-0 left-0 top-1/2 h-0.5 -translate-y-1/2"}`} />
              <div data-edge-dot="" className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-500 bg-white" />
              {!readout && (
                <span ref={keepPill} data-edge-pill="" className="absolute top-1/2 left-full ml-1 -translate-y-1/2 rounded bg-blue-600 px-1.5 text-[10px] whitespace-nowrap text-white">
                  {Math.round((zone.side === "right" ? r.width : r.height) / zoom)}px
                </span>
              )}
            </>
          )}
        </div>
      )}
      {readout && zone && (
        <span ref={keepReadout} data-handle-readout="" className={`absolute z-50 rounded px-1.5 text-[10px] font-medium shadow-sm ${READOUT[zone.kind]}`} style={pillAt ? { left: pillAt.x, top: pillAt.y } : { left: r.right + 6, top: r.bottom + 6 }}>
          {readout}
        </span>
      )}
    </div>
  );
}

